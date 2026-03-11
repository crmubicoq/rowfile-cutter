"use client";

import { Settings2 } from "lucide-react";

interface Constraints {
  sessionCount?: number;
  maxPagesPerSession?: number;
  lectureTime?: number;
  additionalInstructions?: string;
}

interface Props {
  constraints: Constraints;
  onChange: (c: Constraints) => void;
}

export function ConstraintsForm({ constraints, onChange }: Props) {
  const update = (patch: Partial<Constraints>) =>
    onChange({ ...constraints, ...patch });

  return (
    <div className="p-6 rounded-2xl border border-slate-700/50 bg-slate-800/40 backdrop-blur-sm">
      <div className="flex items-center gap-2 mb-5">
        <Settings2 className="w-4 h-4 text-indigo-400" />
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
          분할 제약 조건
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* 회차 수 */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-400">
            회차 수 <span className="text-slate-600">(비워두면 AI가 자동 결정)</span>
          </label>
          <input
            type="number"
            min={1}
            max={50}
            placeholder="예: 8"
            value={constraints.sessionCount ?? ""}
            onChange={(e) =>
              update({
                sessionCount: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            className="px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-700/60 text-slate-100 placeholder-slate-600 text-sm focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 transition-colors"
          />
        </div>

        {/* 회차당 최대 페이지 */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-400">
            회차당 최대 페이지 <span className="text-slate-600">(선택)</span>
          </label>
          <input
            type="number"
            min={1}
            max={200}
            placeholder="예: 20"
            value={constraints.maxPagesPerSession ?? ""}
            onChange={(e) =>
              update({
                maxPagesPerSession: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            className="px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-700/60 text-slate-100 placeholder-slate-600 text-sm focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 transition-colors"
          />
        </div>

        {/* 회차당 강의 시간 */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-400">
            회차당 강의 시간 (분){" "}
            <span className="text-slate-600">(선택)</span>
          </label>
          <input
            type="number"
            min={1}
            max={300}
            placeholder="예: 50"
            value={constraints.lectureTime ?? ""}
            onChange={(e) =>
              update({
                lectureTime: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            className="px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-700/60 text-slate-100 placeholder-slate-600 text-sm focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 transition-colors"
          />
        </div>

        {/* 추가 지시사항 */}
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label className="text-xs font-medium text-slate-400">
            추가 지시사항 <span className="text-slate-600">(선택)</span>
          </label>
          <textarea
            rows={2}
            placeholder="예: '실습 내용은 반드시 이론 설명과 같은 회차에 포함해줘'"
            value={constraints.additionalInstructions ?? ""}
            onChange={(e) =>
              update({
                additionalInstructions: e.target.value || undefined,
              })
            }
            className="px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-700/60 text-slate-100 placeholder-slate-600 text-sm focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 transition-colors resize-none"
          />
        </div>
      </div>
    </div>
  );
}
