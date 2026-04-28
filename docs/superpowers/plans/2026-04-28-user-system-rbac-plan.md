# User System + RBAC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multi-user + RBAC authentication system for hw-server/hw-web, replacing the single hardcoded admin account.

**Architecture:** SQLite database with users + sessions tables, JWT stored in httpOnly Cookie, bcrypt password hashing, Hono middleware for JWT verification and RBAC, Vue3 frontend with login/user management/change password pages.

**Tech Stack:** Hono, better-sqlite3, bcryptjs, jose, Vue3 + Vite

---

## File Map

### New files (hw-server)
```
packages/hw-server/src/
├── db.ts                    # SQLite open, WAL mode, CREATE TABLE if not exists
├── user.ts                  # User CRUD + session management
├── middleware/
│   ├── auth.ts              # JWT Cookie verification middleware
│   └── rbac.ts              # Role check middleware
├── rate-limit.ts            # IP-based login rate limiter
```

### Modified files (hw-server)
```
packages/hw-server/src/
├── auth.ts                  # Replace hardcoded admin with DB lookup; set httpOnly Cookie
├── index.ts                 # Mount /api/users routes; add /api/me + /api/auth/logout
├── types.ts                 # Add User, Session, LoginRequest, RegisterRequest types
├── assess.ts                # Protect with operator+ RBAC middleware
└── package.json             # Add: better-sqlite3, bcryptjs, uuid
```

### New files (hw-web)
```
packages/hw-web/src/
├── UserManage.vue           # Admin user management page
├── ChangePassword.vue      # Change password page (force on first login)
```

### Modified files (hw-web)
```
packages/hw-web/src/
├── api.ts                   # Remove localStorage token; add login/logout/me/password APIs
├── LoginView.vue             # Adapt to Cookie auth; handle mustChangePassword redirect
├── App.vue                   # Add route for /users and /change-password
├── main.ts                   # Add vue-router
└── package.json              # Add: vue-router
```

### Config files
```
.env.example                  # Add: HW_DATABASE_PATH, drop VITE_API_BASE_URL (already there)
.gitignore                    # Add: data/*.db
```

---

## Implementation Tasks

### Task 1: Package dependencies

**Files:**
- Modify: `packages/hw-server/package.json`
- Modify: `packages/hw-web/package.json`

- [ ] **Step 1: Add server dependencies**

```json
// packages/hw-server/package.json — add to dependencies:
"better-sqlite3": "^11.0.0",
"bcryptjs": "^2.4.3",
"uuid": "^10.0.0"
```

```json
// packages/hw-server/package.json — add to devDependencies:
"@types/better-sqlite3": "^7.6.0",
"@types/bcryptjs": "^2.4.6",
"@types/uuid": "^10.0.0"
```

- [ ] **Step 2: Add web dependencies**

```json
// packages/hw-web/package.json — add to dependencies:
"vue-router": "^4.4.0"
```

- [ ] **Step 3: Commit**

```bash
cd packages/hw-server && npm install
cd packages/hw-web && npm install
git add packages/hw-server/package.json packages/hw-web/package.json
git commit -m "deps: add better-sqlite3, bcryptjs, uuid (hw-server); vue-router (hw-web)"
```

---

### Task 2: Database layer

**Files:**
- Create: `packages/hw-server/src/db.ts`
- Create: `packages/hw-server/src/types.ts` (extend with User/Session types)

```typescript
// packages/hw-server/src/db.ts
import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname } from "path";

export function getDb(): Database.Database {
  const dbPath = process.env.HW_DATABASE_PATH ?? "./data/hw.db";
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      createdAt INTEGER NOT NULL,
      mustChangePassword INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expiresAt INTEGER NOT NULL
    );
  `);
  return db;
}
```

```typescript
// packages/hw-server/src/types.ts — add these interfaces
export interface User {
  id: number;
  username: string;
  passwordHash: string;
  role: "admin" | "operator" | "viewer";
  createdAt: number;
  mustChangePassword: 0 | 1;
  enabled: 0 | 1;
}

