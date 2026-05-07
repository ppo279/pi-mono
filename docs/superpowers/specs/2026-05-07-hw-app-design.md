# HW-App Design: Image-based Homework Assistant

## Overview

A web application where students photograph or upload homework questions and receive AI-powered answers. Built as a new package under `packages/hw-app`, extending pi-mono without modifying existing packages.

**Core principle:** All new code lives in `packages/hw-app/`. Upstream pi-mono packages are consumed as dependencies and never modified.

---

## Architecture

```
pi-mono/
├── packages/
│   ├── ai/            ← upstream, consumed via import
│   ├── agent/         ← upstream, consumed via import
│   └── hw-app/        ← NEW, self-contained
│       ├── src/
│       │   ├── server/          # Hono HTTP server
│       │   │   ├── index.ts      # Entry point
│       │   │   └── routes/
│       │   │       ├── ocr.ts    # POST /api/ocr
│       │   │       └── solve.ts   # POST /api/solve
│       │   └── web/              # Frontend SPA
│       │       ├── App.tsx
│       │       ├── components/
│       │       │   ├── ImageUploader.tsx
│       │       │   ├── QuestionDisplay.tsx
│       │       │   └── AnswerDisplay.tsx
│       │       └── utils/
│       │           └── renderMarkdown.ts
│       └── package.json
```

### Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| Server | Hono | Lightweight, works in pi-mono workspace |
| AI Client | `packages/ai` | Reuse existing LLM abstraction |
| Frontend | React + TypeScript | Standard SPA |
| Markdown | react-markdown | Render question content |
| Math | KaTeX | LaTeX formula rendering |
| Styling | TailwindCSS | Rapid UI development |

---

## Data Flow

```
[User Photo]
    ↓
POST /api/ocr
    ↓
Qwen2.5-VL-7B-Instruct (SiliconFlow)
    ↓
Returns Markdown: text + ![images]() + $LaTeX$
    ↓
Frontend: read-only display
  - Text paragraphs → <p>
  - Inline formulas → KaTeX <span>
  - Block formulas → KaTeX <div>
  - Extracted images → <img> with captions
    ↓
[User clicks "解析"]
    ↓
POST /api/solve
    ↓
DeepSeek-R1 (SiliconFlow)
    ↓
Returns: { answer, reasoning }
    ↓
Frontend: display answer + reasoning
```

---

## API Design

### POST /api/ocr

**Request:**
```json
{
  "image": "data:image/jpeg;base64,..."   // or URL string
}
```

**Response:**
```json
{
  "id": "session-uuid",
  "markdown": "## 题目\n\n如图所示... \n\n![图1](data:image/png;base64,...) \n\n\(E = mc^2\) \n\n已知条件...\n\n## 问题\n\n求...",
  "imageUrl": "https://..."
}
```

**Prompt to Qwen2.5-VL:**
> You are a homework question parser. Given an image of a homework problem, extract all text, diagrams, and mathematical formulas. Output in Markdown format following these rules:
> - Text content in plain Markdown
> - Mathematical formulas in LaTeX: inline as `$...$`, block as `$$...$$`
> - Images/diagrams extracted and embedded as `![图N](data:image/...)` using base64
> - Preserve the structure: separate 题目(statement) from 问题(question) if clearly demarcated
> - Output ONLY the parsed Markdown, no additional commentary

### POST /api/solve

**Request:**
```json
{
  "sessionId": "session-uuid",
  "markdown": "## 题目\n\n...",
  "imageUrl": "https://..."
}
```

**Response:**
```json
{
  "answer": "答案是 42",
  "reasoning": "根据欧姆定律...\n\n第一步...\n\n第二步..."
}
```

**Prompt to DeepSeek-R1:**
> You are a patient math and science tutor. A homework problem is provided below, along with any relevant diagrams. Solve it step by step, showing your reasoning clearly.
>
> Format your response as:
> **答案**: [final answer in brief]
> **解题过程**: [step-by-step reasoning, each step clearly numbered]

---

## Frontend Design

### Pages

**Single-page application with three states:**

1. **Upload State** — Camera/gallery upload area
2. **Review State** — Displays parsed question (read-only Markdown + KaTeX + images) + "解析" button
3. **Answer State** — Shows answer + reasoning + "再来一题" button

### QuestionDisplay Component

Renders the Markdown from OCR:

- `react-markdown` for Markdown parsing
- `remark-math` + `rehype-katex` for LaTeX → KaTeX rendering
- Images extracted from Markdown are rendered with zoom/pan capability
- Read-only — no text editing
- If OCR quality is poor, user takes a new photo (no edit flow)

### Styling

- Clean, distraction-free layout (suitable for students)
- KaTeX fonts loaded from CDN
- Responsive: works on phone + desktop
- Light theme only (no dark mode for v1)

---

## Environment Variables

```env
SILICONFLOW_API_KEY=sk-...      # SiliconFlow API key
HW_APP_PORT=3000                # Server port
HW_APP_CORS_ORIGIN=http://localhost:5173  # Dev frontend URL
```

---

## Dependency Strategy

`packages/hw-app/package.json`:
```json
{
  "name": "@pi-mono/hw-app",
  "dependencies": {
    "hono": "^4.x",
    "@pi-mono/ai": "workspace:*",
    "react": "^18.x",
    "react-dom": "^18.x",
    "react-markdown": "^9.x",
    "remark-math": "^6.x",
    "rehype-katex": "^7.x",
    "katex": "^0.16.x"
  }
}
```

**Key point:** `@pi-mono/ai` is imported as a workspace dependency. When pi-mono upstream updates, `hw-app` pulls the new version on next `npm install`.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Image too large (>10MB) | Return 413, frontend shows "图片太大" |
| OCR fails | Return 502, frontend shows "识别失败，请重试" |
| Solve fails | Return 502, frontend shows "解析失败，请重试" |
| SiliconFlow rate limit | Return 429, frontend shows "请求太频繁，稍后再试" |

---

## What's NOT in Scope (v1)

- User authentication
- History/save functionality
- Batch processing
- Multiple images in one question
- Handwritten answer verification
- Export to PDF/Word
