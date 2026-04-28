import { Hono } from "hono";
import type { AssessRequest } from "./types.js";
import { runPipeline } from "@mariozechner/pi-homework";
import { verifyToken } from "./auth.js";

// ─── SSE helpers ────────────────────────────────────────────────────────

function sendEvent(
  writer: ReadableStreamDefaultWriter<Uint8Array>,
  type: string,
  data: unknown,
): void {
  const encoder = new TextEncoder();
  writer.write(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`));
}

// ─── Pipeline runner with SSE ────────────────────────────────────────────

async function runPipelineWithEvents(
  input: { image: string; meta: { grade: string; subject: string } },
  writer: ReadableStreamDefaultWriter<Uint8Array>,
): Promise<void> {
  try {
    // Send initial step
    sendEvent(writer, "step", { state: "INIT" });

    // Run the pipeline
    const output = await runPipeline({
      image: input.image,
      meta: input.meta,
    });

    // Send OCR preview (if available)
    if (output.rawOcr?.blocks && output.rawOcr.blocks.length > 0) {
      const preview = output.rawOcr.blocks.slice(0, 3).map((b) => b.text).join(" | ");
      sendEvent(writer, "ocr", { preview });
    }

    // Send questions when available
    sendEvent(writer, "questions", { questions: output.questions });

    // Send done
    sendEvent(writer, "done", {
      result: {
        questions: output.questions,
        processingTime: output.processingTime,
      },
    });
  } catch (err) {
    sendEvent(writer, "error", { error: String(err) });
  }
}

// ─── Route registration ────────────────────────────────────────────────

export function registerAssessRoutes(app: Hono): void {
  // POST /api/assess/stream — requires JWT auth
  app.post("/api/assess/stream", async (c) => {
    // ── Auth check ──────────────────────────────────────────
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const token = authHeader.slice(7);
    try {
      await verifyToken(token);
    } catch {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // ── Parse request ──────────────────────────────────────
    const body = await c.req.json<AssessRequest>();
    if (!body.image || !body.grade || !body.subject) {
      return c.json({ error: "Missing required fields: image, grade, subject" }, 400);
    }

    // ── Establish SSE stream (after auth/validation to avoid leaks) ──
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    // Run pipeline in background, send events
    runPipelineWithEvents(
      { image: body.image, meta: { grade: body.grade, subject: body.subject } },
      writer,
    ).finally(() => {
      writer.close().catch(() => {});
    });

    // Return SSE response
    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no", // Disable Nginx buffering
      },
    });
  });
}