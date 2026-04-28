<script setup lang="ts">
import { ref } from "vue";
import type { HomeworkOutput, PipelineState, SolvedQuestion } from "./types";
import ImageUploader from "./components/ImageUploader.vue";
import QuestionCard from "./components/QuestionCard.vue";
import PipelineStatus from "./components/PipelineStatus.vue";
import LoginView from "./LoginView.vue";
import { authFetch } from "./api";

const state = ref<"idle" | "processing" | "done" | "error">("idle");
const isLoggedIn = ref(!!localStorage.getItem("hw_token"));

function onLoginSuccess() {
  isLoggedIn.value = true;
}
const currentStep = ref<PipelineState>("INIT");
const output = ref<HomeworkOutput | null>(null);
const errorMessage = ref("");
const grade = ref("小学三年级");
const subject = ref("数学");

// ─── 实时反馈状态 ─────────────────────────────────────────────
const stepDone = ref<Set<PipelineState>>(new Set());
const thinkingText = ref("");
const liveQuestions = ref<SolvedQuestion[]>([]);
const ocrPreview = ref("");

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const b64 = result.includes("base64,") ? result.split("base64,")[1] : result;
      resolve(b64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * SSE 事件解析
 *
 * SSE 格式：event: <type>\ndata: <json>\n\n
 *
 * 关键：SSE 数据可能跨多行（JSON 本身可换行），
 * 因此用状态机逐字符解析，比按行分割更可靠。
 */
interface SSEMessage {
  type: string;
  data: string;
}

function parseSSEMessages(text: string): SSEMessage[] {
  const messages: SSEMessage[] = [];
  // 匹配 "event: <type>\ndata: <json>\n\n"
  // data 部分贪婪匹配到下一个 "event:" 或字符串末尾
  const regex = /event: ([^\n]+)\ndata: ([\s\S]*?)(?=\n(?:event:)|$)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    messages.push({ type: match[1], data: match[2] });
  }
  return messages;
}

