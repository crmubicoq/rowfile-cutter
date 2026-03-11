"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  History,
  Trash2,
  Trash,
  FileText,
  ChevronRight,
  Clock,
} from "lucide-react";
import type { HistoryEntry } from "@/lib/history";

interface Props {
  isOpen: boolean;
  entries: HistoryEntry[];
  onClose: () => void;
  onLoad: (entry: HistoryEntry) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

/** ISO 날짜 → 한국어 상대 시간 */
function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  if (hours < 24) return `${hours}시간 전`;
  if (days < 7) return `${days}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });
}

/** 바이트 → KB / MB */
function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function HistorySidebar({
  isOpen,
  entries,
  onClose,
  onLoad,
  onDelete,
  onClearAll,
}: Props) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* ── 반투명 배경 ──────────────────────────────── */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* ── 사이드바 드로어 ────────────────────────────── */}
          <motion.aside
            key="sidebar"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 34 }}
            className="fixed top-0 left-0 h-full w-72 z-50 flex flex-col bg-slate-900 border-r border-slate-700/60 shadow-2xl"
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-indigo-400" />
                <span className="text-sm font-semibold text-slate-200">
                  최근 작업 이력
                </span>
                {entries.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 text-[10px] font-bold">
                    {entries.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {entries.length > 0 && (
                  <button
                    onClick={onClearAll}
                    title="전체 삭제"
                    className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-700/60 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 이력 목록 */}
            <div className="flex-1 overflow-y-auto py-2">
              {entries.length === 0 ? (
                /* 빈 상태 */
                <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center">
                    <Clock className="w-6 h-6 text-slate-600" />
                  </div>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    분석을 완료하면
                    <br />
                    이력이 자동으로 저장됩니다.
                  </p>
                </div>
              ) : (
                <ul className="space-y-0.5 px-2">
                  {entries.map((entry, index) => (
                    <motion.li
                      key={entry.id}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.04, duration: 0.2 }}
                    >
                      <div
                        className="group flex items-start gap-3 p-3 rounded-xl hover:bg-slate-800/70 cursor-pointer transition-colors"
                        onClick={() => onLoad(entry)}
                      >
                        {/* 파일 아이콘 */}
                        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center mt-0.5">
                          <FileText className="w-4 h-4 text-indigo-400" />
                        </div>

                        {/* 텍스트 */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-200 truncate leading-snug">
                            {entry.filename}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {entry.sessionCount}개 회차 ·{" "}
                            {formatRelative(entry.analyzedAt)}
                          </p>
                          <p className="text-[10px] text-slate-600 mt-0.5">
                            원본 {formatSize(entry.fileSizeBytes)}
                          </p>
                        </div>

                        {/* 액션 버튼 */}
                        <div className="flex items-center gap-1 flex-shrink-0 pt-0.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(entry.id);
                            }}
                            title="이 이력 삭제"
                            className="p-1 rounded opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-600 opacity-0 group-hover:opacity-60 transition-opacity" />
                        </div>
                      </div>
                    </motion.li>
                  ))}
                </ul>
              )}
            </div>

            {/* 하단 안내 */}
            <div className="px-5 py-3 border-t border-slate-700/60 space-y-0.5">
              <p className="text-[10px] text-slate-600 leading-relaxed">
                PDF 원본은 저장되지 않습니다.
              </p>
              <p className="text-[10px] text-slate-600 leading-relaxed">
                분할하려면 원본 파일을 다시 업로드하세요.
              </p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
