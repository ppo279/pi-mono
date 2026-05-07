# HW-App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a web app where students photograph homework questions, see AI-recognized text/images/formulas, and get step-by-step answers.

**Architecture:** New `packages/hw-app` package with a Hono server (API routes) and a React SPA frontend. SiliconFlow is called directly via OpenAI SDK (OpenAI-compatible API) — no modification to upstream `packages/ai`.

**Tech Stack:** Hono, React 18, Vite, TypeScript, TailwindCSS, react-markdown, KaTeX, OpenAI SDK (for SiliconFlow calls).

---

## File Structure

```
packages/hw-app/
├── src/
│   ├── server/
│   │   ├── index.ts              # Hono app entry, CORS, route registration
│   │   ├── llm/
│   │   │   └── siliconflow.ts    # SiliconFlow client (OpenAI SDK wrapper)
│   │   └── routes/
│   │       ├── ocr.ts            # POST /api/ocr
│   │       └── solve.ts          # POST /api/solve
│   └── web/
│       ├── main.tsx             # React entry
│       ├── App.tsx              # State machine: upload → review → answer
│       ├── components/
│       │   ├── ImageUploader.tsx
│       │   ├── QuestionDisplay.tsx  # react-markdown + KaTeX
│       │   └── AnswerDisplay.tsx
│       └── index.css            # TailwindCSS imports + KaTeX styles
├── package.json
├── tsconfig.json
├── tsconfig.app.json            # For Vite/Rollup React builds
└── vite.config.ts
```

**Key design decisions:**
- `packages/ai` is NOT used — SiliconFlow is called directly via OpenAI SDK with a custom base URL. This avoids modifying upstream.
- `packages/hw-app` is added to `pnpm-workspace.yaml` automatically via `packages/*` glob.
- No new workspace entry needed — the `packages/*` glob picks it up automatically.

---

## Task 1: Scaffold `packages/hw-app`

**Files:**
- Create: `packages/hw-app/package.json`
- Create: `packages/hw-app/tsconfig.json`
- Create: `packages/hw-app/tsconfig.app.json`
- Create: `packages/hw-app/vite.config.ts`
- Create: `packages/hw-app/index.html` (Vite HTML entry)

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
    "server": "tsx src/server/index.ts"
  },
  "dependencies": {
    "hono": "^4.6.0",
    "@hono/node-server": "^1.13.0",
    "openai": "^4.86.0",
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
    { "path": "./tsconfig.app.json" }
  ]
}
```

- [ ] **Step 3: Create `packages/hw-app/tsconfig.app.json`**

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

- [ ] **Step 4: Create `packages/hw-app/vite.config.ts`**

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

- [ ] **Step 5: Create `packages/hw-app/index.html`**

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

- [ ] **Step 6: Create `packages/hw-app/tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/web/**/*.{js,ts,jsx,tsx}'],
  theme: { extend: {} },
  plugins: [],
}
```

- [ ] **Step 7: Create `packages/hw-app/postcss.config.js`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 8: Commit**

```bash
cd packages/hw-app && git init && git add . && git commit -m "feat(hw-app): scaffold package structure"
```

---

## Task 2: SiliconFlow LLM Client

**Files:**
- Create: `packages/hw-app/src/server/llm/siliconflow.ts`

- [ ] **Step 1: Create `packages/hw-app/src/server/llm/siliconflow.ts`**

```ts
import OpenAI from 'openai'

const SILICONFLOW_BASE_URL = 'https://api.siliconflow.cn/v1'

export function createSiliconFlowClient(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: SILICONFLOW_BASE_URL,
  })
}

export interface OcrResult {
  markdown: string
}

export interface SolveResult {
  answer: string
  reasoning: string
}

const OCR_PROMPT = `You are a homework question parser. Given an image of a homework problem, extract all text, diagrams, and mathematical formulas. Output in Markdown format following these rules:
- Text content in plain Markdown
- Mathematical formulas in LaTeX: inline as $...$, block as $$...$$
- Images/diagrams extracted and embedded as ![图N](data:image/...) using base64
- Preserve the structure: separate 题目(statement) from 问题(question) if clearly demarcated
- Output ONLY the parsed Markdown, no additional commentary`

