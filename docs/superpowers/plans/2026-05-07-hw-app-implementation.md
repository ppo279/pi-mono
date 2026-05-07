# HW-App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a web app where students photograph homework questions, see AI-recognized text/images/formulas, and get step-by-step answers.

**Architecture:** New `packages/hw-app` package with a Hono server (API routes) and a React SPA frontend. SiliconFlow is called directly via OpenAI SDK (OpenAI-compatible API) — no modification to upstream `packages/ai`.

**Tech Stack:** Hono, React 18, Vite, TypeScript, TailwindCSS, react-markdown, KaTeX, Zod, OpenAI SDK.

---

## Critical Pre-condition: Phase 0

> ⚠️ **Before any code is written**, SiliconFlow API compatibility MUST be verified. This is Phase 0 — blocking all other phases.

### Phase 0: API Compatibility Verification

**Goal:** Confirm exactly which API endpoints and models SiliconFlow supports for Qwen2.5-VL and DeepSeek-R1.

**Steps:**

- [ ] **Step 1: Check SiliconFlow API documentation**

Navigate to `https://docs.siliconflow.cn` and find:
1. Which API variant does Qwen2.5-VL use? (Responses API / Chat Completions API / other)
2. Does DeepSeek-R1 support image input?

- [ ] **Step 2: Test with a minimal curl request**

```bash
# Replace $SILICONFLOW_API_KEY with your actual key
# Test Chat Completions (if that's what SiliconFlow uses)
curl https://api.siliconflow.cn/v1/chat/completions \
  -H "Authorization: Bearer $SILICONFLOW_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Qwen2.5-VL-7B-Instruct",
    "messages": [{"role": "user", "content": "What is 2+2?"}]
  }'

# Test Responses API (alternative)
curl https://api.siliconflow.cn/v1/responses \
  -H "Authorization: Bearer $SILICONFLOW_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Qwen2.5-VL-7B-Instruct",
    "input": [{"role": "user", "content": [{"type": "input_text", "text": "What is 2+2?"}]}]
  }'
```

Record which API works and what the response format looks like.

- [ ] **Step 3: Verify DeepSeek-R1 input constraints**

Test whether DeepSeek-R1 accepts image content blocks. If it does not, we must only send text (markdown from OCR step) to the solve endpoint.

- [ ] **Step 4: Document findings**

Create `packages/hw-app/API_COMPATIBILITY.md` with:
```
## Qwen2.5-VL-7B-Instruct
- API variant: [Chat Completions / Responses / other]
- Works with OpenAI SDK: [yes/no]
- Image input format: [base64 data URL / URL / other]

## DeepSeek-R1
- Image input supported: [yes/no]
- If no: solve step sends only markdown text (no image)
```

**If API compatibility differs from assumptions, update the plan before proceeding to Phase 1.**

---

## File Structure

```
packages/hw-app/
├── src/
│   ├── server/
│   │   ├── index.ts              # Hono app entry, CORS, route registration
│   │   ├── llm/
│   │   │   ├── siliconflow.ts    # SiliconFlow client (OpenAI SDK wrapper)
│   │   │   └── types.ts         # Shared LLM types
│   │   ├── routes/
│   │   │   ├── ocr.ts           # POST /api/ocr
│   │   │   └── solve.ts         # POST /api/solve
│   │   └── validation.ts         # Zod schemas for request validation
│   └── web/
│       ├── main.tsx
│       ├── App.tsx
│       ├── components/
│       │   ├── ImageUploader.tsx
│       │   ├── QuestionDisplay.tsx
│       │   └── AnswerDisplay.tsx
│       └── index.css
├── package.json
├── tsconfig.json                 # Root: references both server and app
├── tsconfig.server.json          # Server TypeScript config (for tsx)
├── tsconfig.app.json             # React/Vite TypeScript config
├── vite.config.ts
└── API_COMPATIBILITY.md          # Phase 0 output
```