async function handleFile(file: File) {
  output.value = null;
  errorMessage.value = "";
  thinkingText.value = "";
  ocrPreview.value = "";
  liveQuestions.value = [];
  stepDone.value = new Set();
  state.value = "processing";

  try {
    const base64 = await fileToBase64(file);
    const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

    const res = await authFetch(`${API_BASE}/api/assess/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: base64,
        grade: grade.value,
        subject: subject.value,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // 从 buffer 中提取所有完整的 SSE 消息
      const messages = parseSSEMessages(buffer);
      if (messages.length > 0) {
        // 保留未处理的不完整尾部
        const lastMatch = buffer.match(/event: [^\n]+$|/);
        buffer = lastMatch ? lastMatch[0] : "";

        for (const msg of messages) {
          let data: Record<string, unknown>;
          try {
            data = JSON.parse(msg.data) as Record<string, unknown>;
          } catch {
            continue;
          }

          switch (msg.type) {
            case "step": {
              const s = data.state as PipelineState;
              stepDone.value = new Set([...stepDone.value, s]);
              currentStep.value = s;
              break;
            }
            case "ocr": {
              if (typeof data.preview === "string") {
                ocrPreview.value = data.preview.slice(0, 300);
              } else if (Array.isArray(data.blocks)) {
                ocrPreview.value = (data.blocks as string[]).join(" | ");
              }
              break;
            }
            case "thinking": {
              // 实时追加 AI 思考内容
              if (typeof data.text === "string") {
                thinkingText.value += data.text + "\n";
              }
              break;
            }
            case "questions": {
              // questions 事件：
              // - 生产路径（VITA）：含完整 answer + steps → 直接渲染
              // - Mock 路径：含预解析结构（无 answer）→ 等 question 事件流式更新
              const questions = data.questions as SolvedQuestion[];
              if (questions?.[0]?.answer) {
                // 有 answer 字段 → 生产路径，含完整数据，直接渲染
                liveQuestions.value = questions;
              }
              // Mock 路径无 answer 字段，跳过，等 question 事件
              break;
            }
            case "question": {
              // Mock 路径：逐题解答流式到达（不含完整列表）
              // 生产路径无此事件
              const q = data.question as SolvedQuestion;
              const idx = liveQuestions.value.findIndex(x => x.id === q.id);
              if (idx >= 0) {
                liveQuestions.value[idx] = q;
              } else {
                liveQuestions.value.push(q);
              }
              break;
            }
            case "done": {
              const result = data.result as { questions: SolvedQuestion[] };
              output.value = {
                sessionId: crypto.randomUUID(),
                state: "FINISHED",
                meta: { grade: grade.value, subject: subject.value },
                questions: result.questions ?? liveQuestions.value,
                processingTime: (data.result as { processingTime?: number }).processingTime,
              };
              thinkingText.value = "";
              state.value = "done";
              break;
            }
            case "error": {
              state.value = "error";
              errorMessage.value = String(data.error ?? "Unknown error");
              break;
            }
          }
        }
      }
    }
  } catch (err) {
    state.value = "error";
    errorMessage.value = String(err);
  }
}
</script>

<template>
  <LoginView v-if="!isLoggedIn" @success="onLoginSuccess" />
  <div v-else class="app">
    <header class="header">
      <span class="subtitle">实时反馈 · VITA 视觉理解 + DeepSeek 推理</span>
    </header>

    <main class="main">
      <div class="meta-bar">
        <input v-model="grade" class="meta-input" placeholder="年级" />
        <input v-model="subject" class="meta-input" placeholder="学科" />
      </div>

      <ImageUploader
        :disabled="state === 'processing'"
        @upload="handleFile"
      />

      <!-- 实时思考内容 -->
      <div v-if="thinkingText && state === 'processing'" class="thinking-box">
        <div class="thinking-header">
          <span class="thinking-dot"></span>
          AI 推理中
        </div>
        <pre class="thinking-content">{{ thinkingText }}</pre>
      </div>

      <!-- OCR 预览 -->
      <div v-if="ocrPreview && state === 'processing'" class="ocr-preview">
        <div class="ocr-label">识别结果</div>
        <pre class="ocr-text">{{ ocrPreview }}</pre>
      </div>

      <!-- 管道状态 -->
      <PipelineStatus
        :state="state"
        :currentStep="currentStep"
        :stepDone="stepDone"
        :error="errorMessage"
      />

      <!-- 流式题目（边解边展示） -->
      <div v-if="liveQuestions.length > 0" class="results">
        <div class="results-header">
          <span>{{ grade }} | {{ subject }}</span>
          <span>已解答 {{ liveQuestions.length }} 题</span>
        </div>
        <QuestionCard
          v-for="q in liveQuestions"
          :key="q.id"
          :question="q"
        />
      </div>

      <!-- 最终结果（done 事件后显示完整版） -->
      <div v-if="output && state === 'done'" class="results final-results">
        <div class="results-header">
          <span>批改完成</span>
          <span v-if="output.processingTime">耗时：{{ output.processingTime }}ms</span>
        </div>
        <QuestionCard
          v-for="q in output.questions"
          :key="q.id"
          :question="q"
        />
      </div>
    </main>
  </div>
</template>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: #f5f5f5;
  color: #333;
}
.app { max-width: 800px; margin: 0 auto; padding: 20px; }
.header { text-align: center; margin-bottom: 24px; }
.header h1 { font-size: 24px; color: #1a1a1a; }
.subtitle { font-size: 13px; color: #999; }
.main { display: flex; flex-direction: column; gap: 20px; }

.meta-bar { display: flex; gap: 12px; justify-content: center; }
.meta-input {
  padding: 8px 14px; border: 1px solid #ddd; border-radius: 8px;
  font-size: 14px; width: 140px; text-align: center;
}

.thinking-box {
  background: #1a1a2e; border-radius: 10px; padding: 14px 18px;
  color: #a8d8ea; font-size: 13px;
}
.thinking-header {
  display: flex; align-items: center; gap: 8px;
  font-size: 12px; color: #6abf69; margin-bottom: 8px; font-weight: 600;
}
.thinking-dot {
  width: 8px; height: 8px; background: #6abf69; border-radius: 50%;
  animation: pulse 1s ease-in-out infinite;
}
.thinking-content {
  font-family: "Fira Code", "Cascadia Code", monospace;
  white-space: pre-wrap; word-break: break-word; line-height: 1.6;
}

.ocr-preview {
  background: #fff; border-left: 3px solid #4a90d9;
  border-radius: 6px; padding: 10px 14px; font-size: 12px;
}
.ocr-label {
  font-size: 11px; color: #888; margin-bottom: 4px;
  text-transform: uppercase; letter-spacing: 0.05em;
}
.ocr-text {
  color: #555; white-space: pre-wrap; font-family: inherit;
  line-height: 1.5; max-height: 80px; overflow: hidden;
}

.results { display: flex; flex-direction: column; gap: 16px; }
.results-header {
  display: flex; justify-content: space-between;
  font-size: 13px; color: #888; padding: 0 4px;
}
.final-results { margin-top: 4px; }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
</style>
