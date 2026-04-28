# hw-server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新建 `packages/hw-server`（Hono 后端），提供 SSE 接口桥接前端与 pi-homework 管道，并添加单机单用户 JWT 认证。

**Architecture:** Hono 后端服务（port 3000），三个 API 端点（/api/auth/login、/api/health、/api/assess/stream）。`runPipeline` 在管道各阶段完成时同步调用，SSE 事件由 hw-server 主动推送，前端逻辑不变。

**Tech Stack:** Hono、@hono/node-server、jose（JWT）、pi-homework（管道核心）

---

## 文件结构

```
packages/hw-server/
  src/
    index.ts          # Hono 入口，路由注册
    auth.ts           # /api/auth/login，JWT 签发与验证中间件
    assess.ts         # /api/assess/stream SSE 接口
    types.ts          # 请求/响应类型（LoginRequest, AssessRequest, SSE events）
  package.json
  tsconfig.json
  tsconfig.build.json
  vite.config.ts

packages/hw-web/
  src/
    App.vue           # 修改：未登录显示 LoginView，已登录显示主功能
    LoginView.vue     # 新增：登录页
    api.ts            # 新增：API 请求封装（带 auth header）
```

---

## Task 1: 创建 hw-server 目录骨架

**Files:**
- Create: `packages/hw-server/package.json`
- Create: `packages/hw-server/tsconfig.json`
- Create: `packages/hw-server/tsconfig.build.json`
- Create: `packages/hw-server/vite.config.ts`
- Create: `packages/hw-server/src/types.ts`

- [ ] **Step 1: 创建 packages/hw-server/package.json**

```json
{
  "name": "@mariozechner/pi-hw-server",
  "version": "0.1.0",
  "description": "Homework assessment backend — Hono SSE server with JWT auth",
  "type": "module",
  "exports": {
    ".": "./dist/index.js"
  },
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc -p tsconfig.build.json --noEmit && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@hono/node-server": "^1.13.0",
    "hono": "^4.6.0",
    "jose": "^5.9.0",
    "@mariozechner/pi-homework": "workspace:^"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: 创建 tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: 创建 tsconfig.build.json**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": false },
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: 创建 vite.config.ts**

```typescript
import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: ".",
  build: {
    outDir: "dist",
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      formats: ["es"],
      fileName: "index",
    },
    rollupOptions: {
      external: ["node:net", "node:http", "node:https"],
    },
  },
  server: {
    port: 3000,
  },
});
```

- [ ] **Step 5: 创建 src/types.ts（所有 SSE 事件类型和请求/响应类型）**

```typescript
// ─── SSE 事件类型（与 hw-web 现有解析逻辑完全一致）───────────────

export interface SSEStepEvent {
  state: string; // PipelineState
}

export interface SSEOcrEvent {
  preview?: string;
  blocks?: string[];
}

export interface SSEThinkingEvent {
  text: string;
}

export interface SSEQuestionsEvent {
  questions: unknown[];
}

export interface SSEDoneEvent {
  result: {
    questions: unknown[];
    processingTime?: number;
  };
}

export interface SSEErrorEvent {
  error: string;
}

export type SSEEvent =
  | { type: "step"; data: SSEStepEvent }
  | { type: "ocr"; data: SSEOcrEvent }
  | { type: "thinking"; data: SSEThinkingEvent }
  | { type: "questions"; data: SSEQuestionsEvent }
  | { type: "done"; data: SSEDoneEvent }
  | { type: "error"; data: SSEErrorEvent };

// ─── API 请求 / 响应类型 ─────────────────────────────────────────

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  expiresIn: number;
}

export interface AssessRequest {
  image: string; // base64
  grade: string;
  subject: string;
}

export interface HealthResponse {
  status: "ok";
  timestamp: number;
}
```

- [ ] **Step 6: 提交**

```bash
git add packages/hw-server/
git commit -m "feat(hw-server): scaffold package structure and types"
```

---

## Task 2: 实现 auth.ts — 登录 + JWT 中间件

**Files:**
- Create: `packages/hw-server/src/auth.ts`

- [ ] **Step 1: 写测试（先写失败测试）**

创建 `packages/hw-server/test/auth.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { sign, verify } from "hono/jwt";
import { createHonoApp, login, verifyToken } from "../src/auth";

