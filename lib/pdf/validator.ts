import type { Session } from "@/lib/gemini/types";

// ── 타입 정의 ────────────────────────────────────────────────────

export type ValidationErrorType =
  | "INVALID_PAGE_NUMBER"   // startPage < 1 또는 endPage < 1
  | "RANGE_INVERTED"        // startPage > endPage
  | "OUT_OF_BOUNDS"         // endPage > 실제 PDF 총 페이지
  | "OVERLAP"               // 세션 간 페이지 겹침
  | "MISSING_FIELDS";       // 필수 필드 누락

export type ValidationWarningType =
  | "GAP"                   // 세션 간 누락 페이지 (선택적 경고)
  | "SINGLE_PAGE"           // 1페이지짜리 세션
  | "LARGE_SESSION"         // 지나치게 긴 세션 (50페이지 초과)
  | "UNORDERED_SESSIONS";   // sessionNumber가 오름차순이 아님

export interface ValidationError {
  type: ValidationErrorType;
  sessionNumber: number;
  message: string;
}

export interface ValidationWarning {
  type: ValidationWarningType;
  sessionNumber?: number;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  /** 검증된 세션 수 */
  sessionCount: number;
  /** 전체 커버 페이지 수 (gap 제외) */
  coveredPages: number;
}

// ── 검증 함수 ────────────────────────────────────────────────────

/**
 * AI가 반환한 세션 배열을 3단계로 검증합니다.
 *
 * 1단계 — 개별 세션 검증: 각 세션의 페이지 범위가 유효한지
 * 2단계 — 세션 간 교차 검증: 겹침(Overlap) 및 순서 오류
 * 3단계 — 경고 발생: Off-by-one 위험, 큰 세션, 갭 등
 *
 * @param sessions     검증할 세션 배열
 * @param totalPages   실제 PDF의 총 페이지 수 (선택, 미전달 시 경계 검사 생략)
 */