const SOLVE_PROMPT = `You are a patient math and science tutor. A homework problem is provided below, along with any relevant diagrams. Solve it step by step, showing your reasoning clearly.

Format your response as:
**答案**: [final answer in brief]
**解题过程**: [step-by-step reasoning, each step clearly numbered]`

export async function ocrImage(
  client: OpenAI,
  imageBase64: string,
): Promise<OcrResult> {
  const response = await client.responses.create({
    model: 'Qwen2.5-VL-7B-Instruct',
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: OCR_PROMPT },
          { type: 'input_image', image_url: `data:image/jpeg;base64,${imageBase64}` },
        ],
      },
    ],
  })

  const text = response.output_text ?? ''

  // Extract embedded base64 images from the markdown response
  // The model should have embedded them as ![图N](data:image/...)
  // We just return the text as-is for now
  return { markdown: text }
}

export async function solveQuestion(
  client: OpenAI,
  markdown: string,
  imageBase64?: string,
): Promise<SolveResult> {
  const content: Array<{ type: string; text?: string; image_url?: string }> = [
    { type: 'input_text', text: SOLVE_PROMPT + '\n\n下面是题目：\n\n' + markdown },
  ]

  if (imageBase64) {
    content.push({
      type: 'input_image',
      image_url: `data:image/jpeg;base64,${imageBase64}`,
    })
  }

  const response = await client.responses.create({
    model: 'deepseek-ai/DeepSeek-R1',
    input: [{ role: 'user', content }],
  })

  const text = response.output_text ?? ''

  // Parse the response: extract "**答案**:" and "**解题过程**:"
  const answerMatch = text.match(/\*\*答案\*\*:\s*(.+?)(?=\*\*解题过程\*\*:|$)/s)
  const reasoningMatch = text.match(/\*\*解题过程\*\*:\s*(.+?)$/s)

  return {
    answer: answerMatch?.[1]?.trim() ?? text,
    reasoning: reasoningMatch?.[1]?.trim() ?? '',
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/hw-app/src/server/llm/siliconflow.ts
git commit -m "feat(hw-app): add SiliconFlow LLM client for OCR and solve"
```

---

## Task 3: Hono Server Routes

**Files:**
- Create: `packages/hw-app/src/server/routes/ocr.ts`
- Create: `packages/hw-app/src/server/routes/solve.ts`
- Create: `packages/hw-app/src/server/index.ts`

- [ ] **Step 1: Create `packages/hw-app/src/server/routes/ocr.ts`**

```ts
import { Hono } from 'hono'
import { createSiliconFlowClient, ocrImage } from '../llm/siliconflow.js'

const app = new Hono()

app.post('/', async (c) => {
  const apiKey = process.env.SILICONFLOW_API_KEY
  if (!apiKey) {
    return c.json({ error: 'SILICONFLOW_API_KEY not configured' }, 500)
  }

  const body = await c.req.json<{ image: string }>()
  const { image } = body

  if (!image) {
    return c.json({ error: 'image is required' }, 400)
  }

  // Strip data URL prefix if present
  const base64 = image.replace(/^data:image\/\w+;base64,/, '')

  // Check size (10MB limit ≈ ~7MB base64)
  if (base64.length > 7_000_000) {
    return c.json({ error: '图片太大，请压缩后重试' }, 413)
  }

  try {
    const client = createSiliconFlowClient(apiKey)
    const result = await ocrImage(client, base64)
    const sessionId = crypto.randomUUID()
    return c.json({ id: sessionId, markdown: result.markdown })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('429') || message.includes('rate limit')) {
      return c.json({ error: '请求太频繁，稍后再试' }, 429)
    }
    return c.json({ error: '识别失败，请重试' }, 502)
  }
})

export default app
```

- [ ] **Step 2: Create `packages/hw-app/src/server/routes/solve.ts`**

```ts
import { Hono } from 'hono'
import { createSiliconFlowClient, solveQuestion } from '../llm/siliconflow.js'

const app = new Hono()

app.post('/', async (c) => {
  const apiKey = process.env.SILICONFLOW_API_KEY
  if (!apiKey) {
    return c.json({ error: 'SILICONFLOW_API_KEY not configured' }, 500)
  }

  const body = await c.req.json<{ sessionId: string; markdown: string; image?: string }>()
  const { sessionId, markdown, image } = body

  if (!markdown) {
    return c.json({ error: 'markdown is required' }, 400)
  }

  try {
    const client = createSiliconFlowClient(apiKey)
    const base64 = image?.replace(/^data:image\/\w+;base64,/, '')
    const result = await solveQuestion(client, markdown, base64)
    return c.json({ sessionId, answer: result.answer, reasoning: result.reasoning })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('429') || message.includes('rate limit')) {
      return c.json({ error: '请求太频繁，稍后再试' }, 429)
    }
    return c.json({ error: '解析失败，请重试' }, 502)
  }
})