// 正常情况：正确的用户名密码
// 错误情况：错误的用户名密码
// JWT 验证：合法 token 通过，非法 token 拒绝
```

运行测试验证失败（因为 auth.ts 还不存在）:
```bash
npx tsx node_modules/vitest/cli.js --run packages/hw-server/test/auth.test.ts
# 预期: FAIL — auth 模块不存在
```

- [ ] **Step 2: 实现 auth.ts**

```typescript
import { Hono } from "hono";
import { hash, verify } from "@node-rs/argon2";
import { sign, verify as verifyJwt } from "hono/jwt";
import type { LoginRequest, LoginResponse } from "./types.js";

// 环境变量校验
function getEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

const ADMIN_USER = () => getEnv("HW_ADMIN_USER");
const ADMIN_PASS_HASH = () => getEnv("HW_ADMIN_PASS_HASH");
const JWT_SECRET = () => getEnv("HW_JWT_SECRET");
const JWT_EXPIRES_IN = 86400; // 24 hours

// 初始化时对密码做 hash（启动时校验环境变量）
let _passHash = "";
export async function initAuth(): Promise<void> {
  _passHash = await hash(ADMIN_PASS(), { algorithm: "argon2id" });
}

// 登录接口
export async function login(req: LoginRequest): Promise<LoginResponse> {
  if (req.username !== ADMIN_USER()) {
    throw new Error("Invalid credentials");
  }
  const valid = await verify(_passHash, ADMIN_PASS());
  if (!valid) throw new Error("Invalid credentials");

  const token = await sign(
    { sub: req.username, role: "admin" },
    JWT_SECRET(),
    { exp: Math.floor(Date.now() / 1000) + JWT_EXPIRES_IN }
  );
  return { token, expiresIn: JWT_EXPIRES_IN };
}

// JWT 验证中间件（供 protect 调用）
export async function verifyToken(token: string): Promise<{ sub: string; role: string }> {
  try {
    const payload = await verifyJwt(token, JWT_SECRET());
    return payload as { sub: string; role: string };
  } catch {
    throw new Error("Unauthorized");
  }
}

// 导出路由挂载函数
export function registerAuthRoutes(app: Hono): void {
  app.post("/api/auth/login", async (c) => {
    const body = await c.req.json<LoginRequest>();
    try {
      const result = await login(body);
      return c.json(result);
    } catch (err) {
      return c.json({ error: String(err) }, 401);
    }
  });
}
```

> **注意：** 需要先在 `.env` 中设置 `HW_ADMIN_PASS_HASH`（argon2 hash 后的密码）。如果只想用明文比对，简化实现：
> ```typescript
> if (req.password !== ADMIN_PASS()) throw new Error("Invalid credentials");
> ```
> 暂时不用 argon2，直接明文比对更简单（单机单用户场景足够）。

- [ ] **Step 3: 跑测试**

```bash
npx tsx node_modules/vitest/cli.js --run packages/hw-server/test/auth.test.ts
# 预期: PASS
```

- [ ] **Step 4: 提交**

```bash
git add packages/hw-server/src/auth.ts packages/hw-server/test/auth.test.ts
git commit -m "feat(hw-server): add JWT auth with login endpoint"
```

---

## Task 3: 实现 assess.ts — SSE 接口

**Files:**
- Create: `packages/hw-server/src/assess.ts`

- [ ] **Step 1: 写测试（assess.test.ts）**

```typescript
// 测试流式响应结构（每个 SSE 事件能正确解析）
// 测试非登录请求返回 401
```

- [ ] **Step 2: 实现 assess.ts**

```typescript
import { Hono } from "hono";
import type { AssessRequest } from "./types.js";
import { runPipeline } from "@mariozechner/pi-homework";
import { verifyToken } from "./auth.js";
import type { PipelineState } from "@mariozechner/pi-homework";

