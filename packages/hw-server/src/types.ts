// ─── 用户与会话类型 ────────────────────────────────────────────────

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

// ─── SSE 事件类型（与 hw-web 现有解析逻辑完全一致）───────────────

export interface SSEStepEvent {
  state: string;
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
  image: string;
  grade: string;
  subject: string;
}

export interface HealthResponse {
  status: "ok";
  timestamp: number;
}