**Key design decisions:**
- `packages/ai` is NOT used — SiliconFlow is called directly via OpenAI SDK with custom base URL
- Server TypeScript uses `tsconfig.server.json` (separate from Vite/Rollup app config)
- Zod validates all incoming request bodies before processing
- Solve step does NOT pass image to DeepSeek-R1 (DeepSeek-R1 is text-only)

---

## Phase 1: Scaffold `packages/hw-app`

**Goal:** Package skeleton with correct TypeScript coverage for both server and client.

**Files:**
- Create: `packages/hw-app/package.json`
- Create: `packages/hw-app/tsconfig.json`
- Create: `packages/hw-app/tsconfig.server.json`
- Create: `packages/hw-app/tsconfig.app.json`
- Create: `packages/hw-app/vite.config.ts`
- Create: `packages/hw-app/index.html`
- Create: `packages/hw-app/tailwind.config.js`
- Create: `packages/hw-app/postcss.config.js`

- [ ] **Step 1: Create `packages/hw-app/package.json`**

```json
{
  "name": "@pi-mono/hw-app",
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -p tsconfig.app.json && vite build",
    "preview": "vite preview",
    "server": "tsx --tsconfig tsconfig.server.json src/server/index.ts",
    "typecheck": "tsc -p tsconfig.server.json --noEmit && tsc -p tsconfig.app.json --noEmit"
  },
  "dependencies": {
    "hono": "^4.6.0",
    "@hono/node-server": "^1.13.0",
    "openai": "^4.86.0",
    "zod": "^3.23.8",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-markdown": "^9.0.1",
    "remark-math": "^6.0.0",
    "rehype-katex": "^7.0.1",
    "katex": "^0.16.11"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.16",
    "tsx": "^4.20.0",
    "typescript": "^5.7.2",
    "vite": "^6.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/hw-app/tsconfig.json`**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.server.json" },
    { "path": "./tsconfig.app.json" }
  ]
}
```

- [ ] **Step 3: Create `packages/hw-app/tsconfig.server.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "noEmit": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true
  },
  "include": ["src/server"]
}
```

- [ ] **Step 4: Create `packages/hw-app/tsconfig.app.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src/web"]
}
```

- [ ] **Step 5: Create `packages/hw-app/vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  root: '.',
  build: {
    outDir: 'dist/web',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
```

- [ ] **Step 6: Create `packages/hw-app/index.html`**

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>作业助手</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/web/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create `packages/hw-app/tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/web/**/*.{js,ts,jsx,tsx}'],
  theme: { extend: {} },
  plugins: [],
}
```

- [ ] **Step 8: Create `packages/hw-app/postcss.config.js`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 9: Verify TypeScript coverage**

```bash
cd packages/hw-app
npm install
npm run typecheck
# Expected: no errors (both server and web type-checked)
```

- [ ] **Step 10: Commit**

```bash
git add packages/hw-app/
git commit -m "feat(hw-app): scaffold package structure with separate tsconfigs"
```

**Phase 1 Acceptance Criteria:**
- [ ] `npm run typecheck` passes for both server and web
- [ ] `npm run server` starts without errors (will 500 on /api routes, that's fine — routes not created yet)
- [ ] `npm run dev` serves the HTML shell

---

## Phase 2: SiliconFlow LLM Client + Validation

**Goal:** LLM client with correct API calls and Zod request validation.

**Files:**
- Create: `packages/hw-app/src/server/llm/types.ts`
- Create: `packages/hw-app/src/server/llm/siliconflow.ts`
- Create: `packages/hw-app/src/server/validation.ts`

- [ ] **Step 1: Create `packages/hw-app/src/server/validation.ts`**

```ts
import { z } from 'zod'

export const OcrRequestSchema = z.object({
  image: z.string().min(1, 'image is required'),
})

export const SolveRequestSchema = z.object({
  sessionId: z.string().uuid().optional(),
  markdown: z.string().min(1, 'markdown is required'),
})

