export interface SolveResult {
	answer: string;
	reasoning: string;
}

export type ImageRole = "illustration" | "diagram" | "table" | "formula";
export type LayoutHint = "inline-left" | "block" | "full-width";

// ---------- OCR stage: raw blocks with bbox ----------

export interface OcrImageBlock {
	type: "image";
	bbox: { x: number; y: number; width: number; height: number };
	role: ImageRole;
	description: string; // required, 20 chars or fewer Chinese description
	groupId?: string;
	layoutHint: LayoutHint;
}

export type OcrBlock = { type: "text"; text: string; groupId?: string } | OcrImageBlock;

// ---------- Review stage: blocks with cropped imageDataUrl ----------

export interface ReviewImageBlock {
	type: "image";
	imageDataUrl: string;
	role: ImageRole;
	description: string;
	groupId?: string;
	layoutHint: LayoutHint;
}

export type ReviewBlock = { type: "text"; text: string; groupId?: string } | ReviewImageBlock;

// ---------- result types ----------

export interface OcrResult {
	blocks: ReviewBlock[]; // always at least one block; fallback is [{ type: "text", text: rawMarkdown }]
	markdown: string; // contains [Image N: description] markers, no base64
}
