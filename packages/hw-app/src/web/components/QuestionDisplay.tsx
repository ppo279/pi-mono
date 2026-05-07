import { useState } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import type { ReviewBlock, LayoutHint } from "../../server/llm/types.js";

const safeUrlTransform = (url: string) =>
  url.startsWith("data:") ? url : defaultUrlTransform(url);

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      urlTransform={safeUrlTransform}
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
      {content}
    </ReactMarkdown>
  );
}

// ---------- types ----------

interface GroupedContent {
  groupId: string;
  layoutHint: LayoutHint;
  items: ReviewBlock[];
}

// ---------- grouping ----------

/**
 * Group blocks by groupId.
 * - Blocks with the same groupId go into one group (preserving order of first appearance).
 * - Blocks without groupId each get their own group using __ungrouped_${index}
 *   so they are never merged with unrelated content.
 * - The order array preserves first-seen order of groups.
 */
function groupBlocks(blocks: ReviewBlock[]): GroupedContent[] {
  const groupMap = new Map<string, GroupedContent>();
  const order: string[] = [];
  let ungroupedIndex = 0;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const gid = block.groupId ?? `__ungrouped_${ungroupedIndex++}`;

    if (!groupMap.has(gid)) {
      const layoutHint: LayoutHint =
        block.type === "image" ? block.layoutHint : "inline-left";
      groupMap.set(gid, { groupId: gid, layoutHint, items: [] });
      order.push(gid);
    }

    groupMap.get(gid)!.items.push(block);
  }

  // Return groups in first-seen order
  return order.map((gid) => groupMap.get(gid)!);
}

// ---------- per-group rendering ----------

/**
 * Renders a single group.
 * - inline-left: all images stacked on the left, all text blocks on the right.
 *   (multiple images in one group are all rendered)
 * - block/full-width: all items rendered in original order.
 */
function renderGroup(group: GroupedContent): React.ReactNode {
  const { layoutHint, items, groupId } = group;

  // inline-left: images on left, text blocks on right
  if (layoutHint === "inline-left") {
    const imageBlocks = items.filter((b) => b.type === "image");
    const textBlocks = items.filter((b) => b.type === "text");

    return (
      <div key={groupId} className="flex gap-3 items-start mb-3">
        {imageBlocks.length > 0 && (
          <div className="flex-shrink-0 flex flex-col gap-1">
            {imageBlocks.map((img, i) => (
              <img
                key={i}
                src={img.imageDataUrl}
                alt={img.description}
                className="w-20 h-20 object-cover rounded-lg"
              />
            ))}
          </div>
        )}
        <div className="flex-1 py-1">
          {textBlocks.map((b, i) => (
            <div key={i} className="prose prose-blue max-w-none">
              <MarkdownContent content={b.text} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // block / full-width: all items in original order
  return (
    <div
      key={groupId}
      className={layoutHint === "full-width" ? "w-full mb-4" : "mb-3"}
    >
      {items.map((item, i) => {
        if (item.type === "text") {
          return (
            <div key={i} className="prose prose-blue max-w-none">
              <MarkdownContent content={item.text} />
            </div>
          );
        } else {
          return (
            <img
              key={i}
              src={item.imageDataUrl}
              alt={item.description}
              className={
                layoutHint === "full-width"
                  ? "w-full rounded-lg"
                  : "max-w-full rounded-lg"
              }
            />
          );
        }
      })}
    </div>
  );
}

// ---------- main component ----------

interface Props {
  blocks: ReviewBlock[];
  originalImageUrl: string;
}

export default function QuestionDisplay({ blocks, originalImageUrl }: Props) {
  const [showOriginal, setShowOriginal] = useState(false);
  const groups = groupBlocks(blocks);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm p-6">
        <button
          onClick={() => setShowOriginal(!showOriginal)}
          className="text-blue-600 text-sm mb-2"
        >
          {showOriginal ? "Hide original" : "Show original"}
        </button>
        {showOriginal && (
          <img
            src={originalImageUrl}
            alt="Original image"
            className="max-w-full rounded-lg mb-4"
          />
        )}
        <div>
          {groups.map(renderGroup)}
        </div>
      </div>
      <p className="text-xs text-gray-400 text-center">
        OCR result for confirmation only. Retake photo if unclear.
      </p>
    </div>
  );
}
