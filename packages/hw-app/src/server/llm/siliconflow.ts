import OpenAI from "openai";
import sharp from "sharp";
import type { ImageRole, LayoutHint, OcrBlock, OcrResult, ReviewBlock } from "./types.js";

const SILICONFLOW_BASE_URL = "https://api.siliconflow.cn/v1";

export function createSiliconFlowClient(apiKey: string): OpenAI {
	return new OpenAI({
		apiKey,
		baseURL: SILICONFLOW_BASE_URL,
	});
}

const OCR_PROMPT = `You are a homework question parser. Given an image of a homework problem, extract all content in reading order.

Output a JSON array. Each element is either a text block or an image block:

Text block: { "type": "text", "text": "recognized text here", "groupId": "optional-id" }
Image block: { "type": "image", "bbox": { "x": 0, "y": 0, "width": 100, "height": 80 }, "role": "illustration", "description": "brief Chinese description under 20 chars", "groupId": "optional-id", "layoutHint": "inline-left" }

Rules:
- Output ONLY the JSON array, no markdown, no explanation
- Keep reading order
- For text: output exactly what you see
- For images/diagrams: output bbox in pixel coordinates based on the original image (not percentages)
- role: use "illustration" for pictures, "diagram" for technical drawings, "table" for tables, "formula" for math formulas
- layoutHint: use "inline-left" for small inline pictures beside text; use "block" for medium figures; use "full-width" for large diagrams, tables, or formula images
- description: brief Chinese description (under 20 chars) helpful for understanding the image context
- groupId: assign the same groupId to text and image blocks that belong to the same question item; omit if no related text
- If unsure about bbox, make it slightly larger rather than cutting off content
- Never generate base64 or image data`;

const SOLVE_PROMPT = `You are a patient math and science tutor. A homework problem is provided below. Solve it step by step, showing your reasoning clearly.

Format your response as:
**答案**: [final answer in brief]
**解题过程**: [step-by-step reasoning, each step clearly numbered]`;

// ---------- JSON extraction ----------

/**
 * Extracts the first JSON array from model output.
 * Priority: JSON code fence → bracket scan.
 * Returns null if no valid array found.
 */
function extractJsonArray(text: string): OcrBlock[] | null {
	// --- Try fenced JSON first ---
	const fenceMatch = text.match(/```json\s*([\s\S]*?)```/i);
	if (fenceMatch) {
		const jsonString = fenceMatch[1].trim();
		try {
			const parsed = JSON.parse(jsonString);
			if (Array.isArray(parsed)) {
				return parsed as OcrBlock[];
			}
		} catch {
			// fence matched but invalid JSON — fall through to bracket scan
		}
	}

	// --- Fallback: bracket scan ---
	const firstBracket = text.indexOf("[");
	const lastBracket = text.lastIndexOf("]");

	if (firstBracket === -1 || lastBracket === -1 || lastBracket <= firstBracket) {
		return null;
	}

	const jsonString = text.slice(firstBracket, lastBracket + 1);

	try {
		const parsed = JSON.parse(jsonString);
		if (Array.isArray(parsed)) {
			return parsed as OcrBlock[];
		}
		return null;
	} catch {
		return null;
	}
}

// ---------- block validation ----------

const VALID_ROLES: ImageRole[] = ["illustration", "diagram", "table", "formula"];
const VALID_LAYOUTS: LayoutHint[] = ["inline-left", "block", "full-width"];

/**
 * Validates an OcrBlock shape.
 * Returns null if the block is invalid (blocks the crop pipeline).
 */
function validateOcrBlock(block: unknown): OcrBlock | null {
	if (!block || typeof block !== "object") return null;

	const b = block as Record<string, unknown>;

	if (b.type === "text") {
		if (typeof b.text !== "string") return null;
		return { type: "text", text: b.text, groupId: typeof b.groupId === "string" ? b.groupId : undefined };
	}

	if (b.type === "image") {
		const bbox = b.bbox as Record<string, unknown> | undefined;
		if (
			typeof b.description !== "string" ||
			b.description.length === 0 ||
			!VALID_ROLES.includes(b.role as ImageRole) ||
			!VALID_LAYOUTS.includes(b.layoutHint as LayoutHint) ||
			!bbox ||
			typeof bbox.x !== "number" ||
			!Number.isFinite(bbox.x) ||
			typeof bbox.y !== "number" ||
			!Number.isFinite(bbox.y) ||
			typeof bbox.width !== "number" ||
			!Number.isFinite(bbox.width) ||
			typeof bbox.height !== "number" ||
			!Number.isFinite(bbox.height)
		) {
			return null;
		}

		return {
			type: "image",
			bbox: {
				x: bbox.x,
				y: bbox.y,
				width: bbox.width,
				height: bbox.height,
			},
			role: b.role as ImageRole,
			description: b.description as string,
			groupId: typeof b.groupId === "string" ? b.groupId : undefined,
			layoutHint: b.layoutHint as LayoutHint,
		};
	}

	return null;
}

// ---------- image cropping ----------

/**
 * Crop images from the original photo based on OCR bboxes.
 * Outputs compressed JPEG data URLs.
 * bbox padding is calculated via right/bottom coordinates to avoid edge arithmetic errors.
 */
