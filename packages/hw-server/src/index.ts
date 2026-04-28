import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { registerAuthRoutes } from "./auth.js";
import { registerAssessRoutes } from "./assess.js";

const app = new Hono();

// ── Health check ─────────────────────────────────────────────────────────
app.get("/api/health", (c) =>
  c.json({ status: "ok", timestamp: Math.floor(Date.now() / 1000) })
);

// ── Mount business routes ───────────────────────────────────────────────
registerAuthRoutes(app);
registerAssessRoutes(app);

// ── Start server ────────────────────────────────────────────────────────
const port = Number(process.env.PORT ?? 3000);
console.log(`hw-server starting on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});

export default app;
