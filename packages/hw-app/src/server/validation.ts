import { z } from "zod";

export const OcrRequestSchema = z.object({
	image: z.string().min(1, "image is required"),
});

export const SolveRequestSchema = z.object({
	sessionId: z.string().uuid().optional(),
	markdown: z.string().min(1, "markdown is required"),
});

export type OcrRequest = z.infer<typeof OcrRequestSchema>;
export type SolveRequest = z.infer<typeof SolveRequestSchema>;

/**
 * Parses and validates the raw request body.
 * Throws a Zod error with friendly message if invalid.
 */
export function parseOcrRequest(body: unknown): OcrRequest {
	return OcrRequestSchema.parse(body);
}

export function parseSolveRequest(body: unknown): SolveRequest {
	return SolveRequestSchema.parse(body);
}
