import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { splitPdfBySessions } from "@/lib/pdf/splitter";
import type { Session } from "@/lib/gemini/types";

/** 클라이언트에서 /api/split으로 전송하는 요청 바디 */
interface SplitRequestBody {
  /** 원본 PDF Base64 문자열 */
  pdfBase64: string;
  /** 분할할 세션 배열 (AI 분석 결과 또는 사용자 수정 결과) */
  sessions: Session[];
  /** 원본 파일명 (ZIP 파일명 생성에 사용) */
  originalFilename?: string;
}

export async function POST(req: NextRequest) {
  // 1. 요청 바디 파싱
  let body: SplitRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "요청 바디가 올바른 JSON 형식이 아닙니다." },
      { status: 400 }
    );
  }

  const { pdfBase64, sessions, originalFilename } = body;

  // 2. 필수 필드 검증
  if (!pdfBase64) {
    return NextResponse.json(
      { error: "pdfBase64는 필수 항목입니다." },
      { status: 400 }
    );
  }

  if (!Array.isArray(sessions) || sessions.length === 0) {
    return NextResponse.json(
      { error: "sessions 배열이 비어있거나 유효하지 않습니다." },
      { status: 400 }
    );
  }

  // 3. 페이지 범위 기본 유효성 검사
  for (const session of sessions) {
    if (
      typeof session.startPage !== "number" ||
      typeof session.endPage !== "number" ||
      session.startPage < 1 ||
      session.endPage < session.startPage
    ) {
      return NextResponse.json(
        {
          error: `세션 ${session.sessionNumber}의 페이지 범위가 유효하지 않습니다. (startPage: ${session.startPage}, endPage: ${session.endPage})`,
        },
        { status: 400 }
      );
    }
  }

  // 4. PDF 크기 사전 검증 (~50MB)
  const estimatedBytes = (pdfBase64.length * 3) / 4;
  if (estimatedBytes > 50 * 1024 * 1024) {
    return NextResponse.json(
      { error: "PDF 파일 크기가 50MB를 초과합니다." },
      { status: 413 }
    );
  }

  try {
    // 5. 세션별 PDF 분할 실행
    const splitResults = await splitPdfBySessions(pdfBase64, sessions);

    // 6-A. 단일 세션: ZIP 없이 PDF 직접 반환 (개별 다운로드 UX 최적화)
    if (splitResults.length === 1) {
      const result = splitResults[0];
      const encodedFilename = encodeURIComponent(result.filename);
      return new NextResponse(new Uint8Array(result.data), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodedFilename}`,
          "Content-Length": String(result.data.length),
          "X-Split-Count": "1",
          "X-Split-Total-Pages": String(result.pageCount),
        },
      });
    }

    // 6-B. 복수 세션: JSZip으로 ZIP 파일 생성
    const zip = new JSZip();

    // 원본 파일명 기반 폴더명 생성 (없으면 "EduSplit")
    const baseName = originalFilename
      ? originalFilename.replace(/\.pdf$/i, "").replace(/[<>:"/\\|?*]/g, "").trim()
      : "EduSplit";

    const folder = zip.folder(baseName);
    if (!folder) {
      throw new Error("ZIP 폴더 생성에 실패했습니다.");
    }

    // 각 분할 PDF를 ZIP에 추가
    for (const result of splitResults) {
      folder.file(result.filename, result.data, { binary: true });
    }

    // 7. ZIP 바이너리 생성
    const zipBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    // 8. 다운로드용 헤더와 함께 응답
    const zipFilename = `${baseName}_split.zip`;
    const encodedFilename = encodeURIComponent(zipFilename);

    // Buffer → Uint8Array: TypeScript의 BodyInit 호환성 보장
    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodedFilename}`,
        "Content-Length": String(zipBuffer.length),
        // 분할 결과 메타정보를 헤더로 전달 (클라이언트 알림용)
        "X-Split-Count": String(splitResults.length),
        "X-Split-Total-Pages": String(
          splitResults.reduce((sum, r) => sum + r.pageCount, 0)
        ),
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";

    console.error("[split] PDF 분할 오류:", message);

    // pdf-lib의 암호화 오류 처리
    if (message.includes("encrypted") || message.includes("password")) {
      return NextResponse.json(
        { error: "암호화된 PDF는 분할할 수 없습니다. 암호를 해제한 후 다시 시도하세요." },
        { status: 422 }
      );
    }

    // 페이지 범위 오류 처리
    if (message.includes("페이지 범위") || message.includes("page")) {
      return NextResponse.json(
        { error: `페이지 범위 오류: ${message}` },
        { status: 422 }
      );
    }

    return NextResponse.json(
      { error: `PDF 분할 중 오류가 발생했습니다: ${message}` },
      { status: 500 }
    );
  }
}

// 대용량 PDF 처리를 위한 실행 시간 확장
export const maxDuration = 60;