// 辅助：发送单个 SSE 事件
function sendEvent(stream: ReadableStreamDefaultWriter, type: string, data: unknown): void {
  const encoder = new TextEncoder();
  stream.write(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`));
}

// 核心：逐阶段推送 SSE 事件
async function runPipelineWithEvents(
  input: { image: string; meta: { grade: string; subject: string } },
  stream: ReadableStreamDefaultWriter,
): Promise<void> {
  const ctx = { startedAt: Date.now() };

  try {
    // 执行管道
    const output = await runPipeline({
      image: input.image,
      meta: input.meta,
    });

    // OCR 预览（从 rawOcr 提取）
    if (output.rawOcr?.blocks) {
      const preview = output.rawOcr.blocks.slice(0, 3).map(b => b.text).join(" | ");
      sendEvent(stream, "ocr", { preview });
    }

    // 推送 questions（当有结果时）
    sendEvent(stream, "questions", { questions: output.questions });

    // 推送完成
    sendEvent(stream, "done", {
      result: {
        questions: output.questions,
        processingTime: output.processingTime,
      },
    });
  } catch (err) {
    sendEvent(stream, "error", { error: String(err) });
  }
}

export function registerAssessRoutes(app: Hono): void {
  // POST /api/assess/stream — 需要 JWT 认证
  app.post("/api/assess/stream", async (c) => {
    // ── 认证 ──────────────────────────────────────────
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

    // ── 解析请求 ──────────────────────────────────────
    const body = await c.req.json<AssessRequest>();
    if (!body.image || !body.grade || !body.subject) {
      return c.json({ error: "Missing required fields: image, grade, subject" }, 400);
    }

    // ── 建立 SSE 流 ──────────────────────────────────
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // 立即发送初始 step
    await writer.write(encoder.encode(`event: step\ndata: ${JSON.stringify({ state: "INIT" })}\n\n`));

    // 后台执行管道
    runPipelineWithEvents(
      { image: body.image, meta: { grade: body.grade, subject: body.subject } },
      writer,
    ).finally(() => writer.close());

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  });
}
```

> **注意：** 当前 `runPipeline` 是同步调用，不是流式的。hw-server 在管道完成后一次性推送 `questions` 事件。后续如果要真正流式（边解题边展示），需要在 pi-homework 中增加 callback 机制。当前先实现简化版本：管道完成后推送所有事件。

- [ ] **Step 3: 跑测试**

```bash
# 先设置环境变量
export HW_ADMIN_USER=admin
export HW_ADMIN_PASS=admin123
export HW_JWT_SECRET=test-secret-key-at-least-32-chars!!
export TENCENT_MAAS_API_KEY=your-key-here  # 可选，无 key 则走 mock

npx tsx node_modules/vitest/cli.js --run packages/hw-server/test/assess.test.ts
```

- [ ] **Step 4: 提交**

```bash
git add packages/hw-server/src/assess.ts packages/hw-server/test/assess.test.ts
git commit -m "feat(hw-server): add SSE assess endpoint with pipeline bridge"
```

---

## Task 4: 实现 index.ts — Hono 入口

**Files:**
- Create: `packages/hw-server/src/index.ts`

- [ ] **Step 1: 实现 index.ts**

```typescript
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { registerAuthRoutes } from "./auth.js";
import { registerAssessRoutes } from "./assess.js";

const app = new Hono();

// ── 基础路由 ────────────────────────────────────────────────────────

app.get("/api/health", (c) =>
  c.json({ status: "ok", timestamp: Math.floor(Date.now() / 1000) })
);

// ── 挂载业务路由 ───────────────────────────────────────────────────

registerAuthRoutes(app);
registerAssessRoutes(app);

// ── 启动 ───────────────────────────────────────────────────────────

const port = Number(process.env.PORT ?? 3000);
console.log(`hw-server starting on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});

export default app;
```

- [ ] **Step 2: 手动启动验证**

```bash
# 在 packages/hw-server 目录
export HW_ADMIN_USER=admin
export HW_ADMIN_PASS=admin123
export HW_JWT_SECRET=test-secret-key-at-least-32-chars!!
node --import tsx src/index.ts  # 或用 tsx 直接跑