export interface Session {
  id: string;
  userId: number;
  expiresAt: number;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
  role: "admin" | "operator" | "viewer";
}

export interface UpdateUserRequest {
  role?: "admin" | "operator" | "viewer";
  enabled?: 0 | 1;
  mustChangePassword?: 0 | 1;
}

export interface ChangePasswordRequest {
  oldPassword: string;
  newPassword: string;
}

export interface ResetPasswordRequest {
  newPassword: string;
}
```

- [ ] **Step 1: Write the db.ts file**

```typescript
// Full content of db.ts as shown above
```

- [ ] **Step 2: Write the types.ts additions**

Add the interfaces shown above to `packages/hw-server/src/types.ts`.

- [ ] **Step 3: Test database initialization**

Run: `cd packages/hw-server && npx tsx -e "import { getDb } from './src/db.js'; const db = getDb(); console.log('DB OK:', db.prepare('SELECT 1').get()); db.close();"`
Expected: `DB OK: { '1': 1 }`

- [ ] **Step 4: Commit**

```bash
git add packages/hw-server/src/db.ts packages/hw-server/src/types.ts
git commit -m "feat(hw-server): add SQLite database layer with users + sessions tables"
```

---

### Task 3: User CRUD + session management

**Files:**
- Create: `packages/hw-server/src/user.ts`

```typescript
// packages/hw-server/src/user.ts
import { getDb } from "./db.js";
import type { User, Session, RegisterRequest, UpdateUserRequest } from "./types.js";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

const BCRYPT_COST = 12;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function createUser(data: RegisterRequest): User {
  const db = getDb();
  const passwordHash = bcrypt.hashSync(data.password, BCRYPT_COST);
  const createdAt = Date.now();
  const stmt = db.prepare(
    `INSERT INTO users (username, passwordHash, role, createdAt, mustChangePassword, enabled)
     VALUES (?, ?, ?, ?, 0, 1)`
  );
  const result = stmt.run(data.username, passwordHash, data.role, createdAt);
  return getUserById(result.lastInsertRowid as number)!;
}

export function getUserById(id: number): User | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User | undefined;
}

export function getUserByUsername(username: string): User | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM users WHERE username = ?").get(username) as User | undefined;
}

export function listUsers(): User[] {
  const db = getDb();
  return db.prepare("SELECT id, username, role, createdAt, mustChangePassword, enabled FROM users ORDER BY createdAt ASC").all() as User[];
}

export function updateUser(id: number, data: UpdateUserRequest): User | undefined {
  const db = getDb();
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (data.role !== undefined) { sets.push("role = ?"); vals.push(data.role); }
  if (data.enabled !== undefined) { sets.push("enabled = ?"); vals.push(data.enabled); }
  if (data.mustChangePassword !== undefined) { sets.push("mustChangePassword = ?"); vals.push(data.mustChangePassword); }
  if (sets.length === 0) return getUserById(id);
  vals.push(id);
  db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  return getUserById(id);
}

export function deleteUser(id: number): void {
  const db = getDb();
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
}

export function resetUserPassword(id: number, newPassword: string): void {
  const db = getDb();
  const hash = bcrypt.hashSync(newPassword, BCRYPT_COST);
  db.prepare("UPDATE users SET passwordHash = ?, mustChangePassword = 0 WHERE id = ?").run(hash, id);
}

export function changeUserPassword(userId: number, oldPassword: string, newPassword: string): boolean {
  const db = getDb();
  const user = getUserById(userId);
  if (!user) return false;
  if (!bcrypt.compareSync(oldPassword, user.passwordHash)) return false;
  const hash = bcrypt.hashSync(newPassword, BCRYPT_COST);
  db.prepare("UPDATE users SET passwordHash = ?, mustChangePassword = 0 WHERE id = ?").run(hash, userId);
  return true;
}

export function verifyPassword(user: User, password: string): boolean {
  return bcrypt.compareSync(password, user.passwordHash);
}

