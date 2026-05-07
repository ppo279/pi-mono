import { useRef } from "react";

interface Props {
  onImageSelected: (dataUrl: string) => void;
  loading: boolean;
}

export default function ImageUploader({ onImageSelected, loading }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  function processFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => onImageSelected(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  return (
    <section
      aria-label="图片上传区域"
      className="w-full max-w-2xl border-2 border-dashed border-gray-300 rounded-xl p-12 text-center cursor-pointer hover:border-blue-400 transition"
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) processFile(file);
      }}
      onDragOver={(e) => e.preventDefault()}
    >
      <input
        ref={inputRef}
        id="image-upload"
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) processFile(f);
        }}
      />
      <label htmlFor="image-upload" className="cursor-pointer block">
        <div className="text-5xl mb-4">📷</div>
        <p className="text-lg font-medium text-gray-700">拍照或上传图片</p>
        <p className="text-sm text-gray-500 mt-2">点击上传 · 支持 JPG/PNG</p>
        {loading && (
          <p className="mt-4 text-blue-600 animate-pulse">识别中...</p>
        )}
      </label>
    </section>
  );
}