# 新终端测试
curl http://localhost:3000/api/health
# 预期: {"status":"ok","timestamp":...}

curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
# 预期: {"token":"eyJ...","expiresIn":86400}
```

- [ ] **Step 3: 提交**

```bash
git add packages/hw-server/src/index.ts
git commit -m "feat(hw-server): Hono entry point with all routes mounted"
```

---

## Task 5: 前端改动 — 新增 LoginView 和 API 封装

**Files:**
- Create: `packages/hw-web/src/LoginView.vue`
- Create: `packages/hw-web/src/api.ts`
- Modify: `packages/hw-web/src/App.vue`

- [ ] **Step 1: 创建 api.ts（API 请求封装）**

```typescript
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
const TOKEN_KEY = "hw_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export async function apiLogin(username: string, password: string): Promise<{ token: string }> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Login failed" }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function apiHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}

// fetch 包装器：自动带 auth header，401 时跳转登录
async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) {
    clearToken();
    window.location.href = "/"; // 重新加载页面触发登录页显示
    throw new Error("Unauthorized");
  }
  return res;
}

export { authFetch };
```

- [ ] **Step 2: 创建 LoginView.vue**

```vue
<script setup lang="ts">
import { ref } from "vue";
import { apiLogin, setToken } from "./api";

const username = ref("");
const password = ref("");
const error = ref("");
const loading = ref(false);
const emit = defineEmits<{ success: [] }>();