export type OcrRequest = z.infer<typeof OcrRequestSchema>
export type SolveRequest = z.infer<typeof SolveRequestSchema>

/**
 * Parses and validates the raw request body.
 * Throws a Zod error with friendly message if invalid.
 */
export function parseOcrRequest(body: unknown): OcrRequest {
  return OcrRequestSchema.parse(body)
}

export function parseSolveRequest(body: unknown): SolveRequest {
  return SolveRequestSchema.parse(body)
}
```

- [ ] **Step 2: Create `packages/hw-app/src/server/llm/types.ts`**

```ts
export interface OcrResult {
  markdown: string
}

export interface SolveResult {
  answer: string
  reasoning: string
}
```

- [ ] **Step 3: Create `packages/hw-app/src/server/llm/siliconflow.ts`**

> ⚠️ This file uses Chat Completions API. Update if Phase 0 reveals SiliconFlow uses a different API variant.

```ts
import OpenAI from 'openai'
import type { OcrResult, SolveResult } from './types.js'

const SILICONFLOW_BASE_URL = 'https://api.siliconflow.cn/v1'

export function createSiliconFlowClient(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: SILICONFLOW_BASE_URL,
  })
}

const OCR_PROMPT = `You are a homework question parser. Given an image of a homework problem, extract all text, diagrams, and mathematical formulas. Output in Markdown format following these rules:
- Text content in plain Markdown
- Mathematical formulas in LaTeX: inline as $...$, block as $$...$$
- Images/diagrams extracted and embedded as ![图N](data:image/...) using base64
- Preserve the structure: separate 题目(statement) from 问题(question) if clearly demarcated
- Output ONLY the parsed Markdown, no additional commentary`

const SOLVE_PROMPT = `You are a patient math and science tutor. A homework problem is provided below. Solve it step by step, showing your reasoning clearly.

Format your response as:
**答案**: [final answer in brief]
**解题过程**: [step-by-step reasoning, each step clearly numbered]`

/**
 * OCR image using Qwen2.5-VL via Chat Completions API.
 * Image is sent as base64 data URL in a user message with the prompt.
 */
export async function ocrImage(
  client: OpenAI,
  imageDataUrl: string,
): Promise<OcrResult> {
  // Normalize: ensure data URL has correct mime type
  const imageContent = imageDataUrl.startsWith('data:')
    ? imageDataUrl
    : `data:image/jpeg;base64,${imageDataUrl}`

  const response = await client.chat.completions.create({
    model: 'Qwen2.5-VL-7B-Instruct',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: OCR_PROMPT },
          {
            type: 'image_url',
            image_url: { url: imageContent, detail: 'high' },
          },
        ],
      },
    ],
    max_tokens: 4096,
  })

  const text = response.choices[0]?.message?.content ?? ''
  return { markdown: text }
}

/**
 * Solve question using DeepSeek-R1.
 * IMPORTANT: DeepSeek-R1 is a text-only model. We send only the markdown
 * (already extracted by OCR) — no image data.
 *
 * If the response format is unexpected, we return a safe fallback
 * that displays as a structured error rather than raw markdown.
 */
