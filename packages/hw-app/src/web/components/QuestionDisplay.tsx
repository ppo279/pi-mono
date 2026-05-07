import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";

interface Props {
  markdown: string;
  imageUrl: string;
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
                  alt={alt ?? ""}
                  className="max-w-full rounded-lg"
                  style={{ maxHeight: "300px", objectFit: "contain" }}
                />
              ),
            }}
          >
            {markdown}
          </ReactMarkdown>
        </div>
      </div>
      <p className="text-xs text-gray-400 text-center">
        识别结果仅供确认，如有问题请重新拍照
      </p>
    </div>
  );
}
