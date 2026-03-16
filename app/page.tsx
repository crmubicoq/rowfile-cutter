"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Loader2,
  AlertCircle,
  Download,
  Scissors,
  CheckCircle2,
  FileArchive,
  Clock,
  RotateCcw,
  Archive,
  X,
} from "lucide-react";
import { FileDropzone } from "@/components/FileDropzone";
import { ConstraintsForm } from "@/components/ConstraintsForm";
import { SessionCard } from "@/components/SessionCard";
import { StepIndicator } from "@/components/StepIndicator";
import { ToastContainer } from "@/components/Toast";
import { HistorySidebar } from "@/components/HistorySidebar";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { MiniDropzone } from "@/components/MiniDropzone";
import type { StepId } from "@/components/StepIndicator";
import type { Toast, ToastType } from "@/components/Toast";
import type { Session, AnalyzeRequestBody } from "@/lib/gemini/types";
import {
  loadHistory,
  appendHistory,
  deleteHistoryEntry,
  clearHistory,
} from "@/lib/history";
import type { HistoryEntry } from "@/lib/history";

// 파일 크기 경고 임계치 (15MB — Gemini 20MB 제한 사전 경고)
const FILE_WARN_BYTES = 15 * 1024 * 1024;

// 멀티 스테이지 전환 임계치: 이 페이지 수를 초과하면 멀티 스테이지 분석 사용
const MULTI_STAGE_THRESHOLD = 80;

/** 멀티 스테이지 진행 단계 */
type AnalyzeStage =
  | "idle"       // 분석 안 함
  | "counting"   // 페이지 수 확인 중
  | "single"     // 단일 분석 중 (80p 이하)
  | "milestone"  // 1단계: 구조 파악 중
  | "range"      // 2단계: 범위별 분할 중
  | "merging";   // 3단계: 결과 통합 중

/**
 * 이정표 배열 + totalPages → 청크 배열로 변환.
 * milestones = [1, 85, 160], totalPages = 240
 * → [{start:1, end:84}, {start:85, end:159}, {start:160, end:240}]
 */
function buildChunks(
  milestones: number[],
  totalPages: number
): Array<{ start: number; end: number }> {
  return milestones.map((start, i) => ({
    start,
    end: i + 1 < milestones.length ? milestones[i + 1] - 1 : totalPages,
  }));
}

interface Constraints {
  sessionCount?: number;
  maxPagesPerSession?: number;
  additionalInstructions?: string;
}

type SplitStatus = "idle" | "splitting" | "done" | "error";

