# EduSplit AI — 전체 로드맵

> 규칙: 태스크 완료 시 `[ ]` → `[x]` 변경 후 history.md에 특이사항 기록.

---

## Phase 1: 프로젝트 초기 세팅

### 1-1. 환경 구성
- [x] Next.js 14 설정 파일 수동 생성 (`package.json`, `tsconfig.json`, `next.config.mjs`)
- [x] Tailwind CSS 설정 (`tailwind.config.ts`, `postcss.config.mjs`, `app/globals.css`)
- [x] `npm install` 실행 완료 (Node.js v18.17.1 — CRM 프로젝트 경로 활용, `dev.ps1` 생성)
- [ ] shadcn/ui 초기화: `npx shadcn@latest init` (선택사항, 현재 순수 Tailwind로 동작 중)
- [x] `.env.local` 파일 생성 및 `GEMINI_API_KEY` 변수 정의 (보안 수정 완료)
- [x] `/lib/gemini`, `/lib/pdf` 폴더 생성
- [x] `/api/analyze`, `/api/split` 라우트 파일 스캐폴딩

### 1-2. 문서 및 관리 체계
- [x] AGENT.md 생성 (프로젝트 원칙 문서)
- [x] todo.md 생성 (로드맵 관리)
- [x] history.md 생성 (이슈 및 이력 관리)

---

## Phase 2: 핵심 기능 — 원고 분석 (Analyze)

### 2-1. 파일 업로드 UI
- [x] 파일 드래그앤드롭 컴포넌트 구현 (`components/FileDropzone.tsx`)
- [x] 지원 포맷 제한 처리 (PDF only, 50MB 제한)
- [x] 업로드 파일 미리보기 (파일명, 크기, 성공 상태 표시)

### 2-2. 제약 조건 입력 UI
- [x] 회차 수 입력 필드 구현 (`components/ConstraintsForm.tsx`)
- [x] 회차당 최대 페이지 수 입력 필드 구현
- [x] 추가 자유 형식 지시사항 입력 textarea 구현

### 2-3. Gemini API 연동 (`/lib/gemini`)
- [ ] `@google/generative-ai` SDK 설치 (Node.js + `npm install` 후 자동 처리)
- [x] Gemini 2.0 Flash 모델 초기화 함수 작성 (`lib/gemini/client.ts`)
- [x] PDF를 `inlineData`(Base64) 형태로 전달하는 구조 구현
- [x] 시맨틱 분석 프롬프트 설계 (`lib/gemini/prompt.ts`, 교육공학 원칙 기반)
- [x] 응답을 `JSON` 파싱하는 함수 작성 (route.ts 내 인라인 처리)
- [x] API 응답 스키마 정의 (`lib/gemini/types.ts` — Session, AnalyzeResponse interface)

### 2-4. 분석 API Route (`/api/analyze`)
- [x] `POST /api/analyze` 엔드포인트 구현 (`app/api/analyze/route.ts`)
- [x] Base64 인코딩 PDF + constraints JSON 바디 파싱
- [x] Gemini 호출 → JSON 응답 반환 로직 연결
- [x] 에러 핸들링 (50MB 초과, API 키 오류, 할당량 초과, JSON 파싱 실패)

### 2-5. 분석 결과 표시 UI
- [x] 회차별 분할 결과 카드 컴포넌트 구현 (`components/SessionCard.tsx`)
- [x] 회차 번호, 제목, 요약, 페이지 범위, AI 추천 근거 표시
- [x] 사용자 수동 조정 기능 (startPage/endPage Input 직접 수정 가능)
- [x] AI 추천 근거 접힘/펼침(accordion) 처리
- [x] 분석 결과 JSON 내보내기 버튼
- [x] 메인 페이지 `app/page.tsx` — 전체 워크플로우 통합 (업로드→제약설정→분석→결과)

---

## Phase 3: 핵심 기능 — PDF 분할 (Split)

### 3-1. PDF 분할 유틸리티 (`/lib/pdf`)
- [x] `pdf-lib` + `jszip` 패키지 설치
- [x] 원본 PDF에서 페이지 범위를 추출하는 함수 작성 (`lib/pdf/splitter.ts` → `extractPageRange`)
- [x] 추출된 페이지로 새 PDF를 생성 (`pdf-lib copyPages` — 원본 품질 100% 보존)
- [x] 파일명 규칙 정의 (`[세션번호]_[제목].pdf`, 특수문자 제거 및 80자 제한)

### 3-2. 분할 API Route (`/api/split`)
- [x] `POST /api/split` 엔드포인트 구현 (`app/api/split/route.ts`)
- [x] pdfBase64 + sessions JSON + originalFilename 입력 처리
- [x] `pdf-lib`으로 회차별 PDF 생성 + 페이지 유효성 검증
- [x] JSZip으로 ZIP 압축 (DEFLATE level 6) 후 다운로드 응답 반환
- [x] 에러 핸들링 (암호화 PDF, 잘못된 페이지 범위, 50MB 초과)

