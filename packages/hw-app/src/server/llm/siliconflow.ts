import OpenAI from "openai";
import type { OcrResult, SolveResult } from "./types.js";

const SILICONFLOW_BASE_URL = "https://api.siliconflow.cn/v1";

export function createSiliconFlowClient(apiKey: string): OpenAI {
	return new OpenAI({
		apiKey,
		baseURL: SILICONFLOW_BASE_URL,
	});
}

const OCR_PROMPT = `You are a homework question parser. Given an image of a homework problem, extract all text, diagrams, and mathematical formulas. Output in Markdown format following these rules:
- Text content in plain Markdown
- Mathematical formulas in LaTeX: inline as $...$, block as $$...$$
- Images/diagrams extracted and embedded as ![图N](data:image/...) using base64
- Preserve the structure: separate 题目(statement) from 问题(question) if clearly demarcated
- Output ONLY the parsed Markdown, no additional commentary`;

const SOLVE_PROMPT = `You are a patient math and science tutor. A homework problem is provided below. Solve it step by step, showing your reasoning clearly.

Format your response as:
**答案**: [final answer in brief]
**解题过程**: [step-by-step reasoning, each step clearly numbered]`;

/**
 * OCR image using zai-org/GLM-4.6V via Chat Completions API.
 * Supports both image URLs and base64 data URLs.
 */
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
	return { markdown: text };
}

/**
 * Solve question using DeepSeek-R1.
 * IMPORTANT: DeepSeek-R1 is a text-only model. We send only the markdown
 * (already extracted by OCR) — no image data.
 *
 * DeepSeek-R1 returns both reasoning_content (think process) and content (final answer).
 * We use the reasoning_content field for the step-by-step reasoning.
 */
export async function solveQuestion(client: OpenAI, markdown: string): Promise<SolveResult> {
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
