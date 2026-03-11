import { NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";

/**
 * POST /api/pagecount
 *
 * pdf-lib만 사용해 PDF 총 페이지 수를 빠르게 반환합니다.
 * Gemini를 호출하지 않으므로 응답이 빠릅니다 (< 3s).
 *
 * Request : { pdfBase64: string }
 * Response: { totalPages: number }
 */
export async function POST(req: NextRequest) {
  // ── 1. 요청 파싱 ──────────────────────────────────────────
  let body: { pdfBase64: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "요청 바디가 올바른 JSON 형식이 아닙니다." },
      { status: 400 }
    );
  }

  const { pdfBase64 } = body;
  if (!pdfBase64) {
    return NextResponse.json(
      { error: "pdfBase64는 필수 항목입니다." },
      { status: 400 }
    );
  }

  // ── 2. pdf-lib으로 페이지 수 추출 ────────────────────────
  try {
    const bytes = Buffer.from(pdfBase64, "base64");
    // ignoreEncryption: 암호화 PDF도 페이지 수 추출 시도
    const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const totalPages = pdfDoc.getPageCount();

    console.log(`[pagecount] 총 ${totalPages}페이지 확인 완료`);

    return NextResponse.json({ totalPages }, { status: 200 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
    console.error("[pagecount] PDF 페이지 수 추출 실패:", message);

    return NextResponse.json(
      { error: `PDF 페이지 수를 읽을 수 없습니다: ${message}` },
      { status: 500 }
    );
  }
}

// 페이지 카운트는 빠르므로 30초면 충분
export const maxDuration = 30;
