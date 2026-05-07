import { useState } from "react";
import AnswerDisplay from "./components/AnswerDisplay.js";
import ImageUploader from "./components/ImageUploader.js";
import QuestionDisplay from "./components/QuestionDisplay.js";

type AppState = "upload" | "review" | "answer";

export interface ReviewData {
  sessionId: string;
  markdown: string;
  imageDataUrl: string;
}

export interface AnswerData {
  answer: string;
  reasoning: string;
}

interface ApiError {
  error: string;
}

async function apiFetch(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as ApiError;
    throw new Error(data.error ?? `请求失败 (${res.status})`);
  }
  return res.json();
}

export default function App() {
  const [appState, setAppState] = useState<AppState>("upload");
  const [reviewData, setReviewData] = useState<ReviewData | null>(null);
  const [answerData, setAnswerData] = useState<AnswerData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleImageSelected(imageDataUrl: string) {
    setLoading(true);
    setError(null);
    try {
      const data = (await apiFetch("/api/ocr", { image: imageDataUrl })) as {
        id: string;
        markdown: string;
      };
      setReviewData({
        sessionId: data.id,
        markdown: data.markdown,
        imageDataUrl,
      });
      setAppState("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "识别失败，请重试");
    } finally {
      setLoading(false);
    }
  }

  async function handleSolve() {
    if (!reviewData) return;
    setLoading(true);
    setError(null);
    try {
      const data = (await apiFetch("/api/solve", {
        sessionId: reviewData.sessionId,
        markdown: reviewData.markdown,
      })) as { answer: string; reasoning: string };
      setAnswerData({ answer: data.answer, reasoning: data.reasoning });
      setAppState("answer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "解析失败，请重试");
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setAppState("upload");
    setReviewData(null);
    setAnswerData(null);
    setError(null);
  }

  return (
    <div className="min-h-screen flex flex-col items-center py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">作业助手</h1>

      {error && (
        <div className="w-full max-w-2xl mb-4 p-4 bg-red-50 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {appState === "upload" && (
        <ImageUploader
          onImageSelected={handleImageSelected}
          loading={loading}
        />
      )}

      {appState === "review" && reviewData && (
        <div className="w-full max-w-2xl space-y-4">
          <QuestionDisplay
            markdown={reviewData.markdown}
            imageUrl={reviewData.imageDataUrl}
          />
          <div className="flex gap-3">
            <button
              type="reset"
              onClick={handleReset}
              className="flex-1 py-3 px-6 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium transition"
            >
              重新拍照
            </button>
            <button
              type="button"
              onClick={handleSolve}
              disabled={loading}
              className="flex-1 py-3 px-6 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg font-medium transition"
            >
              {loading ? "解析中..." : "解析"}
            </button>
          </div>
        </div>
      )}

      {appState === "answer" && answerData && (
        <div className="w-full max-w-2xl space-y-4">
          <AnswerDisplay
            answer={answerData.answer}
            reasoning={answerData.reasoning}
          />
          <button
            type="button"
            onClick={handleReset}
            className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
          >
            再来一题
          </button>
        </div>
      )}
    </div>
  );
}