export async function solveQuestion(
  client: OpenAI,
  markdown: string,
): Promise<SolveResult> {
  const response = await client.chat.completions.create({
    model: 'deepseek-ai/DeepSeek-R1',
    messages: [
      {
        role: 'user',
        content: `${SOLVE_PROMPT}\n\n下面是题目：\n\n${markdown}`,
      },
    ],
    max_tokens: 4096,
  })

  const text = response.choices[0]?.message?.content ?? ''

  // Parse structured response
  const answerMatch = text.match(/\*\*答案\*\*:\s*([\s\S]+?)(?=\*\*解题过程\*\*:|$)/)
  const reasoningMatch = text.match(/\*\*解题过程\*\*:\s*([\s\S]+?)$/)

  const rawAnswer = answerMatch?.[1]?.trim() ?? ''
  const rawReasoning = reasoningMatch?.[1]?.trim() ?? ''

  // If parsing failed, return a safe error indicator
  // Do NOT fall back to raw markdown — it would be rendered as broken KaTeX
  if (!rawAnswer) {
    return {
      answer: '⚠️ 答案解析失败，请重试',
      reasoning: rawReasoning || '⚠️ 解题过程解析失败，请重试',
    }
  }

  return {
    answer: rawAnswer,
    reasoning: rawReasoning,
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/hw-app/src/server/llm/ packages/hw-app/src/server/validation.ts
git commit -m "feat(hw-app): add SiliconFlow client and Zod validation"
```

**Phase 2 Acceptance Criteria:**
- [ ] `npm run typecheck` passes
- [ ] `GET /health` returns `{ ok: true }`
- [ ] `POST /api/ocr` with a real image returns markdown
- [ ] `POST /api/solve` with markdown returns structured answer + reasoning
- [ ] Invalid request body (missing `image`) returns 400 with Zod error message

---

## Phase 3: Hono Server Routes

**Goal:** API routes with proper error handling, rate limit detection, and type-safe validation.

**Files:**
- Create: `packages/hw-app/src/server/routes/ocr.ts`
- Create: `packages/hw-app/src/server/routes/solve.ts`
- Modify: `packages/hw-app/src/server/index.ts`

- [ ] **Step 1: Create `packages/hw-app/src/server/routes/ocr.ts`**

```ts
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import OpenAI from 'openai'
import { parseOcrRequest } from '../validation.js'
import { createSiliconFlowClient, ocrImage } from '../llm/siliconflow.js'

const app = new Hono()

app.post('/', async (c) => {
  const apiKey = process.env.SILICONFLOW_API_KEY
  if (!apiKey) {
    throw new HTTPException(500, { message: 'SILICONFLOW_API_KEY not configured' })
  }

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    throw new HTTPException(400, { message: 'Invalid JSON body' })
  }

  const parsed = parseOcrRequest(body)

  // Strip data URL prefix for size check
  const base64 = parsed.image.replace(/^data:image\/\w+;base64,/, '')
  if (base64.length > 7_000_000) {
    throw new HTTPException(413, { message: '图片太大，请压缩后重试' })
  }

  try {
    const client = createSiliconFlowClient(apiKey)
    const result = await ocrImage(client, parsed.image)
    const sessionId = crypto.randomUUID()
    return c.json({ id: sessionId, markdown: result.markdown })
  } catch (err) {
    // Distinguish rate limit from other errors
    if (isOpenAIError(err) && err.status === 429) {
      throw new HTTPException(429, { message: '请求太频繁，稍后再试' })
    }
    throw new HTTPException(502, { message: '识别失败，请重试' })
  }
})

function isOpenAIError(err: unknown): err is OpenAI.Error & { status: number } {
  return err instanceof Error && 'status' in err
}

export default app
```

- [ ] **Step 2: Create `packages/hw-app/src/server/routes/solve.ts`**

```ts
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { parseSolveRequest } from '../validation.js'
import { createSiliconFlowClient, solveQuestion } from '../llm/siliconflow.js'

const app = new Hono()

app.post('/', async (c) => {
  const apiKey = process.env.SILICONFLOW_API_KEY
  if (!apiKey) {
    throw new HTTPException(500, { message: 'SILICONFLOW_API_KEY not configured' })
  }

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    throw new HTTPException(400, { message: 'Invalid JSON body' })
  }

  const parsed = parseSolveRequest(body)

  try {
    const client = createSiliconFlowClient(apiKey)
    // Note: no image passed — DeepSeek-R1 is text-only
    const result = await solveQuestion(client, parsed.markdown)
    return c.json({
      sessionId: parsed.sessionId ?? '',
      answer: result.answer,
      reasoning: result.reasoning,
    })
  } catch (err) {
    if (isOpenAIError(err) && err.status === 429) {
      throw new HTTPException(429, { message: '请求太频繁，稍后再试' })
    }
    throw new HTTPException(502, { message: '解析失败，请重试' })
  }
})

