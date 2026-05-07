import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { APIError } from "openai";
import { createSiliconFlowClient, solveQuestion } from "../llm/siliconflow.js";
import { parseSolveRequest } from "../validation.js";

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

	const parsed = parseSolveRequest(body);

	try {
		const client = createSiliconFlowClient(apiKey);
		// Note: no image passed — DeepSeek-R1 is text-only
		const result = await solveQuestion(client, parsed.markdown);
		return c.json({
			sessionId: parsed.sessionId ?? "",
			answer: result.answer,
			reasoning: result.reasoning,
		});
	} catch (err) {
		if (isOpenAIError(err) && err.status === 429) {
			throw new HTTPException(429, { message: "请求太频繁，稍后再试" });
		}
		throw new HTTPException(502, { message: "解析失败，请重试" });
	}
});

function isOpenAIError(err: unknown): err is APIError {
	return err instanceof APIError;
}

export default app;