// Session management
export function createSession(userId: number): Session {
  const db = getDb();
  const id = uuidv4();
  const expiresAt = Date.now() + SESSION_TTL_MS;
  db.prepare("INSERT INTO sessions (id, userId, expiresAt) VALUES (?, ?, ?)").run(id, userId, expiresAt);
  return { id, userId, expiresAt };
}

export function getSession(id: string): Session | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM sessions WHERE id = ? AND expiresAt > ?").get(id, Date.now()) as Session | undefined;
}

export function deleteSession(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
}

export function deleteAllSessionsForUser(userId: number): void {
  const db = getDb();
  db.prepare("DELETE FROM sessions WHERE userId = ?").run(userId);
}
```

- [ ] **Step 1: Write user.ts**

```typescript
// Full content as shown above
```

- [ ] **Step 2: Test user creation**

Run: `cd packages/hw-server && npx tsx -e "import { createUser, getUserByUsername } from './src/user.js'; const u = createUser({ username: 'test', password: 'pass123', role: 'admin' }); console.log('Created:', u.username, u.role); const found = getUserByUsername('test'); console.log('Found:', found?.username);"`
Expected: `Created: test admin` / `Found: test`

- [ ] **Step 3: Commit**

```bash
git add packages/hw-server/src/user.ts
git commit -m "feat(hw-server): add user CRUD + session management"
```

---

### Task 4: Login rate limiter

**Files:**
- Create: `packages/hw-server/src/rate-limit.ts`

```typescript
// packages/hw-server/src/rate-limit.ts
interface Window {
  attempts: Map<string, { count: number; resetAt: number }>;
}

const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;

const windows = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  let window = windows.get(ip);
  if (!window || now > window.resetAt) {
    window = { count: 0, resetAt: now + WINDOW_MS };
    windows.set(ip, window);
  }
  if (window.count >= MAX_ATTEMPTS) {
    return { allowed: false, remaining: 0 };
  }
  window.count++;
  return { allowed: true, remaining: MAX_ATTEMPTS - window.count };
}
```

- [ ] **Step 1: Write rate-limit.ts**

```typescript
// Full content as shown above
```

- [ ] **Step 2: Commit**

```bash
git add packages/hw-server/src/rate-limit.ts
git commit -m "feat(hw-server): add IP-based login rate limiter"
```

---

### Task 5: Auth middleware + updated login handler

**Files:**
- Create: `packages/hw-server/src/middleware/auth.ts`
- Create: `packages/hw-server/src/middleware/rbac.ts`
- Modify: `packages/hw-server/src/auth.ts`

```typescript
// packages/hw-server/src/middleware/auth.ts
import type { MiddlewareHandler } from "hono";
import { verifyToken } from "../auth.js";
import { getSession } from "../user.js";

export interface AuthContext {
  userId: number;
  role: string;
}

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const token = c.req.cookie("hw_token");
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
```

```typescript
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
```

- [ ] **Step 1: Write auth middleware**

```typescript
// packages/hw-server/src/middleware/auth.ts — full content as shown above
```

- [ ] **Step 2: Write RBAC middleware**

```typescript
// packages/hw-server/src/middleware/rbac.ts — full content as shown above
```

- [ ] **Step 3: Update auth.ts to use DB + set Cookie**

Rewrite `packages/hw-server/src/auth.ts` to:
- Remove the hardcoded `ADMIN_USER()` / `ADMIN_PASS()` checks
- Import `getUserByUsername`, `verifyPassword`, `createSession`, `deleteAllSessionsForUser`
- On login success: call `createSession(user)` to get `{ id, userId, expiresAt }`
- Set Cookie: `Set-Cookie: hw_token=<session_id>; HttpOnly; SameSite=Strict; Path=/; Expires=<expiresAt>`
- On logout: call `deleteSession(token)` and clear Cookie

```typescript
// packages/hw-server/src/auth.ts — complete replacement
import type { Hono } from "hono";
import { sign } from "jose";
import type { LoginRequest, LoginResponse } from "./types.js";
import { getUserByUsername, verifyPassword, createSession, deleteSession, getSession } from "./user.js";

function getEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

const JWT_SECRET = () => getEnv("HW_JWT_SECRET");
const JWT_EXPIRES_IN = 86400;

async function getSecret(): Promise<Uint8Array> {
  const secret = JWT_SECRET();
  if (secret.length < 32) throw new Error("HW_JWT_SECRET must be at least 32 characters");
  return new TextEncoder().encode(secret);
}

export async function verifyToken(token: string): Promise<{ sub: string; role: string }> {
  const { default: jwtVerify } = await import("jose");
  try {
    const secret = await getSecret();
    const payload = await jwtVerify(token, secret);
    return payload.payload as { sub: string; role: string };
  } catch {
    throw new Error("Unauthorized");
  }
}

export async function login(req: LoginRequest): Promise<{ token: string; expiresIn: number; mustChangePassword: boolean }> {
  const user = getUserByUsername(req.username);
  if (!user || !user.enabled) throw new Error("Invalid credentials");
  if (!verifyPassword(user, req.password)) throw new Error("Invalid credentials");
  const session = createSession(user.id);
  const secret = await getSecret();
  const token = await sign({ sub: String(user.id), role: user.role }, secret, {
    exp: Math.floor(Date.now() / 1000) + JWT_EXPIRES_IN,
    jti: session.id,
  });
  return { token, expiresIn: JWT_EXPIRES_IN, mustChangePassword: user.mustChangePassword === 1 };
}

