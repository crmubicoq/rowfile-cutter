import { NextRequest, NextResponse } from "next/server";
import { getGeminiModel } from "@/lib/gemini/client";
import { buildAnalyzePrompt, buildMilestonePrompt, buildDirectUserPrompt } from "@/lib/gemini/prompt";
import {
  AnalyzeRequestBody,
  AnalyzeResponse,
  MilestoneResponse,
} from "@/lib/gemini/types";
import { validateSessions, formatValidationSummary } from "@/lib/pdf/validator";
import type { Session } from "@/lib/gemini/types";

// Gemini inline data 실제 제한: ~20MB (공식 문서 기준)
// Base64는 원본 대비 약 4/3 배이므로 실제 PDF 기준 ~15MB
const GEMINI_INLINE_LIMIT_BYTES = 20 * 1024 * 1024;
const SERVER_MAX_BYTES = 50 * 1024 * 1024;

// ── Range 모드 자동 복구 함수 ───────────────────────────────────────
/**
 * Gemini가 endPage를 exclusive로 반환하는 fence-post 오류와
 * 범위 경계 불일치를 자동으로 복구합니다.
 *
 * 수행 내용:
 * 1. Fence-post 겹침 수정: curr.endPage >= next.startPage → curr.endPage = next.startPage - 1
 * 2. 첫 세션 startPage 강제: rangeStart로 고정
 * 3. 마지막 세션 endPage 강제: rangeEnd로 고정 (청크 완전 커버리지 보장)
 */
function autoRepairRangeSessions(
  sessions: Session[],
  rangeStart: number,
  rangeEnd: number
): { sessions: Session[]; repairs: string[]; actualEndPage: number } {
  const repairs: string[] = [];
  const sorted = [...sessions].sort((a, b) => a.sessionNumber - b.sessionNumber);

  // ── 1. Fence-post 겹침 자동 수정 ──────────────────────────
  for (let i = 0; i < sorted.length - 1; i++) {
    const curr = sorted[i];
    const next = sorted[i + 1];
    if (curr.endPage >= next.startPage) {
      const originalEnd = curr.endPage;
      const fixed = next.startPage - 1;
      sorted[i] = { ...curr, endPage: fixed };
      repairs.push(
        `[fence-post] p.${originalEnd}에서 중복 발생 — ` +
        `세션 ${curr.sessionNumber} endPage ${originalEnd} → ${fixed} ` +
        `(세션 ${next.sessionNumber} startPage=${next.startPage})`
      );
    }
  }

  // ── 2. 첫 세션 startPage 강제 ──────────────────────────────
  if (sorted[0].startPage !== rangeStart) {
    const original = sorted[0].startPage;
    sorted[0] = { ...sorted[0], startPage: rangeStart };
    repairs.push(
      `[boundary] 세션 ${sorted[0].sessionNumber} startPage ${original} → ${rangeStart} (범위 시작 강제)`
    );
  }

  // ── 3. 마지막 세션 endPage 강제 (유동 경계 + 완전 커버리지) ─
  const last = sorted[sorted.length - 1];
  const actualEndPage = last.endPage;
  if (last.endPage !== rangeEnd) {
    sorted[sorted.length - 1] = { ...last, endPage: rangeEnd };
    const direction = last.endPage < rangeEnd ? "부족" : "초과";
    repairs.push(
      `[fluid-boundary] 세션 ${last.sessionNumber} endPage ${actualEndPage} → ${rangeEnd} ` +
      `(AI 자연 경계 ${direction} — 청크 커버리지 강제 맞춤)`
    );
  }

  return { sessions: sorted, repairs, actualEndPage };
}

