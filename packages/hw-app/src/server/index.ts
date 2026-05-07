import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { trimTrailingSlash } from "hono/trailing-slash";
import ocrRoute from "./routes/ocr.js";
import solveRoute from "./routes/solve.js";

const app = new Hono();

app.use("*", trimTrailingSlash());
app.use(
	"*",
	cors({
		origin: process.env.HW_APP_CORS_ORIGIN ?? "http://localhost:5173",
		credentials: true,
	}),
);

app.get("/health", (c) => c.json({ ok: true }));

app.route("/api/ocr", ocrRoute);
app.route("/api/solve", solveRoute);

// Global error handler
app.onError((err, c) => {
	if (err instanceof HTTPException) {
		return c.json({ error: err.message }, err.status);
	}
	console.error("Unhandled error:", err);
	return c.json({ error: "服务器内部错误" }, 500);
});

const port = Number(process.env.HW_APP_PORT ?? 3000);

console.log(`HW-App server starting on port ${port}`);

serve({ fetch: app.fetch, port });

export default app;
