/** 분할된 단일 회차(세션)의 데이터 구조 */
export interface Session {
  sessionNumber: number;
  title: string;
  summary: string;
  startPage: number;
  endPage: number;
  reasoning: string;
}

/** Gemini 응답 최상위 구조 */
export interface AnalyzeResponse {
  sessions: Session[];
}

/** 멀티 스테이지 1단계: 대주제 이정표 감지 응답 */
export interface MilestoneResponse {
  /**
   * 각 청크의 시작 페이지 번호 목록 (오름차순).
   * 예: [1, 85, 160] → 청크 (1~84), (85~159), (160~totalPages)
   * 마지막 페이지(totalPages) 자체는 배열에 포함하지 않음.
   */
  milestones: number[];
}

/** 클라이언트에서 /api/analyze로 전송하는 요청 바디 */
export interface AnalyzeRequestBody {
  /** Base64로 인코딩된 PDF 파일 데이터 */
  pdfBase64: string;
  /** PDF의 MIME 타입 (항상 "application/pdf") */
  mimeType: "application/pdf";
  /**
   * 분석 모드 (기본값: "single")
   * - "single"    : 전체 PDF를 하나의 Gemini 호출로 분석 (80p 이하 권장)
   * - "milestone" : 대주제 이정표 감지 — 멀티 스테이지 1단계
   * - "range"     : 지정 페이지 범위만 분석 — 멀티 스테이지 2단계
   */
  mode?: "single" | "milestone" | "range";
  /** range 모드: 분석할 시작 페이지 (1-based, inclusive) */
  rangeStart?: number;
  /** range 모드: 분석할 끝 페이지 (1-based, inclusive) */
  rangeEnd?: number;
  /** milestone 모드: pdf-lib으로 사전 확인된 PDF 전체 페이지 수 */
  totalPages?: number;
  /** range 모드: 이 범위에서 생성할 목표 회차 수 (constraints.sessionCount 비례 배분) */
  targetSessionCount?: number;
  /** 사용자가 지정한 제약 조건 */
  constraints: {
    /** 원하는 총 회차 수 (미지정 시 Gemini가 자동 결정) */
    sessionCount?: number;
    /** 회차당 최대 페이지 수 */
    maxPagesPerSession?: number;
    /**
     * 회차당 강의 시간 (분 단위, 선택).
     * 값이 존재할 때만 프롬프트에 포함됩니다.
     * 예: 50 → "각 회차는 약 50분 강의에 해당하는 분량이어야 합니다"
     */
    lectureTime?: number;
    /** 추가 자유 형식 지시사항 */
    additionalInstructions?: string;
  };
  /**
   * 사용자 직접 지정 모드의 분할 지시사항.
   * 존재할 경우 AI의 교육공학 원칙보다 이 지시사항이 최우선됩니다.
   * 예: "목차의 1, 2, 3, 4 차례로 나눠줘"
   */
  userInstruction?: string;
}
