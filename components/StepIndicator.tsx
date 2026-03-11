"use client";

import { motion } from "framer-motion";
import { Check, Upload, Sparkles, SlidersHorizontal, FileArchive } from "lucide-react";

export type StepId = 1 | 2 | 3 | 4;

const STEPS: { id: StepId; label: string; icon: React.ReactNode }[] = [
  { id: 1, label: "업로드", icon: <Upload className="w-3.5 h-3.5" /> },
  { id: 2, label: "AI 분석", icon: <Sparkles className="w-3.5 h-3.5" /> },
  { id: 3, label: "회차 조정", icon: <SlidersHorizontal className="w-3.5 h-3.5" /> },
  { id: 4, label: "분할 저장", icon: <FileArchive className="w-3.5 h-3.5" /> },
];

interface Props {
  currentStep: StepId;
  completedSteps: StepId[];
}

export function StepIndicator({ currentStep, completedSteps }: Props) {
  return (
    <nav
      className="flex items-center justify-center mb-10"
      aria-label="진행 단계"
    >
      {STEPS.map((step, index) => {
        const isDone = completedSteps.includes(step.id);
        // Show active indicator only when not yet done
        const isActive = step.id === currentStep && !isDone;

        return (
          <div key={step.id} className="flex items-center">
            {/* Step bubble + label */}
            <motion.div
              className="flex flex-col items-center gap-1.5"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.07 }}
            >
              {/* Bubble */}
              <div
                className={`
                  relative w-9 h-9 rounded-full flex items-center justify-center
                  transition-all duration-300
                  ${
                    isDone
                      ? "bg-indigo-500/20 border-2 border-indigo-500 text-indigo-400"
                      : isActive
                      ? "bg-indigo-600 border-2 border-indigo-400 text-white"
                      : "bg-slate-800 border-2 border-slate-700 text-slate-600"
                  }
                `}
              >
                {isDone ? (
                  <motion.span
                    initial={{ scale: 0, rotate: -45 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                  >
                    <Check className="w-4 h-4" />
                  </motion.span>
                ) : (
                  step.icon
                )}

                {/* Active pulse ring */}
                {isActive && (
                  <motion.div
                    className="absolute inset-0 rounded-full border-2 border-indigo-400"
                    animate={{ scale: [1, 1.5, 1], opacity: [0.7, 0, 0.7] }}
                    transition={{
                      repeat: Infinity,
                      duration: 2,
                      ease: "easeInOut",
                    }}
                  />
                )}
              </div>

              {/* Label */}
              <span
                className={`text-[10px] font-medium whitespace-nowrap transition-colors duration-300 ${
                  isDone || isActive ? "text-indigo-400" : "text-slate-600"
                }`}
              >
                {step.label}
              </span>
            </motion.div>

            {/* Connector line */}
            {index < STEPS.length - 1 && (
              <div className="relative w-10 sm:w-14 h-0.5 mx-1.5 mb-5 bg-slate-700 rounded-full overflow-hidden">
                <motion.div
                  className="absolute inset-0 bg-indigo-500 rounded-full origin-left"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: isDone ? 1 : 0 }}
                  transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }}
                />
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
