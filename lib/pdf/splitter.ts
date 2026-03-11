import { PDFDocument } from "pdf-lib";

// ── 타입 ──────────────────────────────────────────────────────────

/** 단일 세션 분할 결과 */
export interface SplitResult {
  filename: string;
  data: Uint8Array;
  pageCount: number;
}

// ── 유틸 ──────────────────────────────────────────────────────────

/**
 * 파일명에 사용할 수 없는 문자를 제거/치환합니다.
 * Windows·macOS·Linux 공통 금지 문자 처리 포함.
 */
export function sanitizeFilename(name: string): string {
  return name
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "") // 금지 문자 제거
    .replace(/\s+/g, "_")                    // 공백 → 언더스코어
    .replace(/_{2,}/g, "_")                  // 연속 언더스코어 정리
    .slice(0, 80);                            // 최대 80자 제한
}

/**
 * Base64 문자열을 Uint8Array로 변환합니다.
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

// ── 핵심 함수 ─────────────────────────────────────────────────────

/**
 * 이미 로드된 PDFDocument에서 특정 페이지 범위를 추출합니다.
 *
 * ## Off-by-one 검증 (1-based ↔ 0-based 변환)
 *
 * pdf-lib의 copyPages()는 0-based 인덱스를 사용합니다.
 * 사용자/AI는 1-based 페이지 번호를 사용합니다.
 *
 * 변환 공식:
 *   fromIdx = startPage - 1
 *   toIdx   = endPage   - 1
 *
 * 검증 예시:
 *   startPage=1, endPage=5 → fromIdx=0, toIdx=4
 *   pageIndices = [0,1,2,3,4] → 5페이지 (p.1–5) ✓
 *
 *   startPage=6, endPage=10 → fromIdx=5, toIdx=9
 *   pageIndices = [5,6,7,8,9] → 5페이지 (p.6–10) ✓
 *   → 이전 세션 p.1–5와 겹침 없음, 갭 없음 ✓
 *
 *   연속 두 세션의 경계:
 *   curr.endPage=5 → 0-based 4번 인덱스 (p.5)
 *   next.startPage=6 → 0-based 5번 인덱스 (p.6)
 *   → 인덱스 4와 5는 별개 → 중복 없음 ✓
 *
 * @param srcDoc    이미 로드된 원본 PDFDocument
 * @param startPage 추출 시작 페이지 (1-based, 포함)
 * @param endPage   추출 종료 페이지 (1-based, 포함)
 */
async function extractRangeFromDoc(
  srcDoc: PDFDocument,
  startPage: number,
  endPage: number
): Promise<Uint8Array> {
  const totalPages = srcDoc.getPageCount();

  // 1-based → 0-based, 범위 클램핑
  const fromIdx = Math.max(0, startPage - 1);
  const toIdx = Math.min(totalPages - 1, endPage - 1);

  if (fromIdx > toIdx) {
    throw new Error(
      `유효하지 않은 페이지 범위: ` +
        `startPage(${startPage}) > endPage(${endPage}) 또는 ` +
        `총 페이지(${totalPages}) 초과`
    );
  }

  const destDoc = await PDFDocument.create();

  // fromIdx부터 toIdx까지 연속 인덱스 배열 생성
  // length = toIdx - fromIdx + 1 (경계 포함 계산)
  const pageIndices = Array.from(
    { length: toIdx - fromIdx + 1 },
    (_, i) => fromIdx + i
  );

  // copyPages: 원본 폰트·이미지·레이아웃 100% 보존
  const copiedPages = await destDoc.copyPages(srcDoc, pageIndices);
  copiedPages.forEach((page) => destDoc.addPage(page));

  return destDoc.save();
}

/**
 * Base64 PDF에서 특정 페이지 범위를 추출합니다. (단일 추출용)
 * 여러 세션을 한 번에 처리할 때는 splitPdfBySessions를 사용하세요.
 */
export async function extractPageRange(
  pdfBase64: string,
  startPage: number,
  endPage: number
): Promise<Uint8Array> {
  const bytes = base64ToUint8Array(pdfBase64);
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return extractRangeFromDoc(srcDoc, startPage, endPage);
}

/**
 * 여러 세션 정보를 받아 각 세션별 PDF를 분할하여 반환합니다.
 *
 * ## 성능 최적화 (v2)
 * PDF 파싱(PDFDocument.load)을 단 한 번만 수행하고,
 * 모든 세션이 동일한 srcDoc 인스턴스를 공유합니다.
 *
 * 이전 방식 문제:
 *   extractPageRange()를 세션 수만큼 반복 호출
 *   → N 세션 = N번 base64 디코딩 + N번 PDF 파싱 (메모리 낭비)
 *
 * 현재 방식:
 *   1회 base64 디코딩 + 1회 PDF 파싱 → N번 copyPages (효율적)
 *
 * @param pdfBase64  원본 PDF Base64
 * @param sessions   분할할 세션 배열
 */
export async function splitPdfBySessions(
  pdfBase64: string,
  sessions: { sessionNumber: number; title: string; startPage: number; endPage: number }[]
): Promise<SplitResult[]> {
  // PDF를 단 한 번만 파싱 (핵심 최적화)
  const bytes = base64ToUint8Array(pdfBase64);
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });

  const results: SplitResult[] = [];

  for (const session of sessions) {
    const paddedNum = String(session.sessionNumber).padStart(2, "0");
    const safeTitle = sanitizeFilename(session.title);
    const filename = `${paddedNum}_${safeTitle}.pdf`;

    const data = await extractRangeFromDoc(
      srcDoc,
      session.startPage,
      session.endPage
    );

    results.push({
      filename,
      data,
      // pageCount는 클램핑 이전 요청값 기준으로 기록
      pageCount: session.endPage - session.startPage + 1,
    });
  }

  return results;
}
