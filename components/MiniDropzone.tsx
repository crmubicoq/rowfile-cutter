"use client";

import { useCallback, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Upload, FilePlus } from "lucide-react";

interface Props {
  onFileSelect: (file: File, base64: string) => void;
  onInvalidFile?: () => void;
  /** 드롭존 주 텍스트 */
  label?: string;
  /** 드롭존 보조 텍스트 */
  sublabel?: string;
}

export function MiniDropzone({
  onFileSelect,
  onInvalidFile,
  label = "새 파일 분석하기",
  sublabel = "드래그하거나 클릭 · PDF 파일",
}: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    (file: File) => {
      if (file.type !== "application/pdf") {
        onInvalidFile?.();
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = (e.target?.result as string).split(",")[1];
        onFileSelect(file, base64);
      };
      reader.readAsDataURL(file);
    },
    [onFileSelect, onInvalidFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    // input 초기화 (같은 파일 재선택 허용)
    e.target.value = "";
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`
        flex items-center gap-3 px-4 py-3 rounded-xl border border-dashed
        cursor-pointer transition-all duration-150
        ${
          isDragging
            ? "border-indigo-500/60 bg-indigo-500/10"
            : "border-slate-600/30 bg-slate-800/20 hover:border-slate-500/50 hover:bg-slate-800/40"
        }
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
        onChange={handleChange}
        className="hidden"
      />

      {/* 아이콘 */}
      <div
        className={`
          w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
          transition-colors duration-150
          ${isDragging ? "bg-indigo-500/20" : "bg-slate-700/60"}
        `}
      >
        {isDragging ? (
          <FilePlus className="w-4 h-4 text-indigo-400" />
        ) : (
          <Upload className="w-4 h-4 text-slate-400" />
        )}
      </div>

      {/* 텍스트 */}
      <div>
        <p
          className={`text-xs font-medium transition-colors duration-150 ${
            isDragging ? "text-indigo-300" : "text-slate-400"
          }`}
        >
          {isDragging ? "여기에 놓으세요" : label}
        </p>
        <p className="text-[10px] text-slate-600 mt-0.5">{sublabel}</p>
      </div>
    </motion.div>
  );
}
