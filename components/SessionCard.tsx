"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, BookOpen, ArrowRight, Download, Loader2 } from "lucide-react";
import { Session } from "@/lib/gemini/types";

interface Props {
  session: Session;
  onUpdate: (updated: Session) => void;
  /** 이 회차만 개별 PDF로 다운로드하는 핸들러 */
  onDownload?: () => Promise<void>;
  /** 다운로드 진행 중 여부 */
  isDownloading?: boolean;
  /** 실제 PDF가 로드되어 있는지 여부 (false면 버튼 비활성) */
  hasActivePdf?: boolean;
}

export function SessionCard({
  session,
  onUpdate,
  onDownload,
  isDownloading = false,
  hasActivePdf = false,
}: Props) {
  const [showReasoning, setShowReasoning] = useState(false);

  const handlePageChange = (
    field: "startPage" | "endPage",
    raw: string
  ) => {
    const value = parseInt(raw, 10);
    if (!isNaN(value) && value > 0) {
      onUpdate({ ...session, [field]: value });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
      className="rounded-2xl border border-slate-700/50 bg-slate-800/40 backdrop-blur-sm overflow-hidden"
    >
      {/* ── 메인 영역 ─────────────────────────────────── */}
      <div className="p-5 flex gap-4">
        {/* 회차 번호 배지 */}
        <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500/30 to-violet-500/30 border border-indigo-500/30 flex items-center justify-center">
          <span className="text-indigo-300 font-bold text-lg leading-none">
            {String(session.sessionNumber).padStart(2, "0")}
          </span>
        </div>

        {/* 제목 + 요약 */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-100 text-base leading-snug truncate">
            {session.title}
          </h3>
          <p className="text-slate-400 text-sm mt-1 leading-relaxed line-clamp-2">
            {session.summary}
          </p>
        </div>
      </div>

      {/* ── 페이지 매핑 뷰어 ──────────────────────────── */}
      {/* flex-wrap: 좁은 화면에서 AI 근거 버튼이 다음 줄로 내려감 */}
      <div className="px-5 pb-4 flex items-center flex-wrap gap-x-2 gap-y-2">
        <BookOpen className="w-4 h-4 text-slate-500 flex-shrink-0" />
        <span className="text-xs text-slate-500">페이지</span>

        {/* 시작 페이지 */}
        <input
          type="number"
          min={1}
          value={session.startPage}
          onChange={(e) => handlePageChange("startPage", e.target.value)}
          className="w-14 px-2 py-1.5 rounded-lg bg-slate-900/70 border border-slate-600/50 text-slate-200 text-sm text-center focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 transition-colors"
          aria-label="시작 페이지"
        />

        <ArrowRight className="w-3.5 h-3.5 text-slate-600" />

        {/* 종료 페이지 */}
        <input
          type="number"
          min={1}
          value={session.endPage}
          onChange={(e) => handlePageChange("endPage", e.target.value)}
          className="w-14 px-2 py-1.5 rounded-lg bg-slate-900/70 border border-slate-600/50 text-slate-200 text-sm text-center focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 transition-colors"
          aria-label="종료 페이지"
        />

        <span className="text-xs text-slate-600">
          ({session.endPage - session.startPage + 1}p)
        </span>

        {/* flex-1 스페이서 + 버튼 그룹 우측 정렬 */}
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          {/* 개별 PDF 다운로드 버튼 */}
          {onDownload && (
            <button
              onClick={onDownload}
              disabled={!hasActivePdf || isDownloading}
              title={
                !hasActivePdf
                  ? "PDF를 먼저 업로드하세요"
                  : `${String(session.sessionNumber).padStart(2, "0")}회차 PDF 다운로드`
              }
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-violet-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isDownloading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
            </button>
          )}

          {/* AI 근거 토글 */}
          <button
            onClick={() => setShowReasoning((prev) => !prev)}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-400 transition-colors whitespace-nowrap"
          >
            AI 근거
            <motion.span
              animate={{ rotate: showReasoning ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </motion.span>
          </button>
        </div>
      </div>

      {/* ── AI 추천 근거 (접힘/펼침) ─────────────────── */}
      <AnimatePresence initial={false}>
        {showReasoning && (
          <motion.div
            key="reasoning"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-1">
              <div className="p-3 rounded-xl bg-indigo-500/8 border border-indigo-500/20">
                <p className="text-xs text-indigo-300/80 leading-relaxed">
                  {session.reasoning}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
