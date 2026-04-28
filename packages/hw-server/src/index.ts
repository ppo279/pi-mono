import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { registerAuthRoutes } from "./auth.js";
import { registerAssessRoutes } from "./assess.js";
import { authMiddleware } from "./middleware/auth.js";
import { requireRole } from "./middleware/rbac.js";
import {
  listUsers, createUser, updateUser, deleteUser, resetUserPassword,
  getUserById, changeUserPassword,
} from "./user.js";
import { checkRateLimit } from "./rate-limit.js";
import type { RegisterRequest, UpdateUserRequest, ChangePasswordRequest, ResetPasswordRequest } from "./types.js";

const app = new Hono();

// ── Health check ─────────────────────────────────────────────────────────
app.get("/api/health", (c) =>
  c.json({ status: "ok", timestamp: Math.floor(Date.now() / 1000) })
);

// ── Mount business routes ───────────────────────────────────────────────
registerAuthRoutes(app);
registerAssessRoutes(app);

// GET /api/me
app.get("/api/me", authMiddleware, async (c) => {
  const userId = c.get("userId") as number;
  const user = getUserById(userId);
  if (!user) return c.json({ error: "Not found" }, 404);
  const { passwordHash: _, ...safeUser } = user;
  return c.json(safeUser);
});

// PUT /api/me/password
app.put("/api/me/password", authMiddleware, async (c) => {
  const userId = c.get("userId") as number;
  const body = await c.req.json<ChangePasswordRequest>();
  if (!body.newPassword || body.newPassword.length < 8) {
    return c.json({ error: "Password must be at least 8 characters" }, 400);
  }
  const ok = changeUserPassword(userId, body.oldPassword, body.newPassword);
  if (!ok) return c.json({ error: "Invalid old password" }, 400);
  return c.json({ ok: true });
});

// GET /api/users (admin only)
app.get("/api/users", authMiddleware, requireRole("admin"), async (c) => {
  return c.json(listUsers());
});

// POST /api/users (admin only)
app.post("/api/users", authMiddleware, requireRole("admin"), async (c) => {
  const body = await c.req.json<RegisterRequest>();
  if (!body.username || !body.password || body.password.length < 8) {
    return c.json({ error: "Username and password (min 8 chars) required" }, 400);
  }
  const validRoles = ["admin", "operator", "viewer"];
  if (!validRoles.includes(body.role)) body.role = "viewer";
  try {
    const user = createUser(body);
    const { passwordHash: _, ...safe } = user;
    return c.json(safe, 201);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("UNIQUE")) {
      return c.json({ error: "Username already exists" }, 409);
    }
    return c.json({ error: "Failed to create user" }, 500);
  }
});

// PUT /api/users/:id (admin only)
app.put("/api/users/:id", authMiddleware, requireRole("admin"), async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<UpdateUserRequest>();
  const user = updateUser(id, body);
  if (!user) return c.json({ error: "User not found" }, 404);
  const { passwordHash: _, ...safe } = user;
  return c.json(safe);
});

// DELETE /api/users/:id (admin only)
app.delete("/api/users/:id", authMiddleware, requireRole("admin"), async (c) => {
  const id = Number(c.req.param("id"));
  const me = c.get("userId") as number;
  if (id === me) return c.json({ error: "Cannot delete yourself" }, 400);
  deleteUser(id);
  return c.json({ ok: true });
});

// PUT /api/users/:id/password (admin only — reset password)
app.put("/api/users/:id/password", authMiddleware, requireRole("admin"), async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<ResetPasswordRequest>();
  if (!body.newPassword || body.newPassword.length < 8) {
    return c.json({ error: "Password must be at least 8 characters" }, 400);
  }
  resetUserPassword(id, body.newPassword);
  return c.json({ ok: true });
});

// ── Start server ────────────────────────────────────────────────────────
const port = Number(process.env.PORT ?? 3000);
console.log(`hw-server starting on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});

export default app;