function isOpenAIError(err: unknown): err is Error & { status: number } {
  return err instanceof Error && 'status' in err
}

export default app
```

- [ ] **Step 3: Create `packages/hw-app/src/server/index.ts`**

```ts
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { trimTrailingSlash } from 'hono/trailing-slash'
import { setRespondedHeadersAndLog } from 'hono/request-log'
import ocrRoute from './routes/ocr.js'
import solveRoute from './routes/solve.js'

const app = new Hono()

app.use('*', trimTrailingSlash())
app.use(
  '*',
  cors({
    origin: process.env.HW_APP_CORS_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  }),
)

app.get('/health', (c) => c.json({ ok: true }))

app.route('/api/ocr', ocrRoute)
app.route('/api/solve', solveRoute)

// Global error handler
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status)
  }
  console.error('Unhandled error:', err)
  return c.json({ error: '服务器内部错误' }, 500)
})

const port = Number(process.env.HW_APP_PORT ?? 3000)

console.log(`HW-App server starting on port ${port}`)

serve({ fetch: app.fetch, port })

export default app

// Re-export for type safety
import type { HTTPException } from 'hono/http-exception'
```

- [ ] **Step 4: Commit**

```bash
git add packages/hw-app/src/server/
git commit -m "feat(hw-app): add Hono server with /api/ocr and /api/solve routes"
```

**Phase 3 Acceptance Criteria:**
- [ ] `GET /health` → `200 { ok: true }`
- [ ] `POST /api/ocr` with valid image → `200 { id, markdown }`
- [ ] `POST /api/ocr` with missing `image` → `400` with Zod error
- [ ] `POST /api/ocr` with oversized body → `413`
- [ ] `POST /api/solve` with valid markdown → `200 { answer, reasoning }`
- [ ] `POST /api/solve` with missing `markdown` → `400` with Zod error

---

## Phase 4: React Frontend

**Goal:** Complete SPA with three states: upload → review → answer.

**Files:**
- Create: `packages/hw-app/src/web/main.tsx`
- Create: `packages/hw-app/src/web/index.css`
- Create: `packages/hw-app/src/web/App.tsx`
- Create: `packages/hw-app/src/web/components/ImageUploader.tsx`
- Create: `packages/hw-app/src/web/components/QuestionDisplay.tsx`
- Create: `packages/hw-app/src/web/components/AnswerDisplay.tsx`

- [ ] **Step 1: Create `packages/hw-app/src/web/main.tsx`**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.js'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 2: Create `packages/hw-app/src/web/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  @apply bg-gray-50 text-gray-900 antialiased;
}

/* KaTeX error display — prevent broken formulas from breaking page */
.katex-error {
  color: #dc2626;
  background: #fef2f2;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.875em;
}
```

- [ ] **Step 3: Create `packages/hw-app/src/web/App.tsx`**

```tsx
import { useState } from 'react'
import ImageUploader from './components/ImageUploader.js'
import QuestionDisplay from './components/QuestionDisplay.js'
import AnswerDisplay from './components/AnswerDisplay.js'

type AppState = 'upload' | 'review' | 'answer'

export interface ReviewData {
  sessionId: string
  markdown: string
  imageDataUrl: string
}

export interface AnswerData {
  answer: string
  reasoning: string
}

interface ApiError {
  error: string
}

async function apiFetch(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as ApiError
    throw new Error(data.error ?? `请求失败 (${res.status})`)
  }
  return res.json()
}

