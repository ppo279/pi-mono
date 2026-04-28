// packages/hw-server/src/middleware/auth.ts
import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { verifyToken } from "../auth.js";
import { getSession } from "../user.js";

export interface AuthContext {
  userId: number;
  role: string;
}

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const token = getCookie(c, "hw_token");
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  try {
    const payload = await verifyToken(token);
    const session = getSession(token);
    if (!session) {
      return c.json({ error: "Session expired" }, 401);
    }
    c.set("userId", Number(payload.sub));
    c.set("role", payload.role);
    await next();
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }
};
