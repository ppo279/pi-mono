import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { APIError } from "openai";
import { createSiliconFlowClient, ocrImage } from "../llm/siliconflow.js";
import { parseOcrRequest } from "../validation.js";

const app = new Hono();

app.post("/", async (c) => {
	const apiKey = process.env.SILICONFLOW_API_KEY;
	if (!apiKey) {
		throw new HTTPException(500, {
			message: "SILICONFLOW_API_KEY not configured",
		});
	}

	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		throw new HTTPException(400, { message: "Invalid JSON body" });
	}

	const parsed = parseOcrRequest(body);

	// Strip data URL prefix for size check
	const base64 = parsed.image.replace(/^data:image\/\w+;base64,/, "");
	if (base64.length > 7_000_000) {
		throw new HTTPException(413, { message: "图片太大，请压缩后重试" });
	}

	try {
		const client = createSiliconFlowClient(apiKey);
		const result = await ocrImage(client, parsed.image);
		const sessionId = randomUUID();
		return c.json({ id: sessionId, markdown: result.markdown });
	} catch (err) {
		// Distinguish rate limit from other errors
		if (isOpenAIError(err) && err.status === 429) {
			throw new HTTPException(429, { message: "请求太频繁，稍后再试" });
		}
		throw new HTTPException(502, { message: "识别失败，请重试" });
	}
});

function isOpenAIError(err: unknown): err is APIError {
	return err instanceof APIError;
}

export default app;
