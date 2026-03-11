"use client";

import { useCallback, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Upload, FileText, X, CheckCircle } from "lucide-react";

interface Props {
  onFileSelect: (file: File, base64: string) => void;
  selectedFile: File | null;
  onClear: () => void;
}

export function FileDropzone({ onFileSelect, selectedFile, onClear }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    (file: File) => {
      if (file.type !== "application/pdf") {
        alert("PDF 파일만 업로드 가능합니다.");
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        // "data:application/pdf;base64," 접두사 제거 후 순수 base64만 추출
        const base64 = (e.target?.result as string).split(",")[1];
        onFileSelect(file, base64);
      };
      reader.readAsDataURL(file);
    },
    [onFileSelect]
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
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // ── 파일 선택됨 ──────────────────────────────────────
  if (selectedFile) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex items-center justify-between p-4 rounded-2xl border border-emerald-500/40 bg-emerald-500/10"
      >
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <p className="font-medium text-slate-100 text-sm">{selectedFile.name}</p>
            <p className="text-xs text-slate-400 mt-0.5">{formatSize(selectedFile.size)}</p>
          </div>
        </div>
        <button
          onClick={onClear}
          className="p-2 rounded-lg hover:bg-slate-700/60 text-slate-400 hover:text-slate-200 transition-colors"
          aria-label="파일 제거"
        >
          <X className="w-4 h-4" />
        </button>
      </motion.div>
    );
  }

  // ── 업로드 영역 ───────────────────────────────────────
  return (
    <motion.div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      animate={{
        borderColor: isDragging ? "rgba(99,102,241,0.7)" : "rgba(100,116,139,0.3)",
        backgroundColor: isDragging ? "rgba(99,102,241,0.08)" : "rgba(30,41,59,0.4)",
      }}
      transition={{ duration: 0.15 }}
      className="relative flex flex-col items-center justify-center gap-4 p-12 rounded-2xl border-2 border-dashed cursor-pointer"
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
        onChange={handleChange}
        className="hidden"
      />

      <motion.div
        animate={{ scale: isDragging ? 1.1 : 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="w-16 h-16 rounded-2xl bg-slate-700/60 flex items-center justify-center"
      >
        {isDragging ? (
          <FileText className="w-8 h-8 text-indigo-400" />
        ) : (
          <Upload className="w-8 h-8 text-slate-400" />
        )}
      </motion.div>

      <div className="text-center">
        <p className="text-slate-200 font-medium">
          {isDragging ? "여기에 놓으세요" : "PDF 파일을 드래그하거나 클릭하여 업로드"}
        </p>
        <p className="text-slate-500 text-sm mt-1">최대 50MB · PDF 형식만 지원</p>
      </div>
    </motion.div>
  );
}