export function validateSessions(
  sessions: Session[],
  totalPages?: number
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // ── 1단계: 개별 세션 검증 ──────────────────────────────────────
  for (const s of sessions) {
    // 필수 필드 존재 여부
    if (
      typeof s.sessionNumber !== "number" ||
      typeof s.startPage !== "number" ||
      typeof s.endPage !== "number" ||
      !s.title?.trim()
    ) {
      errors.push({
        type: "MISSING_FIELDS",
        sessionNumber: s.sessionNumber ?? -1,
        message: `세션 ${s.sessionNumber}: sessionNumber, startPage, endPage, title은 필수입니다.`,
      });
      continue;
    }

    // 1-based 최솟값 검사
    if (s.startPage < 1 || s.endPage < 1) {
      errors.push({
        type: "INVALID_PAGE_NUMBER",
        sessionNumber: s.sessionNumber,
        message: `세션 ${s.sessionNumber}: 페이지 번호는 1 이상이어야 합니다. (startPage=${s.startPage}, endPage=${s.endPage})`,
      });
    }

    // 범위 역전 검사 (startPage > endPage)
    if (s.startPage > s.endPage) {
      errors.push({
        type: "RANGE_INVERTED",
        sessionNumber: s.sessionNumber,
        message: `세션 ${s.sessionNumber}: startPage(${s.startPage})가 endPage(${s.endPage})보다 큽니다.`,
      });
    }

    // 총 페이지 초과 검사 (totalPages가 주어진 경우)
    if (totalPages !== undefined && s.endPage > totalPages) {
      errors.push({
        type: "OUT_OF_BOUNDS",
        sessionNumber: s.sessionNumber,
        message: `세션 ${s.sessionNumber}: endPage(${s.endPage})가 PDF 총 페이지(${totalPages})를 초과합니다.`,
      });
    }

    // 경고: 1페이지짜리 세션
    if (s.startPage === s.endPage) {
      warnings.push({
        type: "SINGLE_PAGE",
        sessionNumber: s.sessionNumber,
        message: `세션 ${s.sessionNumber}: 1페이지(p.${s.startPage})만 포함합니다. One Message 원칙 충족 여부를 확인하세요.`,
      });
    }

    // 경고: 50페이지 초과 세션
    if (s.endPage - s.startPage + 1 > 50) {
      warnings.push({
        type: "LARGE_SESSION",
        sessionNumber: s.sessionNumber,
        message: `세션 ${s.sessionNumber}: ${s.endPage - s.startPage + 1}페이지로 매우 큽니다. 인지 부하 과다 위험이 있습니다.`,
      });
    }
  }

  // 에러가 있으면 교차 검증 건너뜀 (기본 정보가 손상된 세션 제외)
  if (errors.length > 0) {
    return {
      isValid: false,
      errors,
      warnings,
      sessionCount: sessions.length,
      coveredPages: 0,
    };
  }

  // ── 2단계: 세션 간 교차 검증 ──────────────────────────────────
  // sessionNumber 오름차순 정렬 후 검사
  const sorted = [...sessions].sort((a, b) => a.sessionNumber - b.sessionNumber);

  // sessionNumber 순서 경고
  const isOrdered = sessions.every(
    (s, i) => i === 0 || s.sessionNumber > sessions[i - 1].sessionNumber
  );
  if (!isOrdered) {
    warnings.push({
      type: "UNORDERED_SESSIONS",
      message: "세션 번호가 오름차순이 아닙니다. 자동으로 정렬하여 처리됩니다.",
    });
  }

  // 겹침(Overlap) 검사
  for (let i = 0; i < sorted.length - 1; i++) {
    const curr = sorted[i];
    const next = sorted[i + 1];

    // Off-by-one 정밀 검사:
    // curr.endPage >= next.startPage 이면 겹침
    // (예: curr.endPage=5, next.startPage=5 → 5페이지 중복!)
    if (curr.endPage >= next.startPage) {
      errors.push({
        type: "OVERLAP",
        sessionNumber: next.sessionNumber,
        message:
          `세션 ${curr.sessionNumber}(p.${curr.startPage}–${curr.endPage})과 ` +
          `세션 ${next.sessionNumber}(p.${next.startPage}–${next.endPage})이 겹칩니다. ` +
          `(겹치는 페이지: p.${next.startPage}–${curr.endPage})`,
      });
    }

    // 경고: 갭(Gap) 검사
    // curr.endPage + 1 < next.startPage 이면 누락된 페이지 존재
    const gapStart = curr.endPage + 1;
    const gapEnd = next.startPage - 1;
    if (gapStart <= gapEnd) {
      warnings.push({
        type: "GAP",
        sessionNumber: next.sessionNumber,
        message:
          `세션 ${curr.sessionNumber}과 세션 ${next.sessionNumber} 사이에 ` +
          `p.${gapStart}–${gapEnd}(${gapEnd - gapStart + 1}페이지)가 어느 회차에도 포함되지 않습니다.`,
      });
    }
  }

  // ── 커버 페이지 수 계산 ────────────────────────────────────────
  const coveredPages = sorted.reduce(
    (sum, s) => sum + (s.endPage - s.startPage + 1),
    0
  );

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    sessionCount: sessions.length,
    coveredPages,
  };
}

/**
 * ValidationResult를 클라이언트 응답용 요약 문자열로 변환합니다.
 */
export function formatValidationSummary(result: ValidationResult): string {
  const lines: string[] = [];
  if (result.errors.length > 0) {
    lines.push(`[오류 ${result.errors.length}건]`);
    result.errors.forEach((e) => lines.push(`  ✗ ${e.message}`));
  }
  if (result.warnings.length > 0) {
    lines.push(`[경고 ${result.warnings.length}건]`);
    result.warnings.forEach((w) => lines.push(`  △ ${w.message}`));
  }
  return lines.join("\n");
}