export async function POST(req: NextRequest) {
  // ── 1. 요청 바디 파싱 ──────────────────────────────────────────
  let body: AnalyzeRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "요청 바디가 올바른 JSON 형식이 아닙니다." },
      { status: 400 }
    );
  }

  const { pdfBase64, mimeType, constraints, mode = "single", userInstruction } = body;

  // ── 2. 필수 필드 검증 ──────────────────────────────────────────
  if (!pdfBase64 || !mimeType) {
    return NextResponse.json(
      { error: "pdfBase64와 mimeType은 필수 항목입니다." },
      { status: 400 }
    );
  }
  if (mimeType !== "application/pdf") {
    return NextResponse.json(
      { error: "mimeType은 반드시 'application/pdf'이어야 합니다." },
      { status: 400 }
    );
  }

  // ── 3. 크기 검증 (2단계 티어) ──────────────────────────────────
  const estimatedBytes = Math.ceil((pdfBase64.length * 3) / 4);
  const estimatedMB = Math.round(estimatedBytes / 1024 / 1024);

  if (estimatedBytes > SERVER_MAX_BYTES) {
    return NextResponse.json(
      { error: `PDF 파일 크기(~${estimatedMB}MB)가 서버 허용 한도(50MB)를 초과합니다.` },
      { status: 413 }
    );
  }

  const geminiSizeWarning =
    estimatedBytes > GEMINI_INLINE_LIMIT_BYTES
      ? `PDF 크기(~${estimatedMB}MB)가 Gemini inline 권장 한도(20MB)를 초과합니다. 분석이 느리거나 실패할 수 있습니다.`
      : null;

  try {
    const model = getGeminiModel();

    // ══════════════════════════════════════════════════════════
    // ── MILESTONE 모드: 대주제 이정표 감지 (멀티 스테이지 1단계)
    // ══════════════════════════════════════════════════════════
    if (mode === "milestone") {
      const { totalPages } = body;
      if (!totalPages || totalPages < 1) {
        return NextResponse.json(
          { error: "milestone 모드에는 totalPages(양의 정수)가 필요합니다." },
          { status: 400 }
        );
      }

      const prompt = buildMilestonePrompt(totalPages, userInstruction);
      const startTime = Date.now();

      const result = await model.generateContent([
        { inlineData: { mimeType: "application/pdf", data: pdfBase64 } },
        { text: prompt },
      ]);

      const elapsedMs = Date.now() - startTime;
      const responseText = result.response.text();
      console.log(
        `[analyze/milestone] 완료 (${elapsedMs}ms, ~${estimatedMB}MB)`
      );

      // JSON 파싱
      let parsed: MilestoneResponse;
      try {
        // ```json ... ``` 래퍼가 포함된 경우 제거
        const cleaned = responseText
          .replace(/^```json\s*/i, "")
          .replace(/```\s*$/, "")
          .trim();
        parsed = JSON.parse(cleaned);
      } catch {
        console.error("[analyze/milestone] JSON 파싱 실패:", responseText.slice(0, 500));
        return NextResponse.json(
          {
            error: "이정표 응답을 JSON으로 파싱하는 데 실패했습니다.",
            rawResponse: responseText.slice(0, 500),
          },
          { status: 502 }
        );
      }

      // milestones 배열 검증
      if (!Array.isArray(parsed?.milestones) || parsed.milestones.length === 0) {
        return NextResponse.json(
          { error: "Gemini가 유효한 이정표 목록을 반환하지 못했습니다." },
          { status: 502 }
        );
      }

      // 정규화: 첫 번째가 1이 아니면 삽입, 정렬, 중복 제거
      let milestones = parsed.milestones.filter(
        (m) => typeof m === "number" && m >= 1 && m <= totalPages
      );
      if (milestones[0] !== 1) milestones.unshift(1);
      milestones = Array.from(new Set(milestones)).sort((a, b) => a - b);

      return NextResponse.json(
        { milestones, totalPages },
        {
          status: 200,
          headers: { "X-Analysis-Duration-Ms": String(elapsedMs) },
        }
      );
    }

    // ══════════════════════════════════════════════════════════
    // ── RANGE 모드: 지정 범위 세션 분할 (멀티 스테이지 2단계)
    // ══════════════════════════════════════════════════════════
    if (mode === "range") {
      const { rangeStart, rangeEnd, targetSessionCount } = body;
      if (
        !rangeStart ||
        !rangeEnd ||
        rangeStart < 1 ||
        rangeEnd < rangeStart
      ) {
        return NextResponse.json(
          {
            error:
              "range 모드에는 유효한 rangeStart/rangeEnd(rangeStart ≥ 1, rangeEnd ≥ rangeStart)가 필요합니다.",
          },
          { status: 400 }
        );
      }

      const prompt = userInstruction
        ? buildDirectUserPrompt(userInstruction, { startPage: rangeStart, endPage: rangeEnd, targetSessionCount })
        : buildAnalyzePrompt(constraints ?? {}, { startPage: rangeStart, endPage: rangeEnd, targetSessionCount }, undefined);

      const startTime = Date.now();
      const result = await model.generateContent([
        { inlineData: { mimeType: "application/pdf", data: pdfBase64 } },
        { text: prompt },
      ]);
      const elapsedMs = Date.now() - startTime;
      const responseText = result.response.text();
      console.log(
        `[analyze/range] p.${rangeStart}~${rangeEnd} 완료 (${elapsedMs}ms)`
      );

      // JSON 파싱
      let parsed: AnalyzeResponse;
      try {
        const cleaned = responseText
          .replace(/^```json\s*/i, "")
          .replace(/```\s*$/, "")
          .trim();
        parsed = JSON.parse(cleaned);
      } catch {
        console.error("[analyze/range] JSON 파싱 실패:", responseText.slice(0, 500));
        return NextResponse.json(
          {
            error: `범위 p.${rangeStart}~${rangeEnd} 분석 결과를 JSON으로 파싱하는 데 실패했습니다.`,
            rawResponse: responseText.slice(0, 500),
          },
          { status: 502 }
        );
      }

      if (!Array.isArray(parsed?.sessions) || parsed.sessions.length === 0) {
        return NextResponse.json(
          {
            error: `범위 p.${rangeStart}~${rangeEnd}에서 유효한 회차 목록을 생성하지 못했습니다.`,
            rawResponse: responseText.slice(0, 500),
          },
          { status: 502 }
        );
      }

      // ── 자동 복구: fence-post / 경계 오류 ────────────────────
      // 1차 검증으로 오류 여부 먼저 확인
      const preValidation = validateSessions(parsed.sessions, rangeEnd);
      let sessionsToValidate = parsed.sessions;

      if (!preValidation.isValid || parsed.sessions[0].startPage !== rangeStart ||
          parsed.sessions[parsed.sessions.length - 1].endPage !== rangeEnd) {
        const { sessions: repaired, repairs, actualEndPage } =
          autoRepairRangeSessions(parsed.sessions, rangeStart, rangeEnd);

        if (repairs.length > 0) {
          console.log(
            `[analyze/range] p.${rangeStart}~${rangeEnd} 자동 복구 ${repairs.length}건 (AI 자연 경계: p.${actualEndPage}):`
          );
          repairs.forEach((r) => console.log(`  ✦ ${r}`));
        }
        sessionsToValidate = repaired;
      }

      // ── 복구 후 최종 검증 ─────────────────────────────────────
      const validation = validateSessions(sessionsToValidate, rangeEnd);
      if (!validation.isValid) {
        console.error(
          `[analyze/range] p.${rangeStart}~${rangeEnd} 복구 후에도 검증 실패:`
        );
        validation.errors.forEach((e) => {
          const pageHint = e.message.match(/p\.\d+/)?.[0] ?? "";
          console.error(`  ✗ ${pageHint ? pageHint + "에서 " : ""}${e.message}`);
        });
        console.error(formatValidationSummary(validation));
        return NextResponse.json(
          {
            error: `범위 p.${rangeStart}~${rangeEnd}: 자동 복구 후에도 논리 오류가 남아 있습니다. 재시도해 주세요.`,
            validationErrors: validation.errors,
            validationWarnings: validation.warnings,
          },
          { status: 422 }
        );
      }

      return NextResponse.json(
        {
          sessions: sessionsToValidate,
          _warnings: validation.warnings.length > 0 ? validation.warnings : undefined,
          _meta: { analysisMs: elapsedMs, rangeStart, rangeEnd, estimatedMB },
        },
        {
          status: 200,
          headers: {
            "X-Analysis-Duration-Ms": String(elapsedMs),
            "X-Session-Count": String(sessionsToValidate.length),
            "X-Range": `${rangeStart}-${rangeEnd}`,
          },
        }
      );
    }

    // ══════════════════════════════════════════════════════════
    // ── SINGLE 모드: 전체 PDF 단일 분석 (기존 로직)
    // ══════════════════════════════════════════════════════════
    const prompt = userInstruction
      ? buildDirectUserPrompt(userInstruction)
      : buildAnalyzePrompt(constraints ?? {}, undefined, undefined);
    const startTime = Date.now();

    const result = await model.generateContent([
      { inlineData: { mimeType: "application/pdf", data: pdfBase64 } },
      { text: prompt },
    ]);
    const elapsedMs = Date.now() - startTime;
    console.log(`[analyze/single] Gemini 응답 수신 완료 (${elapsedMs}ms, ~${estimatedMB}MB)`);

    const responseText = result.response.text();

    // JSON 파싱
    let parsed: AnalyzeResponse;
    try {
      const cleaned = responseText
        .replace(/^```json\s*/i, "")
        .replace(/```\s*$/, "")
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("[analyze/single] JSON 파싱 실패:", responseText.slice(0, 500));
      return NextResponse.json(
        {
          error:
            "Gemini 응답을 JSON으로 파싱하는 데 실패했습니다. " +
            "원고가 너무 복잡하거나 비구조적일 수 있습니다.",
          rawResponse: responseText.slice(0, 1000),
        },
        { status: 502 }
      );
    }

    if (!Array.isArray(parsed?.sessions) || parsed.sessions.length === 0) {
      return NextResponse.json(
        {
          error:
            "Gemini가 유효한 회차 목록을 생성하지 못했습니다. " +
            "원고 내용이 매우 짧거나 목차 구조가 없는 경우 발생할 수 있습니다.",
          rawResponse: responseText.slice(0, 1000),
        },
        { status: 502 }
      );
    }

    // 3단계 검증 시스템 적용
    const validation = validateSessions(parsed.sessions);

    if (!validation.isValid) {
      console.error("[analyze/single] 세션 검증 실패:\n", formatValidationSummary(validation));
      return NextResponse.json(
        {
          error:
            "AI가 생성한 회차 분할에 논리 오류가 있습니다. 재분석을 시도하세요.",
          validationErrors: validation.errors,
          validationWarnings: validation.warnings,
        },
        { status: 422 }
      );
    }

    return NextResponse.json(
      {
        ...parsed,
        _warnings: validation.warnings.length > 0 ? validation.warnings : undefined,
        _meta: {
          analysisMs: elapsedMs,
          coveredPages: validation.coveredPages,
          estimatedMB,
          geminiSizeWarning: geminiSizeWarning ?? undefined,
        },
      },
      {
        status: 200,
        headers: {
          "X-Analysis-Duration-Ms": String(elapsedMs),
          "X-Session-Count": String(parsed.sessions.length),
          "X-Covered-Pages": String(validation.coveredPages),
          ...(geminiSizeWarning ? { "X-Size-Warning": "1" } : {}),
          ...(validation.warnings.length > 0
            ? { "X-Validation-Warnings": String(validation.warnings.length) }
            : {}),
        },
      }
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
    console.error(`[analyze/${mode}] Gemini API 호출 오류:`, message);

    if (message.includes("API_KEY") || message.includes("PERMISSION_DENIED")) {
      return NextResponse.json(
        { error: "Gemini API 키가 유효하지 않습니다. .env.local의 GEMINI_API_KEY를 확인하세요." },
        { status: 401 }
      );
    }
    if (message.includes("quota") || message.includes("RESOURCE_EXHAUSTED")) {
      return NextResponse.json(
        { error: "Gemini API 사용량 한도를 초과했습니다. 잠시 후 다시 시도하세요." },
        { status: 429 }
      );
    }
    if (
      message.includes("timeout") ||
      message.includes("DEADLINE_EXCEEDED") ||
      message.includes("Request payload size exceeds")
    ) {
      return NextResponse.json(
        {
          error:
            "Gemini API 처리 시간 초과 또는 파일이 너무 큽니다. " +
            "PDF가 20MB를 넘는 경우 더 작은 파일로 나누어 시도하세요.",
        },
        { status: 408 }
      );
    }
    if (message.includes("SAFETY") || message.includes("blocked")) {
      return NextResponse.json(
        {
          error:
            "Gemini가 원고 내용을 처리할 수 없습니다. " +
            "안전 정책에 위배되는 내용이 포함되어 있을 수 있습니다.",
        },
        { status: 422 }
      );
    }

    return NextResponse.json(
      { error: `Gemini API 오류: ${message}` },
      { status: 500 }
    );
  }
}

// 대용량 PDF 처리를 위한 최대 실행 시간
export const maxDuration = 60;