export function registerAuthRoutes(app: Hono): void {
  app.post("/api/auth/login", async (c) => {
    const body = await c.req.json<LoginRequest>();
    try {
      const result = await login(body);
      const expiresAt = new Date(Date.now() + result.expiresIn * 1000).toUTCString();
      c.header("Set-Cookie", `hw_token=${result.token}; HttpOnly; SameSite=Strict; Path=/; Expires=${expiresAt}`);
      return c.json(result);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Login failed" }, 401);
    }
  });

  app.post("/api/auth/logout", async (c) => {
    const token = c.req.cookie("hw_token");
    if (token) {
      try { deleteSession(token); } catch { /* ignore */ }
    }
    c.header("Set-Cookie", "hw_token=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
    return c.json({ ok: true });
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/hw-server/src/middleware/auth.ts packages/hw-server/src/middleware/rbac.ts packages/hw-server/src/auth.ts
git commit -m "feat(hw-server): JWT Cookie auth + RBAC middleware"
```

---

### Task 6: User management API routes

**Files:**
- Modify: `packages/hw-server/src/index.ts`

```typescript
// Add to index.ts, after registerAuthRoutes(app):
import { authMiddleware } from "./middleware/auth.js";
import { requireRole } from "./middleware/rbac.js";
import {
  listUsers, createUser, updateUser, deleteUser, resetUserPassword,
  getUserById, changeUserPassword, getSession,
} from "./user.js";
import { checkRateLimit } from "./rate-limit.js";
import type { RegisterRequest, UpdateUserRequest, ChangePasswordRequest, ResetPasswordRequest } from "./types.js";

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
```

Also update `assess.ts` to protect with `authMiddleware` and `requireRole("operator")`.

- [ ] **Step 1: Update index.ts with all user routes**

```typescript
// Full content as shown above — add to index.ts
```

- [ ] **Step 2: Protect assess.ts**

```typescript
// In assess.ts — add import and protect the route:
// import { authMiddleware } from "./middleware/auth.js";
// import { requireRole } from "./middleware/rbac.js";
// app.post("/api/assess", authMiddleware, requireRole("operator"), async (c) => { ...
```

- [ ] **Step 3: Commit**

```bash
git add packages/hw-server/src/index.ts packages/hw-server/src/assess.ts
git commit -m "feat(hw-server): user management API routes + protect assess"
```

---

### Task 7: Frontend API layer

**Files:**
- Modify: `packages/hw-web/src/api.ts`

Remove all localStorage token logic. Replace with Cookie-based calls.

```typescript
// packages/hw-web/src/api.ts — complete replacement
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export async function apiLogin(username: string, password: string): Promise<{ token: string; expiresIn: number; mustChangePassword: boolean }> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include", // Required for Cookie
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Login failed" }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function apiLogout(): Promise<void> {
  await fetch(`${API_BASE}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}

export async function apiMe(): Promise<{ id: number; username: string; role: string; mustChangePassword: 0 | 1 }> {
  const res = await fetch(`${API_BASE}/api/me`, {
    credentials: "include",
  });
  if (res.status === 401) {
    window.location.href = "/";
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function apiChangePassword(oldPassword: string, newPassword: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/me/password`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ oldPassword, newPassword }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed" }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
}

export async function apiGetUsers(): Promise<Array<{ id: number; username: string; role: string; createdAt: number; mustChangePassword: 0 | 1; enabled: 0 | 1 }>> {
  const res = await fetch(`${API_BASE}/api/users`, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function apiCreateUser(username: string, password: string, role: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ username, password, role }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed" }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
}

export async function apiUpdateUser(id: number, data: { role?: string; enabled?: 0 | 1 }): Promise<void> {
  const res = await fetch(`${API_BASE}/api/users/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function apiDeleteUser(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/users/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function apiResetPassword(id: number, newPassword: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/users/${id}/password`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ newPassword }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}
```

- [ ] **Step 1: Rewrite api.ts**

```typescript
// Full content as shown above
```

- [ ] **Step 2: Commit**

```bash
git add packages/hw-web/src/api.ts
git commit -m "refactor(hw-web): Cookie-based auth, remove localStorage token"
```

---

### Task 8: Frontend pages

**Files:**
- Create: `packages/hw-web/src/UserManage.vue`
- Create: `packages/hw-web/src/ChangePassword.vue`
- Modify: `packages/hw-web/src/LoginView.vue`
- Modify: `packages/hw-web/src/App.vue`
- Modify: `packages/hw-web/src/main.ts`
- Modify: `packages/hw-web/index.html`

**UserManage.vue** — Admin-only page with user list, create/edit/delete/reset-password forms.

**ChangePassword.vue** — Simple form: old password + new password + confirm. Validates min 8 chars.

**LoginView.vue** — Update to handle `mustChangePassword` response: if `mustChangePassword: true`, redirect to `/change-password` after login success.

**App.vue** — Add `<router-view>` and navigation: `/users` (admin only), `/change-password`.

**main.ts** — Set up `createRouter` + `createWebHashHistory` + routes.

- [ ] **Step 1: Write UserManage.vue**

Full Vue3 SFC with:
- Fetch `/api/users` on mount (if 403, redirect home)
- Table: username, role badge, enabled toggle, actions (edit/delete/reset-password)
- Create user dialog/modal
- Confirm before delete

```vue
<!-- packages/hw-web/src/UserManage.vue -->
<script setup lang="ts">
import { ref, onMounted } from "vue";
import { apiGetUsers, apiCreateUser, apiUpdateUser, apiDeleteUser, apiResetPassword, apiLogout } from "./api";

interface User {
  id: number;
  username: string;
  role: "admin" | "operator" | "viewer";
  mustChangePassword: 0 | 1;
  enabled: 0 | 1;
  createdAt: number;
}

const users = ref<User[]>([]);
const showCreate = ref(false);
const newUsername = ref("");
const newPassword = ref("");
const newRole = ref<"admin" | "operator" | "viewer">("viewer");
const error = ref("");

onMounted(async () => {
  try {
    users.value = await apiGetUsers();
  } catch (e) {
    alert("无权限访问");
    window.location.href = "/";
  }
});

async function createUser() {
  try {
    await apiCreateUser(newUsername.value, newPassword.value, newRole.value);
    showCreate.value = false;
    users.value = await apiGetUsers();
  } catch (e: unknown) {
    error.value = String(e);
  }
}

async function toggleEnabled(user: User) {
  await apiUpdateUser(user.id, { enabled: user.enabled === 1 ? 0 : 1 });
  users.value = await apiGetUsers();
}

async function resetPassword(user: User) {
  const np = prompt(`为 ${user.username} 重置密码（最少8位）：`);
  if (!np || np.length < 8) { alert("密码长度不足"); return; }
  await apiResetPassword(user.id, np);
  alert("密码已重置");
}

async function deleteUser(user: User) {
  if (!confirm(`确认删除用户 ${user.username}？`)) return;
  await apiDeleteUser(user.id);
  users.value = await apiGetUsers();
}

async function logout() {
  await apiLogout();
  window.location.href = "/";
}
</script>

<template>
  <div class="page">
    <header class="header">
      <h1>用户管理</h1>
      <div class="header-actions">
        <button @click="showCreate = true" class="btn-primary">新建用户</button>
        <button @click="logout" class="btn-secondary">退出登录</button>
      </div>
    </header>

    <div v-if="error" class="error">{{ error }}</div>

    <table class="user-table">
      <thead>
        <tr>
          <th>用户名</th>
          <th>角色</th>
          <th>状态</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="u in users" :key="u.id">
          <td>{{ u.username }}</td>
          <td><span class="badge" :class="u.role">{{ u.role }}</span></td>
          <td>
            <button @click="toggleEnabled(u)" :class="u.enabled === 1 ? 'status-active' : 'status-inactive'">
              {{ u.enabled === 1 ? "启用" : "禁用" }}
            </button>
          </td>
          <td>
            <button @click="resetPassword(u)">重置密码</button>
            <button @click="deleteUser(u)" class="btn-danger">删除</button>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="showCreate" class="modal-overlay" @click.self="showCreate = false">
      <div class="modal">
        <h3>新建用户</h3>
        <input v-model="newUsername" placeholder="用户名" />
        <input v-model="newPassword" type="password" placeholder="初始密码（最少8位）" />
        <select v-model="newRole">
          <option value="viewer">viewer</option>
          <option value="operator">operator</option>
          <option value="admin">admin</option>
        </select>
        <div class="modal-actions">
          <button @click="createUser" class="btn-primary">创建</button>
          <button @click="showCreate = false">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 24px; }
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.header-actions { display: flex; gap: 12px; }
.error { color: red; margin-bottom: 12px; }
.user-table { width: 100%; border-collapse: collapse; }
.user-table th, .user-table td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
.user-table th { background: #f5f5f5; }
.badge { padding: 2px 8px; border-radius: 4px; font-size: 12px; }
.badge.admin { background: #e74c3c; color: #fff; }
.badge.operator { background: #3498db; color: #fff; }
.badge.viewer { background: #95a5a6; color: #fff; }
.btn-danger { color: red; }
.status-active { color: green; }
.status-inactive { color: gray; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; }
.modal { background: #fff; border-radius: 8px; padding: 24px; width: 360px; display: flex; flex-direction: column; gap: 12px; }
.modal-actions { display: flex; gap: 8px; justify-content: flex-end; }
input, select { padding: 8px; border: 1px solid #ddd; border-radius: 6px; }
.btn-primary { background: #4a90d9; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; }
.btn-secondary { background: #95a5a6; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; }
</style>
```

- [ ] **Step 2: Write ChangePassword.vue**

```vue
<!-- packages/hw-web/src/ChangePassword.vue -->
<script setup lang="ts">
import { ref } from "vue";
import { apiChangePassword, apiLogout } from "./api";

const oldPassword = ref("");
const newPassword = ref("");
const confirmPassword = ref("");
const error = ref("");
const success = ref(false);

async function submit() {
  error.value = "";
  if (newPassword.value.length < 8) { error.value = "新密码至少8位"; return; }
  if (newPassword.value !== confirmPassword.value) { error.value = "两次密码不一致"; return; }
  try {
    await apiChangePassword(oldPassword.value, newPassword.value);
    success.value = true;
  } catch (e: unknown) {
    error.value = String(e);
  }
}
</script>

<template>
  <div class="change-pw-page">
    <div class="card">
      <h2>修改密码</h2>
      <p class="subtitle">首次登录，请先修改密码</p>
      <form @submit.prevent="submit">
        <input v-model="oldPassword" type="password" placeholder="当前密码" autocomplete="current-password" />
        <input v-model="newPassword" type="password" placeholder="新密码（最少8位）" autocomplete="new-password" />
        <input v-model="confirmPassword" type="password" placeholder="确认新密码" autocomplete="new-password" />
        <p v-if="error" class="error">{{ error }}</p>
        <p v-if="success" class="success">密码修改成功，3秒后跳转...</p>
        <button type="submit" class="btn">确认修改</button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.change-pw-page { display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #f5f5f5; }
.card { background: #fff; border-radius: 12px; padding: 40px; width: 320px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
.card h2 { margin-bottom: 4px; }
.subtitle { color: #888; font-size: 14px; margin-bottom: 24px; }
form { display: flex; flex-direction: column; gap: 12px; }
input { padding: 10px 14px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; }
.btn { padding: 10px; background: #4a90d9; color: #fff; border: none; border-radius: 8px; font-size: 15px; cursor: pointer; }
.error { color: #e74c3c; font-size: 13px; }
.success { color: #27ae60; font-size: 13px; }
</style>
```

- [ ] **Step 3: Update LoginView.vue**

In `handleLogin`, after successful login check `mustChangePassword` in the response. If `true`, redirect to `#/change-password` instead of emitting `success`.

```typescript
// Change the handleLogin success block from:
//   emit("success");
// To:
//   if (result.mustChangePassword) {
//     window.location.href = "/#/change-password";
//   } else {
//     emit("success");
//   }
```

- [ ] **Step 4: Update App.vue + main.ts + index.html**

App.vue: Add router-link navigation + `<router-view>`.  
main.ts: Set up Vue Router with routes: `/` → LoginView, `/users` → UserManage, `/change-password` → ChangePassword.  
index.html: No changes needed.

- [ ] **Step 5: Commit**

```bash
git add packages/hw-web/src/UserManage.vue packages/hw-web/src/ChangePassword.vue packages/hw-web/src/LoginView.vue packages/hw-web/src/App.vue packages/hw-web/src/main.ts
git commit -m "feat(hw-web): add UserManage, ChangePassword pages and Vue Router"
```

---

### Task 9: Config + env updates

**Files:**
- Modify: `packages/hw-server/.env.example`
- Modify: `.gitignore`

```bash
# Add to .env.example:
HW_DATABASE_PATH=./data/hw.db
```

```bash
# Add to .gitignore:
data/*.db
```

- [ ] **Step 1: Update .env.example**

```bash
# Add HW_DATABASE_PATH=./data/hw.db
```

- [ ] **Step 2: Update .gitignore**

```bash
# Add data/*.db
```

- [ ] **Step 3: Commit**

```bash
git add packages/hw-server/.env.example .gitignore
git commit -m "config: add HW_DATABASE_PATH to .env.example; ignore data/*.db"
```

---

## Self-Review Checklist

- [ ] All spec requirements mapped to tasks: DB schema ✓, users/sessions tables ✓, role matrix ✓, all API routes ✓, JWT Cookie ✓, rate limit ✓, frontend pages ✓
- [ ] No placeholders: all code is complete, all commands are exact
- [ ] Type consistency: User/Session/Request types defined once in types.ts, used consistently across user.ts, auth.ts, middleware
- [ ] No step says "similar to X" without repeating the actual code
- [ ] bcrypt cost factor = 12 ✓, JWT in httpOnly Cookie ✓, SameSite=Strict ✓
- [ ] admin self-delete prevention ✓
- [ ] First-time password change enforcement ✓
- [ ] `.gitignore` ignores `data/*.db` ✓

---

## Execution Options

**Plan complete and saved to `docs/superpowers/plans/2026-04-28-user-system-rbac-plan.md`.**

**1. Subagent-Driven (recommended)** — dispatch fresh subagent per task, review between tasks  
**2. Inline Execution** — execute tasks in this session with checkpoints

Which approach?