### 3-3. 다운로드 UI
- [x] '분할 및 다운로드' 버튼 구현 (violet→pink 그라디언트)
- [x] 분할 진행 중: 애니메이션 프로그레스 바 + 세션별 파일명 미리보기
- [x] 분할 완료: 체크 아이콘 + 파일명 표시 + 자동 ZIP 다운로드 트리거
- [x] 분할 에러: 인라인 에러 메시지 표시
- [x] 회차별 개별 다운로드 버튼 (SessionCard Download 아이콘, 1개 세션 → PDF 직반환)

### 3-4. Gemini 프롬프트 고도화
- [x] 교육 공학적 원칙 3가지 강화 (`lib/gemini/prompt.ts`)
  - One Message 원칙 (단일 핵심 메시지 완결)
  - 문맥적 전환점 우선 기준
  - reasoning 상세 설명 (논리적 근거 명시)

---

## Phase 4: 품질 개선 및 배포

### 4-1. UX 개선
- [x] 전체 워크플로우 스텝 인디케이터 구현 (`components/StepIndicator.tsx` — 4단계, 체크/pulse 애니메이션)
- [x] 모바일 반응형 레이아웃 점검 (`SessionCard` flex-wrap, 분할 패널 flex-col→sm:flex-row 대응)
- [x] 에러 상태 토스트 알림 구현 (`components/Toast.tsx` — success/warning/error/info, 자동 닫힘)

### 4-6. 전문가 워크스페이스 기능
- [x] **이력 관리** — `lib/history.ts` localStorage 유틸리티 (PDF Base64 제외, sessions+메타만 저장, MAX 10개, QuotaExceeded 3단계 폴백)
- [x] **이력 사이드바** — `components/HistorySidebar.tsx` 좌측 슬라이드 드로어 (목록 클릭 → 세션 복원, 개별/전체 삭제)
- [x] **확인 다이얼로그** — `components/ConfirmDialog.tsx` 데이터 유실 전 사용자 동의 획득
- [x] **상시 미니 드롭존** — `components/MiniDropzone.tsx` (결과 화면 하단 상시 노출, label/sublabel 커스텀)
- [x] **전체 초기화** — 헤더 `RotateCcw` 버튼 → 모든 State 초기화, 이력은 사이드바에 유지
- [x] **이력 로드 흐름** — 이력 클릭 → 세션 복원 → 분할 비활성 + MiniDropzone에서 재업로드 → 분할 활성화

### 4-2. 성능 최적화
- [x] PDF 반복 파싱 버그 수정 (`splitPdfBySessions` N번→1번 파싱으로 최적화)
- [x] Gemini 20MB 초과 2단계 크기 검증 티어 추가
- [x] **멀티 스테이지 분석** — 80p 초과 PDF: pagecount → milestone → range chunks → merge (출력 토큰 한도 우회)
  - `app/api/pagecount/route.ts` 신규 (pdf-lib, Gemini 미사용)
  - `app/api/analyze/route.ts` mode 3-way 분기 (single / milestone / range)
  - `app/page.tsx` 오케스트레이션 + 단계별 프로그레스 UI (알약 + 청크 바)
- [ ] Gemini API 응답 캐싱 전략 검토

### 4-3. 에지 케이스 방어
- [x] `lib/pdf/validator.ts` — 3단계 검증 시스템 (개별/교차/경고)
- [x] Off-by-one 에러 수동 트레이싱 검증 완료 (5개 케이스 ✅)
- [x] Gemini 타임아웃/Safety/비구조 원고 에러 핸들러 추가
- [x] 세션 겹침(Overlap) 자동 감지 및 HTTP 422 반환

### 4-4. 테스트
- [ ] 분석 API 유닛 테스트 작성
- [ ] PDF 분할 유틸리티 유닛 테스트 작성
- [ ] E2E 시나리오 테스트 (샘플 PDF 업로드 → 분할 → 다운로드)

### 4-5. 배포
- [x] `vercel.json` 생성 (함수 60초 타임아웃, 1024MB 메모리, CORS 헤더)
- [x] `GEMINI_API_KEY` Vercel Secret 참조 설정 (`@gemini_api_key`)
- [ ] Vercel 배포 실행 (`vercel --prod`)
- [x] 파일 업로드 크기 제한 검토 완료 (App Router route handler는 Pages Router `api.bodyParser` 미지원 — Vercel 함수 메모리/timeout으로 대응, `vercel.json` 설정으로 충분)
- [ ] 배포 후 smoke test 수행
