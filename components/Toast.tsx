"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";

// ── 타입 정의 ─────────────────────────────────────────────
export type ToastType = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

// ── 스타일·아이콘 설정 ────────────────────────────────────
const CONFIG: Record<
  ToastType,
  {
    Icon: React.ElementType;
    iconClass: string;
    containerClass: string;
    duration: number;
  }
> = {
  success: {
    Icon: CheckCircle2,
    iconClass: "text-emerald-400",
    containerClass:
      "border-emerald-500/30 bg-emerald-950/80 text-emerald-200",
    duration: 4000,
  },
  error: {
    Icon: AlertCircle,
    iconClass: "text-red-400",
    containerClass: "border-red-500/30 bg-red-950/80 text-red-200",
    duration: 6000,
  },
  warning: {
    Icon: AlertTriangle,
    iconClass: "text-amber-400",
    containerClass: "border-amber-500/30 bg-amber-950/80 text-amber-200",
    duration: 5000,
  },
  info: {
    Icon: Info,
    iconClass: "text-indigo-400",
    containerClass:
      "border-indigo-500/30 bg-indigo-950/80 text-indigo-200",
    duration: 4000,
  },
};

// ── 개별 토스트 아이템 ────────────────────────────────────
function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const { Icon, iconClass, containerClass, duration } = CONFIG[toast.type];

  // 자동 닫힘 타이머
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), duration);
    return () => clearTimeout(timer);
  }, [toast.id, duration, onDismiss]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 56, scale: 0.94 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 56, scale: 0.94 }}
      transition={{ type: "spring", stiffness: 380, damping: 28 }}
      className={`flex items-start gap-2.5 pl-4 pr-3 py-3 rounded-xl border backdrop-blur-md shadow-xl text-sm w-72 sm:w-80 ${containerClass}`}
    >
      <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${iconClass}`} />
      <span className="flex-1 leading-snug">{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="ml-1 flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity"
        aria-label="알림 닫기"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
}

// ── 토스트 컨테이너 (최상위에 렌더링) ─────────────────────
interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div
      className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
      aria-atomic="false"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastItem toast={toast} onDismiss={onDismiss} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
