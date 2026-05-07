import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";

const safeUrlTransform = (url: string) =>
  url.startsWith("data:") ? url : defaultUrlTransform(url);

interface Props {
  answer: string;
  reasoning: string;
}

export default function AnswerDisplay({ answer, reasoning }: Props) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-bold text-green-600 mb-3">答案</h2>
        <div className="prose prose-green max-w-none">
          <ReactMarkdown
            urlTransform={safeUrlTransform}
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
              urlTransform={safeUrlTransform}
              remarkPlugins={[remarkMath]}
              rehypePlugins={[rehypeKatex]}
            >
              {reasoning}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