export default function App() {
  const [appState, setAppState] = useState<AppState>('upload')
  const [reviewData, setReviewData] = useState<ReviewData | null>(null)
  const [answerData, setAnswerData] = useState<AnswerData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleImageSelected(imageDataUrl: string) {
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch('/api/ocr', { image: imageDataUrl }) as {
        id: string
        markdown: string
      }
      setReviewData({ sessionId: data.id, markdown: data.markdown, imageDataUrl })
      setAppState('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : '识别失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  async function handleSolve() {
    if (!reviewData) return
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch('/api/solve', {
        sessionId: reviewData.sessionId,
        markdown: reviewData.markdown,
      }) as { answer: string; reasoning: string }
      setAnswerData({ answer: data.answer, reasoning: data.reasoning })
      setAppState('answer')
    } catch (e) {
      setError(e instanceof Error ? e.message : '解析失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  function handleReset() {
    setAppState('upload')
    setReviewData(null)
    setAnswerData(null)
    setError(null)
  }

  return (
    <div className="min-h-screen flex flex-col items-center py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">作业助手</h1>

      {error && (
        <div className="w-full max-w-2xl mb-4 p-4 bg-red-50 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {appState === 'upload' && (
        <ImageUploader onImageSelected={handleImageSelected} loading={loading} />
      )}

      {appState === 'review' && reviewData && (
        <div className="w-full max-w-2xl space-y-4">
          <QuestionDisplay markdown={reviewData.markdown} imageUrl={reviewData.imageDataUrl} />
          <div className="flex gap-3">
            <button
              onClick={handleReset}
              className="flex-1 py-3 px-6 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium transition"
            >
              重新拍照
            </button>
            <button
              onClick={handleSolve}
              disabled={loading}
              className="flex-1 py-3 px-6 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg font-medium transition"
            >
              {loading ? '解析中...' : '解析'}
            </button>
          </div>
        </div>
      )}

      {appState === 'answer' && answerData && (
        <div className="w-full max-w-2xl space-y-4">
          <AnswerDisplay answer={answerData.answer} reasoning={answerData.reasoning} />
          <button
            onClick={handleReset}
            className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
          >
            再来一题
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create `packages/hw-app/src/web/components/ImageUploader.tsx`**

```tsx
import { useRef } from 'react'

interface Props {
  onImageSelected: (dataUrl: string) => void
  loading: boolean
}

export default function ImageUploader({ onImageSelected, loading }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  function processFile(file: File) {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (e) => onImageSelected(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  return (
    <div
      className="w-full max-w-2xl border-2 border-dashed border-gray-300 rounded-xl p-12 text-center cursor-pointer hover:border-blue-400 transition"
      onDrop={(e) => { e.preventDefault(); processFile(e.dataTransfer.files[0]) }}
      onDragOver={(e) => e.preventDefault()}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f) }}
      />
      <div className="text-5xl mb-4">📷</div>
      <p className="text-lg font-medium text-gray-700">拍照或上传图片</p>
      <p className="text-sm text-gray-500 mt-2">点击上传 · 支持 JPG/PNG</p>
      {loading && <p className="mt-4 text-blue-600 animate-pulse">识别中...</p>}
    </div>
  )
}
```

- [ ] **Step 5: Create `packages/hw-app/src/web/components/QuestionDisplay.tsx`**

```tsx
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'

interface Props {
  markdown: string
  imageUrl: string
}

export default function QuestionDisplay({ markdown, imageUrl }: Props) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="mb-4">
          <img src={imageUrl} alt="题目图片" className="max-w-full rounded-lg" />
        </div>
        <div className="prose prose-blue max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={{
              img: ({ src, alt }) => (
                <img
                  src={src}
                  alt={alt ?? ''}
                  className="max-w-full rounded-lg"
                  style={{ maxHeight: '300px', objectFit: 'contain' }}
                />
              ),
            }}
          >
            {markdown}
          </ReactMarkdown>
        </div>
      </div>
      <p className="text-xs text-gray-400 text-center">识别结果仅供确认，如有问题请重新拍照</p>
    </div>
  )
}
```

- [ ] **Step 6: Create `packages/hw-app/src/web/components/AnswerDisplay.tsx`**

```tsx
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'

interface Props {
  answer: string
  reasoning: string
}

export default function AnswerDisplay({ answer, reasoning }: Props) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-bold text-green-600 mb-3">答案</h2>
        <div className="prose prose-green max-w-none">
          <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
            {answer}
          </ReactMarkdown>
        </div>
      </div>

      {reasoning && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-blue-600 mb-3">解题过程</h2>
          <div className="prose prose-blue max-w-none">
            <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
              {reasoning}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 7: Commit**

```bash
git add packages/hw-app/src/web/
git commit -m "feat(hw-app): add React frontend with three-state flow"
```

**Phase 4 Acceptance Criteria:**
- [ ] `npm run build` succeeds → `dist/web/index.html` exists
- [ ] Dev server serves page without console errors
- [ ] Full flow: upload image → see markdown → click 解析 → see answer
- [ ] Mobile viewport layout is usable (responsive)

---

## Phase 5: Scripts + Environment + CI Gate

**Goal:** Dev scripts, env documentation, and quality gate.

**Files:**
- Modify: `package.json` (add `dev:hw-app` script)
- Modify: `.env.example` (add variables)
- Create: `packages/hw-app/biome.json` ( Biome config for this package)

- [ ] **Step 1: Add to root `package.json` scripts**

```json
"dev:hw-app": "concurrently --names \"hw-server,hw-web\" --prefix-colors \"cyan,magenta\" \"cd packages/hw-app && npm run server\" \"cd packages/hw-app && npm run dev\""
```

- [ ] **Step 2: Add to `.env.example`**

```env
# SiliconFlow API Key (get from https://cloud.siliconflow.cn)
SILICONFLOW_API_KEY=sk-...

# HW-App server port
HW_APP_PORT=3000

# Frontend dev server URL (for CORS)
HW_APP_CORS_ORIGIN=http://localhost:5173
```

- [ ] **Step 3: Create `packages/hw-app/biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": { "noUnusedVariables": "error" }
    }
  },
  "formatter": { "indentStyle": "spaces", "indentWidth": 2 }
}
```

- [ ] **Step 4: Commit**

```bash
git add package.json .env.example packages/hw-app/biome.json
git commit -m "config(hw-app): add dev scripts and biome config"
```

**Phase 5 Acceptance Criteria:**
- [ ] `npm run dev:hw-app` starts both server and frontend
- [ ] `cd packages/hw-app && npx biome check src/` passes
- [ ] `cd packages/hw-app && npm run typecheck` passes

---

## Test Plan (Phase 6 — Optional for v1)

If time permits, add tests after Phase 5:

### Unit Tests (`packages/hw-app/src/server/llm/siliconflow.test.ts`)
- Mock OpenAI client, verify `ocrImage` sends correct model + content
- Mock OpenAI client, verify `solveQuestion` parses answer/reasoning correctly
- Fallback when response format is unexpected

### Integration Tests (`packages/hw-app/src/server/routes/ocr.test.ts`)
- Valid request → 200 + markdown in body
- Missing image → 400
- Image too large → 413
- SiliconFlow 429 → 429 returned to client

### E2E Tests (Playwright)
- Upload flow: image → markdown → answer display
- Error flow: server down → error message shown

---

## Spec Coverage Check

- [x] OCR via Qwen2.5-VL → POST /api/ocr (Phase 2 + Phase 3)
- [x] Solve via DeepSeek-R1 (text-only, no image) → POST /api/solve (Phase 2 + Phase 3)
- [x] Markdown output with images + LaTeX (Phase 2 + Phase 4)
- [x] react-markdown + KaTeX rendering (Phase 4)
- [x] Read-only question display (Phase 4)
- [x] Three UI states: upload / review / answer (Phase 4)
- [x] Error handling with user-friendly messages (Phase 3)
- [x] Zod request validation (Phase 2)
- [x] Environment variables for API key and port (Phase 5)
- [x] No modification to upstream packages (all new files under packages/hw-app)
- [x] Separate tsconfig for server TypeScript (Phase 1)
- [x] Safe fallback when LLM response format is unexpected (Phase 2)
- [x] Rate limit detection via error status code, not string matching (Phase 3)