export default function Home() {
  // ── 분석 상태 ──────────────────────────────────────────
  const [file, setFile] = useState<File | null>(null);
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [constraints, setConstraints] = useState<Constraints>({});
  const [analysisMode, setAnalysisMode] = useState<"ai" | "user">("ai");
  const [userInstruction, setUserInstruction] = useState("");
  /** 앞 페이지 오프셋: 표지·목차 등 번호 없는 페이지 수. Gemini 반환값에 더해짐. */
  const [pageOffset, setPageOffset] = useState(0);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  /** 멀티 스테이지 진행 단계 */
  const [analyzeStage, setAnalyzeStage] = useState<AnalyzeStage>("idle");
  /** 2단계 청크 진행 카운터 */
  const [stageProgress, setStageProgress] = useState({ current: 0, total: 0 });

  // ── 분할 상태 ──────────────────────────────────────────
  const [splitStatus, setSplitStatus] = useState<SplitStatus>("idle");
  const [splitError, setSplitError] = useState<string | null>(null);
  const [splitFilename, setSplitFilename] = useState<string | null>(null);
  /** 개별 다운로드 중인 세션 번호 (null = 없음) */
  const [downloadingSessionId, setDownloadingSessionId] = useState<number | null>(null);

  // ── 토스트 ──────────────────────────────────────────────
  const [toasts, setToasts] = useState<Toast[]>([]);

  // ── 이력 관리 ───────────────────────────────────────────
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historySidebarOpen, setHistorySidebarOpen] = useState(false);
  /** 이력에서 불러온 경우 true — pdfBase64가 없어 분할 불가 */
  const [loadedFromHistory, setLoadedFromHistory] = useState(false);
  const [historyMeta, setHistoryMeta] = useState<{
    filename: string;
    analyzedAt: string;
  } | null>(null);

  // ── 확인 다이얼로그 ─────────────────────────────────────
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // ── localStorage 이력 초기 로드 ──────────────────────────
  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  // ── 파생 상태 ───────────────────────────────────────────
  const hasActivePdf = !!pdfBase64;
  const hasResults = sessions.length > 0;
  const hasWork = hasResults || !!file || loadedFromHistory;

  // ── 스텝 인디케이터 계산 ───────────────────────────────
  const completedSteps: StepId[] = [
    ...((file || loadedFromHistory) ? ([1] as StepId[]) : []),
    ...(hasResults ? ([2] as StepId[]) : []),
    ...(splitStatus === "splitting" || splitStatus === "done"
      ? ([3] as StepId[])
      : []),
    ...(splitStatus === "done" ? ([4] as StepId[]) : []),
  ];
  const currentStep: StepId =
    !file && !loadedFromHistory
      ? 1
      : !hasResults
      ? 2
      : splitStatus === "splitting" || splitStatus === "done"
      ? 4
      : 3;

  // ── 토스트 헬퍼 ────────────────────────────────────────
  const addToast = useCallback((type: ToastType, message: string) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, type, message }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ── 전체 초기화 (내부) ──────────────────────────────────
  const doReset = () => {
    setFile(null);
    setPdfBase64(null);
    setSessions([]);
    setAnalyzeError(null);
    setSplitStatus("idle");
    setSplitError(null);
    setSplitFilename(null);
    setLoadedFromHistory(false);
    setHistoryMeta(null);
    setConstraints({});
    setConfirmDialog(null);
    setAnalyzeStage("idle");
    setStageProgress({ current: 0, total: 0 });
  };

  // ── 전체 초기화 버튼 (헤더) ────────────────────────────
  const handleReset = () => {
    if (hasWork) {
      setConfirmDialog({
        title: "워크스페이스 초기화",
        message:
          "현재 작업 중인 모든 데이터가 초기화됩니다. 분석 이력은 사이드바에 유지됩니다.",
        onConfirm: doReset,
      });
    } else {
      doReset();
    }
  };

  // ── 파일 실제 적용 (확인 이후 호출) ────────────────────
  const doFileSelect = (f: File, b64: string) => {
    setFile(f);
    setPdfBase64(b64);
    setSessions([]);
    setAnalyzeError(null);
    setSplitStatus("idle");
    setSplitError(null);
    setSplitFilename(null);
    setLoadedFromHistory(false);
    setHistoryMeta(null);
    setConfirmDialog(null);
    setPageOffset(0); // 새 파일마다 오프셋 초기화

    if (f.size > FILE_WARN_BYTES) {
      addToast(
        "warning",
        `파일이 ${(f.size / 1024 / 1024).toFixed(1)}MB로 큰 편입니다. Gemini 20MB 제한에 근접하여 분석이 느려질 수 있습니다.`
      );
    }
  };

  /**
   * 파일 선택 핸들러 — 3가지 경로를 하나로 통합
   *
   * Case A) loadedFromHistory: PDF만 교체 (세션 유지, 분할 활성화 목적)
   * Case B) hasResults: 확인 다이얼로그 → 세션 초기화 후 교체
   * Case C) 그 외: 즉시 적용
   */
  const handleFileSelect = (f: File, b64: string) => {
    if (loadedFromHistory) {
      // 이력 세션을 유지한 채 PDF만 설정 → 분할 버튼 활성화
      setFile(f);
      setPdfBase64(b64);
      setLoadedFromHistory(false);
      setSplitStatus("idle");
      setSplitError(null);
      setSplitFilename(null);
      setConfirmDialog(null);
      addToast("info", "PDF가 업로드되었습니다. 이제 분할할 수 있습니다.");
      return;
    }

    if (hasResults) {
      setConfirmDialog({
        title: "새 파일로 교체",
        message:
          "현재 작업 중인 분석 데이터가 초기화됩니다. 새 파일로 분석을 시작할까요?",
        onConfirm: () => doFileSelect(f, b64),
      });
      return;
    }

    doFileSelect(f, b64);
  };

  // ── 파일 / 이력 제거 ───────────────────────────────────
  const handleClear = () => {
    if (hasWork) {
      setConfirmDialog({
        title: "파일 제거",
        message: "현재 분석 결과가 모두 초기화됩니다. 계속할까요?",
        onConfirm: doReset,
      });
    } else {
      doReset();
    }
  };

  // ── 분석 성공 공통 처리 ────────────────────────────────
  const applyAnalyzeResult = (
    resultSessions: Session[],
    warnings?: { message: string }[],
    geminiSizeWarning?: string
  ) => {
    // 페이지 오프셋 적용 (앞 표지·목차 등 번호 없는 페이지 수만큼 보정)
    const shifted: Session[] =
      pageOffset > 0
        ? resultSessions.map((s) => ({
            ...s,
            startPage: s.startPage + pageOffset,
            endPage: s.endPage + pageOffset,
          }))
        : resultSessions;
    setSessions(shifted);

    const first = shifted[0];
    const last = shifted[shifted.length - 1];
    addToast(
      "success",
      `${shifted.length}개 회차 분석 완료 (총 ${
        last.endPage - first.startPage + 1
      }p)${pageOffset > 0 ? ` · 오프셋 +${pageOffset}p 적용` : ""}`
    );

    // localStorage에 이력 저장 (PDF Base64 제외)
    if (file) {
      const entry = appendHistory({
        filename: file.name,
        fileSizeBytes: file.size,
        sessionCount: shifted.length,
        analyzedAt: new Date().toISOString(),
        sessions: shifted,
      });
      setHistory((prev) => [entry, ...prev].slice(0, 10));
    }

    if (warnings && warnings.length > 0 && pageOffset === 0) {
      addToast(
        "warning",
        `검증 경고 ${warnings.length}건 — 페이지 범위를 확인해 주세요.`
      );
    }
    if (geminiSizeWarning) {
      addToast("warning", geminiSizeWarning);
    }
  };

  // ── AI 분석 (멀티 스테이지 오케스트레이션) ─────────────
  const handleAnalyze = async () => {
    if (!pdfBase64) return;
    setIsAnalyzing(true);
    setAnalyzeError(null);
    setSplitStatus("idle");
    setAnalyzeStage("counting");
    setStageProgress({ current: 0, total: 0 });

    try {
      // ── 0단계: 페이지 수 확인 (pdf-lib, 빠름) ─────────────
      const countRes = await fetch("/api/pagecount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfBase64 }),
      });
      const countData = await countRes.json();
      if (!countRes.ok) {
        setAnalyzeError(countData.error ?? "PDF 페이지 수 확인에 실패했습니다.");
        return;
      }
      const docTotalPages: number = countData.totalPages;

      // ── 분기: 단일 vs 멀티 스테이지 ──────────────────────
      // 직접 지정 모드는 전체 PDF를 한 번에 봐야 챕터를 찾을 수 있으므로 항상 단일 분석
      if (docTotalPages <= MULTI_STAGE_THRESHOLD || analysisMode === "user") {
        // ── 단일 분석 (80p 이하) ─────────────────────────
        setAnalyzeStage("single");
        const body: AnalyzeRequestBody = {
          pdfBase64,
          mimeType: "application/pdf",
          mode: "single",
          constraints,
          ...(analysisMode === "user" && userInstruction ? { userInstruction } : {}),
        };
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) {
          setAnalyzeError(data.error ?? "분석 중 오류가 발생했습니다.");
          return;
        }
        applyAnalyzeResult(
          data.sessions,
          data._warnings,
          data._meta?.geminiSizeWarning
        );
      } else {
        // ── 멀티 스테이지 (80p 초과) ───────────────────────

        // 1단계: 이정표 감지
        setAnalyzeStage("milestone");
        const msRes = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pdfBase64,
            mimeType: "application/pdf",
            mode: "milestone",
            totalPages: docTotalPages,
            constraints,
          } as AnalyzeRequestBody),
        });
        const msData = await msRes.json();
        if (!msRes.ok) {
          setAnalyzeError(
            msData.error ?? "1단계(구조 파악) 중 오류가 발생했습니다."
          );
          return;
        }
        const milestones: number[] = msData.milestones;

        // 2단계: 청크별 범위 분할
        setAnalyzeStage("range");
        const chunks = buildChunks(milestones, docTotalPages);
        setStageProgress({ current: 0, total: chunks.length });

        const allSessions: Session[] = [];
        // Fluid Boundary: 청크 목록을 mutable 복사본으로 관리
        const mutableChunks = chunks.map((c) => ({ ...c }));

        for (let i = 0; i < mutableChunks.length; i++) {
          const chunk = mutableChunks[i];
          setStageProgress({ current: i + 1, total: mutableChunks.length });

          // constraints.sessionCount가 있으면 비례 배분
          const targetCount = constraints.sessionCount
            ? Math.max(
                1,
                Math.round(
                  constraints.sessionCount *
                    ((chunk.end - chunk.start + 1) / docTotalPages)
                )
              )
            : undefined;

          const rangeRes = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pdfBase64,
              mimeType: "application/pdf",
              mode: "range",
              rangeStart: chunk.start,
              rangeEnd: chunk.end,
              targetSessionCount: targetCount,
              constraints,
            } as AnalyzeRequestBody),
          });
          const rangeData = await rangeRes.json();
          if (!rangeRes.ok) {
            setAnalyzeError(
              rangeData.error ??
                `2단계(범위 분할) 오류 — 청크 ${i + 1}/${mutableChunks.length} (p.${chunk.start}~${chunk.end})`
            );
            return;
          }

          const chunkSessions = rangeData.sessions as Session[];
          allSessions.push(...chunkSessions);

          // ── Fluid Boundary: 실제 마지막 endPage로 다음 청크 시작점 보정 ─
          if (i + 1 < mutableChunks.length && chunkSessions.length > 0) {
            const actualEnd = chunkSessions[chunkSessions.length - 1].endPage;
            const expectedNextStart = mutableChunks[i + 1].start;
            if (actualEnd + 1 !== expectedNextStart) {
              console.info(
                `[fluid-boundary] 청크 ${i + 1} 실제 끝: p.${actualEnd} ` +
                `(예상: p.${chunk.end}) → 다음 청크 시작: p.${actualEnd + 1} (기존: p.${expectedNextStart})`
              );
              mutableChunks[i + 1] = {
                ...mutableChunks[i + 1],
                start: actualEnd + 1,
              };
            }
          }
        }

        // 3단계: 병합 + 세션 번호 재부여
        setAnalyzeStage("merging");
        const mergedSessions = allSessions.map((s, idx) => ({
          ...s,
          sessionNumber: idx + 1,
        }));
        applyAnalyzeResult(mergedSessions);
      }
    } catch {
      setAnalyzeError("네트워크 오류가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      setIsAnalyzing(false);
      setAnalyzeStage("idle");
      setStageProgress({ current: 0, total: 0 });
    }
  };

  const handleSessionUpdate = (index: number, updated: Session) => {
    setSessions((prev) => prev.map((s, i) => (i === index ? updated : s)));
    if (splitStatus === "done") {
      setSplitStatus("idle");
      setSplitFilename(null);
    }
  };

  // ── PDF 분할 & ZIP 다운로드 ────────────────────────────
  const handleSplit = async () => {
    if (!pdfBase64 || sessions.length === 0) return;
    setSplitStatus("splitting");
    setSplitError(null);
    setSplitFilename(null);

    try {
      const res = await fetch("/api/split", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pdfBase64,
          sessions,
          originalFilename: file?.name ?? "edusplit",
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const errMsg = data.error ?? "PDF 분할 중 오류가 발생했습니다.";
        setSplitError(errMsg);
        setSplitStatus("error");
        addToast("error", errMsg);
        return;
      }

      const blob = await res.blob();
      const contentDisposition = res.headers.get("Content-Disposition") ?? "";
      const match = contentDisposition.match(/filename\*=UTF-8''(.+)/);
      const filename = match
        ? decodeURIComponent(match[1])
        : `edusplit_${Date.now()}.zip`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setSplitFilename(filename);
      setSplitStatus("done");
      addToast(
        "success",
        `${sessions.length}개 PDF가 ZIP으로 저장 완료. 다운로드를 확인하세요.`
      );
    } catch {
      const errMsg = "네트워크 오류가 발생했습니다. 다시 시도해 주세요.";
      setSplitError(errMsg);
      setSplitStatus("error");
      addToast("error", errMsg);
    }
  };

  // ── 개별 세션 PDF 다운로드 ──────────────────────────────
  const handleDownloadSession = async (session: Session) => {
    if (!pdfBase64) return;
    setDownloadingSessionId(session.sessionNumber);

    try {
      const res = await fetch("/api/split", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pdfBase64,
          sessions: [session],
          originalFilename: file?.name ?? "edusplit",
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        addToast("error", data.error ?? "개별 PDF 다운로드 중 오류가 발생했습니다.");
        return;
      }

      const blob = await res.blob();
      const contentDisposition = res.headers.get("Content-Disposition") ?? "";
      const match = contentDisposition.match(/filename\*=UTF-8''(.+)/);
      const filename = match
        ? decodeURIComponent(match[1])
        : `${String(session.sessionNumber).padStart(2, "0")}_${session.title.slice(0, 30)}.pdf`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addToast(
        "success",
        `${String(session.sessionNumber).padStart(2, "0")}회차 PDF 다운로드 완료`
      );
    } catch {
      addToast("error", "네트워크 오류로 개별 다운로드에 실패했습니다.");
    } finally {
      setDownloadingSessionId(null);
    }
  };

  // ── 이력 불러오기 ──────────────────────────────────────
  const handleLoadHistory = (entry: HistoryEntry) => {
    const doLoad = () => {
      setFile(null);
      setPdfBase64(null);
      setSessions(entry.sessions);
      setAnalyzeError(null);
      setSplitStatus("idle");
      setSplitError(null);
      setSplitFilename(null);
      setLoadedFromHistory(true);
      setHistoryMeta({
        filename: entry.filename,
        analyzedAt: entry.analyzedAt,
      });
      setHistorySidebarOpen(false);
      setConstraints({});
      setConfirmDialog(null);
    };

    if (hasWork) {
      setConfirmDialog({
        title: "이력 불러오기",
        message:
          "현재 작업 중인 데이터가 초기화됩니다. 이 이력을 불러올까요?",
        onConfirm: doLoad,
      });
    } else {
      doLoad();
    }
  };

  // ── 이력 삭제 ──────────────────────────────────────────
  const handleDeleteHistory = (id: string) => {
    setHistory(deleteHistoryEntry(id));
  };

  const handleClearAllHistory = () => {
    clearHistory();
    setHistory([]);
    addToast("info", "모든 이력이 삭제되었습니다.");
  };

  const totalPages = hasResults
    ? sessions[sessions.length - 1].endPage - sessions[0].startPage + 1
    : 0;

  // ──────────────────────────────────────────────────────
  return (
    <>
      {/* ── 토스트 (우상단 고정) ─────────────────────────── */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* ── 이력 사이드바 ────────────────────────────────── */}
      <HistorySidebar
        isOpen={historySidebarOpen}
        entries={history}
        onClose={() => setHistorySidebarOpen(false)}
        onLoad={handleLoadHistory}
        onDelete={handleDeleteHistory}
        onClearAll={handleClearAllHistory}
      />

      {/* ── 확인 다이얼로그 ──────────────────────────────── */}
      <ConfirmDialog
        isOpen={!!confirmDialog}
        title={confirmDialog?.title ?? ""}
        message={confirmDialog?.message ?? ""}
        onConfirm={confirmDialog?.onConfirm ?? (() => {})}
        onCancel={() => setConfirmDialog(null)}
      />

      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        {/* 배경 글로우 */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-2xl mx-auto px-4 py-12 sm:py-14">

          {/* ── 헤더: 이력 ←→ 초기화 버튼 + 타이틀 ─────── */}
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-8"
          >
            <div className="flex items-center justify-between mb-4">
              {/* 이력 사이드바 토글 */}
              <button
                onClick={() => setHistorySidebarOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/40 text-slate-400 hover:text-slate-200 hover:border-slate-600 text-xs font-medium transition-colors"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>이력</span>
                {history.length > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 text-[10px] font-bold leading-none">
                    {history.length}
                  </span>
                )}
              </button>

              {/* 워크스페이스 초기화 */}
              <button
                onClick={handleReset}
                disabled={!hasWork}
                title="워크스페이스 초기화"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/40 text-slate-400 hover:text-rose-400 hover:border-rose-500/30 text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>초기화</span>
              </button>
            </div>

            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              Powered by Gemini 2.0 Flash
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-indigo-300 via-violet-300 to-pink-300 bg-clip-text text-transparent mb-2">
              EduSplit AI
            </h1>
            <p className="text-slate-400 text-sm">
              교육 원고를 주제 완결성 기반으로 자동 회차 분할
            </p>
          </motion.div>

          {/* ── 스텝 인디케이터 ───────────────────────────── */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            <StepIndicator
              currentStep={currentStep}
              completedSteps={completedSteps}
            />
          </motion.div>

          {/* ── Step 1: 파일 영역 ─────────────────────────── */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mb-4"
          >
            {loadedFromHistory && historyMeta ? (
              /* 이력에서 불러온 상태 카드 */
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center justify-between p-4 rounded-2xl border border-indigo-500/30 bg-indigo-500/10"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
                    <Archive className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-slate-100 text-sm truncate">
                        {historyMeta.filename}
                      </p>
                      <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/20">
                        이력
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {new Date(historyMeta.analyzedAt).toLocaleString(
                        "ko-KR",
                        {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        }
                      )}
                      에 분석됨
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleClear}
                  className="p-2 rounded-lg hover:bg-slate-700/60 text-slate-400 hover:text-slate-200 transition-colors flex-shrink-0"
                  aria-label="초기화"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            ) : (
              /* 일반 파일 드롭존 */
              <FileDropzone
                onFileSelect={handleFileSelect}
                selectedFile={file}
                onClear={handleClear}
              />
            )}
          </motion.section>

          {/* ── Step 2: 분석 모드 + 제약 조건 (실제 PDF가 있을 때만) ── */}
          <AnimatePresence>
            {file && (
              <motion.section
                key="constraints"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="mb-6 space-y-4"
              >
                {/* 분석 모드 토글 */}
                <div className="p-4 rounded-2xl border border-slate-700/50 bg-slate-800/40 backdrop-blur-sm">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                    분석 모드
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setAnalysisMode("ai")}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium transition-all border ${
                        analysisMode === "ai"
                          ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-300"
                          : "bg-slate-900/40 border-slate-700/50 text-slate-400 hover:text-slate-300 hover:border-slate-600"
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      AI 자동 분석
                    </button>
                    <button
                      onClick={() => setAnalysisMode("user")}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium transition-all border ${
                        analysisMode === "user"
                          ? "bg-violet-500/20 border-violet-500/50 text-violet-300"
                          : "bg-slate-900/40 border-slate-700/50 text-slate-400 hover:text-slate-300 hover:border-slate-600"
                      }`}
                    >
                      <Scissors className="w-3.5 h-3.5" />
                      직접 지정
                    </button>
                  </div>

                  {/* 직접 지정 모드: 지시사항 입력 */}
                  <AnimatePresence>
                    {analysisMode === "user" && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-4 flex flex-col gap-1.5">
                          <label className="text-xs font-medium text-slate-400">
                            분할 방법을 입력하세요{" "}
                            <span className="text-violet-400">*</span>
                          </label>
                          <textarea
                            rows={3}
                            placeholder={"예: 목차의 1, 2, 3, 4 차례로 나눠줘\n예: 50페이지씩 균등하게 나눠줘\n예: 챕터별로 나눠줘"}
                            value={userInstruction}
                            onChange={(e) => setUserInstruction(e.target.value)}
                            className="px-3 py-2.5 rounded-xl bg-slate-900/60 border border-violet-700/40 text-slate-100 placeholder-slate-600 text-sm focus:outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/30 transition-colors resize-none"
                          />
                          <p className="text-xs text-slate-600">
                            AI가 이 지시사항을 최우선으로 따라 분할점을 찾습니다.
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* 제약 조건 — AI 모드에서만 표시 (직접 지정 모드는 사용자 입력이 대체) */}
                {analysisMode === "ai" && (
                  <ConstraintsForm
                    constraints={constraints}
                    onChange={setConstraints}
                  />
                )}

                {/* 페이지 오프셋 */}
                <div className="p-4 rounded-2xl border border-slate-700/50 bg-slate-800/40 backdrop-blur-sm">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    앞 페이지 오프셋
                  </p>
                  <p className="text-xs text-slate-600 mb-3">
                    표지·목차 등 번호 없는 앞 페이지 수. AI가 반환한 페이지에 이 값을 더해 실제 PDF 위치로 보정합니다.
                  </p>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={0}
                      max={200}
                      value={pageOffset}
                      onChange={(e) =>
                        setPageOffset(Math.max(0, parseInt(e.target.value) || 0))
                      }
                      className="w-24 px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-700/50 text-slate-100 text-sm text-center focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 transition-colors"
                    />
                    <span className="text-sm text-slate-400">페이지</span>
                    {pageOffset > 0 && (
                      <span className="text-xs px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
                        AI 결과 +{pageOffset}p 보정
                      </span>
                    )}
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          {/* ── AI 분석 버튼 (실제 PDF가 있을 때만) ─────── */}
          <AnimatePresence>
            {file && (
              <motion.div
                key="analyze-btn"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex justify-center mb-10"
              >
                <button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing || splitStatus === "splitting" || (analysisMode === "user" && !userInstruction.trim())}
                  className="group flex items-center gap-2.5 px-8 py-3.5 bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full font-semibold text-sm text-white shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>
                        {analyzeStage === "counting"
                          ? "페이지 수 확인 중..."
                          : analyzeStage === "milestone"
                          ? "1단계: 구조 파악 중..."
                          : analyzeStage === "range"
                          ? `2단계: 분할 중 (${stageProgress.current}/${stageProgress.total})...`
                          : analyzeStage === "merging"
                          ? "3단계: 결과 통합 중..."
                          : "AI 분석 중..."}
                      </span>
                    </>
                  ) : (
                    <>
                      {analysisMode === "user"
                        ? <Scissors className="w-4 h-4 group-hover:scale-110 transition-transform" />
                        : <Sparkles className="w-4 h-4 group-hover:scale-110 transition-transform" />
                      }
                      {hasResults
                        ? "재분석"
                        : analysisMode === "user"
                        ? "직접 지정으로 분석"
                        : "AI 분석 시작"}
                    </>
                  )}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── 멀티 스테이지 진행 상태 표시 ─────────────── */}
          <AnimatePresence>
            {isAnalyzing &&
              analyzeStage !== "idle" &&
              analyzeStage !== "single" && (
                <motion.div
                  key="analyze-progress"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden mb-8"
                >
                  <div className="flex flex-col items-center gap-3 p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/20">
                    {/* 단계 표시 알약 */}
                    <div className="flex items-center gap-2 flex-wrap justify-center">
                      {(
                        [
                          { key: "counting", label: "페이지 확인" },
                          { key: "milestone", label: "1단계: 구조 파악" },
                          { key: "range", label: "2단계: 상세 분할" },
                          { key: "merging", label: "3단계: 결과 통합" },
                        ] as { key: AnalyzeStage; label: string }[]
                      ).map(({ key, label }, idx) => {
                        const order: Record<AnalyzeStage, number> = {
                          idle: -1,
                          single: -1,
                          counting: 0,
                          milestone: 1,
                          range: 2,
                          merging: 3,
                        };
                        const cur = order[analyzeStage] ?? -1;
                        const isDone = cur > idx;
                        const isCurrent = cur === idx;
                        return (
                          <span
                            key={key}
                            className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                              isDone
                                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                                : isCurrent
                                ? "border-indigo-400/50 bg-indigo-400/10 text-indigo-300 animate-pulse"
                                : "border-slate-700/50 text-slate-600"
                            }`}
                          >
                            {isDone ? "✓ " : ""}
                            {label}
                          </span>
                        );
                      })}
                    </div>

                    {/* 청크 진행 바 (range 단계에서만) */}
                    {analyzeStage === "range" && stageProgress.total > 0 && (
                      <div className="w-full max-w-xs">
                        <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                          <span>
                            청크 {stageProgress.current}/{stageProgress.total}{" "}
                            처리 중
                          </span>
                          <span>
                            {Math.round(
                              (stageProgress.current / stageProgress.total) *
                                100
                            )}
                            %
                          </span>
                        </div>
                        <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <motion.div
                            className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full"
                            animate={{
                              width: `${
                                (stageProgress.current / stageProgress.total) *
                                100
                              }%`,
                            }}
                            transition={{ duration: 0.3, ease: "easeOut" }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
          </AnimatePresence>

          {/* ── 분석 에러 메시지 ──────────────────────────── */}
          <AnimatePresence>
            {analyzeError && (
              <motion.div
                key="analyze-error"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-start gap-3 mb-8 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm"
              >
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span className="leading-relaxed">{analyzeError}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Step 3 & 4: 분석 결과 + 미니 드롭존 + 분할 ── */}
          <AnimatePresence>
            {hasResults && (
              <motion.section
                key="results"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                {/* 결과 헤더 */}
                <div className="flex items-center justify-between mb-5 gap-3">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-slate-200">
                      분석 결과
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {sessions.length}개 회차 · 총 {totalPages}p ·{" "}
                      <span className="text-indigo-400">
                        페이지를 직접 수정할 수 있습니다
                      </span>
                    </p>
                  </div>
                  <button
                    className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-600/50 bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:border-slate-500 text-xs transition-colors"
                    onClick={() => {
                      const blob = new Blob(
                        [JSON.stringify({ sessions }, null, 2)],
                        { type: "application/json" }
                      );
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "edusplit-result.json";
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    <Download className="w-3.5 h-3.5" />
                    JSON
                  </button>
                </div>

                {/* 회차 카드 목록 */}
                <div className="space-y-3">
                  {sessions.map((session, index) => (
                    <SessionCard
                      key={session.sessionNumber}
                      session={session}
                      onUpdate={(updated) =>
                        handleSessionUpdate(index, updated)
                      }
                      onDownload={() => handleDownloadSession(session)}
                      isDownloading={downloadingSessionId === session.sessionNumber}
                      hasActivePdf={hasActivePdf}
                    />
                  ))}
                </div>

                {/* ── 상시 미니 드롭존 ────────────────────── */}
                <div className="mt-4">
                  {loadedFromHistory ? (
                    /* 이력 로드 상태: 분할용 원본 재업로드 유도 */
                    <MiniDropzone
                      onFileSelect={handleFileSelect}
                      onInvalidFile={() =>
                        addToast("error", "PDF 파일만 업로드 가능합니다.")
                      }
                      label="분할을 위해 원본 PDF 업로드"
                      sublabel="세션은 유지됩니다 · PDF 업로드 후 분할 버튼이 활성화됩니다"
                    />
                  ) : (
                    /* 일반 상태: 새 파일로 교체 */
                    <MiniDropzone
                      onFileSelect={handleFileSelect}
                      onInvalidFile={() =>
                        addToast("error", "PDF 파일만 업로드 가능합니다.")
                      }
                      label="새 파일 분석하기"
                      sublabel="현재 결과를 초기화하고 새 파일을 분석합니다"
                    />
                  )}
                </div>

                {/* ── PDF 분할 패널 ─────────────────────────── */}
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 }}
                  className="mt-4"
                >
                  <div className="p-5 rounded-2xl border border-slate-700/50 bg-slate-800/30 backdrop-blur-sm">
                    <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                      <div className="flex-1">
                        <h3 className="text-sm font-semibold text-slate-200 mb-1 flex items-center gap-2">
                          <Scissors className="w-4 h-4 text-violet-400" />
                          PDF 물리 분할
                        </h3>

                        {!hasActivePdf ? (
                          /* 이력 로드: PDF 재업로드 필요 */
                          <p className="text-xs text-amber-400/80 leading-relaxed flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                            분할하려면 위 드롭존에서 원본 PDF를 먼저
                            업로드해주세요.
                          </p>
                        ) : (
                          <p className="text-xs text-slate-500 leading-relaxed">
                            원본 품질 100% 보존 · {sessions.length}개 PDF →
                            ZIP 파일로 다운로드
                          </p>
                        )}
                      </div>

                      <button
                        onClick={handleSplit}
                        disabled={
                          !hasActivePdf ||
                          splitStatus === "splitting" ||
                          isAnalyzing
                        }
                        className="sm:flex-shrink-0 flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-500 to-pink-500 rounded-xl font-semibold text-sm text-white shadow-lg shadow-violet-500/20 hover:shadow-violet-500/35 hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
                      >
                        {splitStatus === "splitting" ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            분할 중...
                          </>
                        ) : (
                          <>
                            <FileArchive className="w-4 h-4" />
                            분할 및 다운로드
                          </>
                        )}
                      </button>
                    </div>

                    {/* 분할 상태 표시 */}
                    <AnimatePresence>
                      {splitStatus === "splitting" && (
                        <motion.div
                          key="splitting"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-4 pt-4 border-t border-slate-700/50">
                            <div className="flex items-center gap-3 mb-2">
                              <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                <motion.div
                                  className="h-full bg-gradient-to-r from-violet-500 to-pink-500 rounded-full"
                                  initial={{ width: "0%" }}
                                  animate={{ width: "100%" }}
                                  transition={{
                                    duration: 8,
                                    ease: "easeInOut",
                                  }}
                                />
                              </div>
                              <span className="text-xs text-slate-400 whitespace-nowrap">
                                처리 중...
                              </span>
                            </div>
                            <div className="space-y-1">
                              {sessions.map((s, i) => (
                                <motion.div
                                  key={s.sessionNumber}
                                  initial={{ opacity: 0, x: -8 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: i * 0.08 }}
                                  className="flex items-center gap-2 text-xs text-slate-500"
                                >
                                  <div className="w-1 h-1 rounded-full bg-violet-500/60" />
                                  <span className="truncate">
                                    {String(s.sessionNumber).padStart(2, "0")}
                                    _{s.title.slice(0, 28)}
                                    {s.title.length > 28 ? "..." : ""}.pdf
                                  </span>
                                  <span className="ml-auto flex-shrink-0 text-slate-600">
                                    p.{s.startPage}–{s.endPage}
                                  </span>
                                </motion.div>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )}

                      {splitStatus === "done" && (
                        <motion.div
                          key="done"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-4 pt-4 border-t border-slate-700/50">
                            <div className="flex items-center gap-2 text-sm">
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                              <span className="text-emerald-300 font-medium">
                                분할 완료!
                              </span>
                              {splitFilename && (
                                <span className="text-slate-400 text-xs ml-1 truncate">
                                  {splitFilename}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 mt-1.5 ml-6">
                              {sessions.length}개 PDF가 ZIP으로 저장되었습니다.
                            </p>
                          </div>
                        </motion.div>
                      )}

                      {splitStatus === "error" && splitError && (
                        <motion.div
                          key="error"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-4 pt-4 border-t border-slate-700/50 flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                            <span className="text-red-300 text-xs leading-relaxed">
                              {splitError}
                            </span>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </main>
    </>
  );
}