async function handleLogin() {
  if (!username.value || !password.value) {
    error.value = "请输入用户名和密码";
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    const { token } = await apiLogin(username.value, password.value);
    setToken(token);
    emit("success");
  } catch (err) {
    error.value = String(err);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <h2>作业批改系统</h2>
      <p class="subtitle">请先登录</p>
      <form @submit.prevent="handleLogin">
        <input v-model="username" class="input" type="text" placeholder="用户名" autocomplete="username" />
        <input v-model="password" class="input" type="password" placeholder="密码" autocomplete="current-password" />
        <button class="btn" type="submit" :disabled="loading">
          {{ loading ? "登录中..." : "登录" }}
        </button>
      </form>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  display: flex; align-items: center; justify-content: center;
  min-height: 100vh; background: #f5f5f5;
}
.login-card {
  background: #fff; border-radius: 12px; padding: 40px;
  width: 320px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}
.login-card h2 { text-align: center; margin-bottom: 8px; color: #1a1a1a; }
.subtitle { text-align: center; color: #888; font-size: 14px; margin-bottom: 24px; }
form { display: flex; flex-direction: column; gap: 12px; }
.input {
  padding: 10px 14px; border: 1px solid #ddd; border-radius: 8px;
  font-size: 14px; width: 100%;
}
.btn {
  padding: 10px; background: #4a90d9; color: #fff;
  border: none; border-radius: 8px; font-size: 15px; cursor: pointer;
}
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
.error { color: #e74c3c; font-size: 13px; text-align: center; margin-top: 8px; }
</style>
```

- [ ] **Step 3: 修改 App.vue — 加入登录状态切换**

```vue
<script setup lang="ts">
import { ref, onMounted } from "vue";
import type { HomeworkOutput, PipelineState, SolvedQuestion } from "./types";
import LoginView from "./LoginView.vue";
// ... 其他 imports ...

const isLoggedIn = ref(false);

onMounted(() => {
  // 检查是否已有有效 token
  const token = localStorage.getItem("hw_token");
  isLoggedIn.value = !!token;
});

function onLoginSuccess() {
  isLoggedIn.value = true;
}

// handleFile 中的 fetch 也需要改为 authFetch
// 原有 fetch 改为:
import { authFetch } from "./api";

// handleFile 中:
const res = await authFetch(`${API_BASE}/api/assess/stream`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ image: base64, grade: grade.value, subject: subject.value }),
});
</script>

<template>
  <!-- 未登录：显示登录页 -->
  <LoginView v-if="!isLoggedIn" @success="onLoginSuccess" />

  <!-- 已登录：显示主功能 -->
  <div v-else class="app">
    <!-- ... 原有的 header, main, ImageUploader 等全部移到这里 ... -->
  </div>
</template>
```

> **注意：** `handleFile` 函数中原来用 `fetch` 直接调用 `/api/assess/stream`，现在需要改用 `authFetch` 并拼接完整 URL。由于 `App.vue` 有 SSE 解析逻辑，保持不变，只需改 `fetch` → `authFetch` 并拼接完整 API URL。

- [ ] **Step 4: 提交**

```bash
git add packages/hw-web/src/LoginView.vue packages/hw-web/src/api.ts packages/hw-web/src/App.vue
git commit -m "feat(hw-web): add JWT login and API auth wrapper"
```

---

## Task 6: 环境变量配置与启动说明

**Files:**
- Create: `packages/hw-server/.env.example`
- Create: `packages/hw-server/README.md`

- [ ] **Step 1: 创建 .env.example**

```
# hw-server 环境变量配置
# 复制此文件为 .env 并填入实际值

# 管理员账号（必填）
HW_ADMIN_USER=admin
HW_ADMIN_PASS=admin123

# JWT 签名密钥（必填，建议 32+ 字符）
HW_JWT_SECRET=your-super-secret-jwt-key-at-least-32-chars

# 服务端口（可选，默认 3000）
PORT=3000

# 腾讯 Maas API（可选，不填则走 mock 模式）
TENCENT_MAAS_API_KEY=

# 腾讯云 OCR（可选，不填则用 mock）
TENCENT_SECRET_ID=
TENCENT_SECRET_KEY=
```

- [ ] **Step 2: 更新 hw-server package.json 添加 start 脚本**

```json
{
  "scripts": {
    "dev": "tsx src/index.ts",
    "start": "node dist/index.js",
    "build": "vite build && tsc -p tsconfig.build.json"
  }
}
```

- [ ] **Step 3: 创建 README.md**

```markdown
# @mariozechner/pi-hw-server

作业批改后端服务 — Hono + SSE + JWT 认证

## 快速开始

```bash
# 安装依赖
pnpm install

# 开发（直接运行 ts）
pnpm dev

# 生产构建
pnpm build
node dist/index.js
```

## 环境变量

复制 `.env.example` 为 `.env` 并配置：

| 变量 | 说明 | 必填 |
|------|------|------|
| HW_ADMIN_USER | 管理员用户名 | 是 |
| HW_ADMIN_PASS | 管理员密码 | 是 |
| HW_JWT_SECRET | JWT 签名密钥 | 是 |
| PORT | 服务端口 | 否，默认 3000 |
| TENCENT_MAAS_API_KEY | 腾讯 Maas API Key | 否（不填走 mock） |

## API 端点

- `POST /api/auth/login` — 登录
- `GET /api/health` — 健康检查
- `POST /api/assess/stream` — SSE 流式作业分析（需 Bearer token）
```

- [ ] **Step 4: 提交**

```bash
git add packages/hw-server/.env.example packages/hw-server/README.md
git commit -m "docs(hw-server): add env example and README"
```

---

## 实施顺序

1. **Task 1** — 创建目录骨架（package.json, tsconfig, vite.config, types.ts）
2. **Task 2** — auth.ts（登录 + JWT）
3. **Task 3** — assess.ts（SSE 管道桥接）
4. **Task 4** — index.ts（Hono 入口）
5. **Task 5** — 前端改动（LoginView + api.ts + App.vue）
6. **Task 6** — 环境变量 + README

---

## 设计注意点

1. **SSE 简化实现：** 当前 `runPipeline` 是同步的，SSE 事件在管道完成后一次性推送 `questions` + `done`。如果需要真正边解边展示，需要在 pi-homework 中加 callback 机制。当前版本先做简化版。

2. **JWT Secret 生产注意：** `HW_JWT_SECRET` 必须足够随机，建议用 `openssl rand -hex 32` 生成。

3. **mock 模式：** 不配置 `TENCENT_MAAS_API_KEY` 时，管道走 mock 路径（返回预定义题目），方便本地调试。

4. **前端 API URL：** 开发时指向 `localhost:3000`，生产通过 `VITE_API_BASE_URL` 环境变量配置。
