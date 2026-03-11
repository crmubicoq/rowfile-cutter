/**
 * EduSplit AI — 분석 이력 관리 (localStorage)
 *
 * 저장 정책:
 * - PDF Base64 원본은 저장 금지 (5MB 한도 절약)
 * - 메타데이터 + sessions JSON만 저장
 * - 최대 MAX_ENTRIES개 유지 (초과 시 오래된 항목 자동 제거)
 * - QuotaExceededError 발생 시 3단계 폴백 처리
 */

import type { Session } from "@/lib/gemini/types";

export interface HistoryEntry {
  id: string;
  filename: string;
  fileSizeBytes: number; // 표시용 (저장 용량 아님)
  sessionCount: number;
  analyzedAt: string; // ISO 8601
  sessions: Session[];
}

const STORAGE_KEY = "edusplit_history";
const MAX_ENTRIES = 10;

// ── Public API ──────────────────────────────────────────────

/** localStorage에서 전체 이력을 불러옵니다. SSR에서는 빈 배열 반환. */
export function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HistoryEntry[];
  } catch {
    return [];
  }
}

/**
 * 새 분석 결과를 이력에 추가합니다.
 * 최신 항목이 맨 위에 오도록 정렬하며, MAX_ENTRIES 초과 시 오래된 항목 제거.
 */
export function appendHistory(
  entry: Omit<HistoryEntry, "id">
): HistoryEntry {
  const id = `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const newEntry: HistoryEntry = { id, ...entry };

  const current = loadHistory();
  const updated = [newEntry, ...current].slice(0, MAX_ENTRIES);
  persistHistory(updated);
  return newEntry;
}

/** 특정 이력 항목을 삭제하고 갱신된 목록을 반환합니다. */
export function deleteHistoryEntry(id: string): HistoryEntry[] {
  const updated = loadHistory().filter((e) => e.id !== id);
  persistHistory(updated);
  return updated;
}

/** 전체 이력을 삭제합니다. */
export function clearHistory(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

// ── 내부 헬퍼 ──────────────────────────────────────────────

/**
 * localStorage에 이력을 저장합니다.
 * QuotaExceededError 발생 시:
 *   1차: 절반 항목으로 축소 후 재시도
 *   2차: 최신 1개만 유지
 *   3차: 무시 (로컬 상태에는 유지됨)
 */
function persistHistory(entries: HistoryEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // 1차 폴백: 절반 제거
    const half = entries.slice(0, Math.ceil(entries.length / 2));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(half));
    } catch {
      // 2차 폴백: 최신 1개만
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, 1)));
      } catch {
        // 완전 포기 — localStorage 공간 부족
        console.warn("[EduSplit] localStorage 저장 실패: 용량 부족");
      }
    }
  }
}