async function cropImageBlocks(imageDataUrl: string, blocks: OcrBlock[]): Promise<ReviewBlock[]> {
	// 1. Parse data URL → Buffer
	const match = imageDataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
	if (!match) {
		throw new Error("Invalid data URL format");
	}
	const buffer = Buffer.from(match[2], "base64");

	// 2. Get image dimensions
	const metadata = await sharp(buffer).metadata();
	const imgWidth = metadata.width ?? 0;
	const imgHeight = metadata.height ?? 0;

	if (imgWidth === 0 || imgHeight === 0) {
		throw new Error("Could not read image dimensions");
	}

	const results: ReviewBlock[] = [];

	for (const block of blocks) {
		if (block.type === "text") {
			results.push({ type: "text", text: block.text, groupId: block.groupId });
		} else {
			const bbox = block.bbox;

			// 3. Integer-clamp: left/top floor, right/bottom ceil
			const left = Math.max(0, Math.floor(bbox.x));
			const top = Math.max(0, Math.floor(bbox.y));
			const right = Math.min(imgWidth, Math.ceil(bbox.x + bbox.width));
			const bottom = Math.min(imgHeight, Math.ceil(bbox.y + bbox.height));
			const width = right - left;
			const height = bottom - top;

			if (width <= 0 || height <= 0) {
				// bbox completely out of bounds — skip this image block
				continue;
			}

			// 4. Add 6px padding via right/bottom coordinates
			const padLeft = Math.max(0, left - 6);
			const padTop = Math.max(0, top - 6);
			const padRight = Math.min(imgWidth, right + 6);
			const padBottom = Math.min(imgHeight, bottom + 6);
			const padWidth = padRight - padLeft;
			const padHeight = padBottom - padTop;

			if (padWidth <= 0 || padHeight <= 0) continue;

			// 5. Crop with sharp, output JPEG (quality 82 — effective for photos)
			const croppedBuffer = await sharp(buffer)
				.extract({ left: padLeft, top: padTop, width: padWidth, height: padHeight })
				.jpeg({ quality: 82 })
				.toBuffer();

			const croppedDataUrl = `data:image/jpeg;base64,${croppedBuffer.toString("base64")}`;

			results.push({
				type: "image",
				imageDataUrl: croppedDataUrl,
				role: block.role,
				description: block.description,
				groupId: block.groupId,
				layoutHint: block.layoutHint,
			});
		}
	}

	return results;
}

// ---------- markdown generation ----------

/**
 * Generate a text-only markdown for the solve endpoint.
 * Images become [Image N: description] markers.
 */
function generateMarkdown(blocks: ReviewBlock[]): string {
	let markdown = "";
	let imageIndex = 0;

	for (const block of blocks) {
		if (block.type === "text") {
			markdown += block.text + "\n\n";
		} else {
			imageIndex++;
			markdown += "[Image " + imageIndex + ": " + block.description + "]\n\n";
		}
	}

	return markdown.trim();
}

// ---------- OCR ----------

export async function ocrImage(client: OpenAI, imageDataUrl: string): Promise<OcrResult> {
	const response = await client.chat.completions.create({
		model: "zai-org/GLM-4.6V",
		messages: [
			{
				role: "user",
				content: [
					{ type: "text", text: OCR_PROMPT },
					{
						type: "image_url",
						image_url: { url: imageDataUrl },
					},
				],
			},
		],
		max_tokens: 4096,
	});

	const text = response.choices[0]?.message?.content ?? "";

	// --- Step A: Try to parse JSON ---
	const parsedBlocks = extractJsonArray(text);
	if (!parsedBlocks) {
		return { blocks: [{ type: "text", text }], markdown: text };
	}

	// --- Step B: Validate every block ---
	const validBlocks = parsedBlocks.map(validateOcrBlock).filter(Boolean) as OcrBlock[];
	if (validBlocks.length === 0) {
		return { blocks: [{ type: "text", text }], markdown: text };
	}

	// --- Step C: Try to crop images (may fail for corrupt bboxes) ---
	let reviewBlocks: ReviewBlock[];
	try {
		reviewBlocks = await cropImageBlocks(imageDataUrl, validBlocks);
	} catch {
		// crop failed — return text-only fallback, no 502
		return { blocks: [{ type: "text", text }], markdown: text };
	}

	const markdown = generateMarkdown(reviewBlocks);
	return { blocks: reviewBlocks, markdown };
}

// ---------- Solve ----------

/**
 * Solve question using DeepSeek-R1.
 * IMPORTANT: DeepSeek-R1 is a text-only model. We send only the markdown
 * (already extracted by OCR) — no image data.
 *
 * DeepSeek-R1 returns both reasoning_content (think process) and content (final answer).
 * We use the reasoning_content field for the step-by-step reasoning.
 */
export async function solveQuestion(client: OpenAI, markdown: string) {
	const response = await client.chat.completions.create({
		model: "deepseek-ai/DeepSeek-R1",
		messages: [
			{
				role: "user",
				content: `${SOLVE_PROMPT}\n\n下面是题目：\n\n${markdown}`,
			},
		],
		max_tokens: 4096,
	});

	const message = response.choices[0]?.message ?? {};

	// DeepSeek-R1 puts thinking in reasoning_content, final answer in content
	const reasoningContent = (message as unknown as Record<string, string>).reasoning_content ?? "";
	const text = message.content ?? "";

	// Parse structured response from content
	const answerMatch = text.match(/\*\*答案\*\*:\s*([\s\S]+?)(?=\*\*解题过程\*\*:|$)/);
	const reasoningMatch = text.match(/\*\*解题过程\*\*:\s*([\s\S]+?)$/);

	const rawAnswer = answerMatch?.[1]?.trim() ?? "";
	const parsedReasoning = reasoningMatch?.[1]?.trim() ?? reasoningContent;

	// If parsing failed, return a safe error indicator
	// Do NOT fall back to raw markdown — it would be rendered as broken KaTeX
	if (!rawAnswer) {
		return {
			answer: "⚠️ 答案解析失败，请重试",
			reasoning: parsedReasoning || "⚠️ 解题过程解析失败，请重试",
		};
	}

	return {
		answer: rawAnswer,
		reasoning: parsedReasoning,
	};
}
