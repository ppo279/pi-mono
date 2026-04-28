// packages/hw-server/src/middleware/rbac.ts
import type { MiddlewareHandler } from "hono";
import type { AuthContext } from "./auth.js";

const ROLE_RANK: Record<string, number> = {
  admin: 3,
  operator: 2,
  viewer: 1,
};

export function requireRole(minRole: string): MiddlewareHandler {
  return async (c, next) => {
    const role = c.get("role") as string;
    if (!role || (ROLE_RANK[role] ?? 0) < (ROLE_RANK[minRole] ?? 0)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    await next();
  };
}