export default app
```

- [ ] **Step 3: Create `packages/hw-app/src/server/index.ts`**

```ts
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { trimTrailingSlash } from 'hono/trailing-slash'
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

const port = Number(process.env.HW_APP_PORT ?? 3000)

console.log(`HW-App server starting on port ${port}`)

serve({ fetch: app.fetch, port })

export default app
```

- [ ] **Step 4: Commit**

```bash
git add packages/hw-app/src/server/routes/ packages/hw-app/src/server/index.ts
git commit -m "feat(hw-app): add Hono server with /api/ocr and /api/solve routes"
```

---

## Task 4: React Frontend

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
      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageDataUrl }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `OCR failed: ${res.status}`)
      }
      const data = await res.json()
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
      const res = await fetch('/api/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: reviewData.sessionId,
          markdown: reviewData.markdown,
          image: reviewData.imageDataUrl,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Solve failed: ${res.status}`)
      }
      const data = await res.json()
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

  function handleFile(file: File) {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      onImageSelected(dataUrl)
    }
    reader.readAsDataURL(file)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <div
      className="w-full max-w-2xl border-2 border-dashed border-gray-300 rounded-xl p-12 text-center cursor-pointer hover:border-blue-400 transition"
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleChange}
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
          <img
            src={imageUrl}
            alt="题目图片"
            className="max-w-full rounded-lg"
          />
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
                  className="max-w-full rounded-lg cursor-zoom-in"
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
          <ReactMarkdown
            remarkPlugins={[remarkMath]}
            rehypePlugins={[rehypeKatex]}
          >
            {answer}
          </ReactMarkdown>
        </div>
      </div>

      {reasoning && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-blue-600 mb-3">解题过程</h2>
          <div className="prose prose-blue max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkMath]}
              rehypePlugins={[rehypeKatex]}
            >
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
git commit -m "feat(hw-app): add React frontend with upload, review, and answer states"
```

---

## Task 5: Add Scripts and Verify

**Files:**
- Modify: `package.json` (add `dev:hw-app` and `server:hw-app` scripts)
- Modify: `.env.example` (add SiliconFlow key and port vars)

- [ ] **Step 1: Add dev scripts to root `package.json`**

Add to the `scripts` section:

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

- [ ] **Step 3: Commit**

```bash
git add package.json .env.example
git commit -m "config(hw-app): add dev scripts and environment variables"
```

- [ ] **Step 4: Verify install and types**

```bash
cd packages/hw-app && npm install
npm run check  # should pass (biome + tsc)
```

---

## Spec Coverage Check

- [x] OCR via Qwen2.5-VL → POST /api/ocr (Task 2 + Task 3)
- [x] Solve via DeepSeek-R1 → POST /api/solve (Task 2 + Task 3)
- [x] Markdown output with images + LaTeX (Task 2 + Task 4)
- [x] react-markdown + KaTeX rendering (Task 4)
- [x] Read-only question display (Task 4)
- [x] Three UI states: upload / review / answer (Task 4)
- [x] Error handling with user-friendly messages (Task 3)
- [x] Environment variables for API key and port (Task 5)
- [x] No modification to upstream packages (all new files under packages/hw-app)
