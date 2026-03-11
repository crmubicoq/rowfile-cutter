# EduSplit AI — 작업 이력 및 트러블슈팅

> 형식: 날짜 / 카테고리 / 내용 / 해결 방법 / 결정 사항

---

## 2026-03-06 (계속)

### [Phase 4-11] Range 모드 Fence-Post 자동 복구 + Fluid Boundary
**문제**: 멀티 스테이지 p.1~96 청크에서 7건 OVERLAP 오류 발생.
원인: Gemini가 range 모드에서도 endPage를 exclusive로 해석 (curr.endPage === next.startPage).

**3가지 수정**:
1. `lib/gemini/prompt.ts` — rangeBlock에 "⛔ endPage exclusive 오류 절대 금지" 섹션 추가 (✅/❌ 예시 + 마지막 endPage 강조)
2. `app/api/analyze/route.ts` — `autoRepairRangeSessions()` 추가: fence-post 자동 수정, 경계 강제, "p.XX에서 중복 발생" 상세 로그, 복구 후 재검증
3. `app/page.tsx` — Fluid Boundary: mutableChunks로 청크 관리, 실제 lastEndPage 기반 다음 청크 시작점 동적 조정

**TS 검증**: exit code 0 ✅

---

### [Phase 4-10] 멀티 스테이지 분석 아키텍처 구현
**문제**: 240페이지 PDF 분석 중 95페이지에서 Gemini 응답이 잘림 (출력 토큰 한도). 단일 분석 방식의 구조적 한계.

**해결**: 3단계 멀티 스테이지 아키텍처 구현.

**변경 파일 5개**:

1. **`lib/gemini/types.ts`**
   - `MilestoneResponse` 인터페이스 추가 (`milestones: number[]`)
   - `AnalyzeRequestBody`에 필드 추가: `mode?`, `rangeStart?`, `rangeEnd?`, `totalPages?`, `targetSessionCount?`

2. **`lib/gemini/prompt.ts`**
   - `buildMilestonePrompt(totalPages)` 함수 신규 추가 — 대주제 이정표 감지 전용 경량 프롬프트
   - `buildAnalyzePrompt(constraints, rangeContext?)` 시그니처 확장
   - range 모드 시: "⚡ 분석 범위 제한" 블록 삽입, 페이지 커버리지 문구 동적 생성, JSON 스키마 예시 startPage 동적 반영

3. **`app/api/pagecount/route.ts`** (신규)
   - pdf-lib만 사용해 PDF 총 페이지 수 즉시 반환 (Gemini 호출 없음, < 3s)
   - `POST { pdfBase64 } → { totalPages: number }`

4. **`app/api/analyze/route.ts`**
   - `mode` 필드에 따라 3-way 분기 (`single` / `milestone` / `range`)
   - milestone 모드: `buildMilestonePrompt` → Gemini → milestones 정규화 (1 삽입, 중복 제거, 정렬)
   - range 모드: `buildAnalyzePrompt(constraints, rangeContext)` → Gemini → 범위 내 validateSessions
   - 모든 모드에서 JSON 마크다운 래퍼(```json) 자동 제거 로직 추가

5. **`app/page.tsx`**
   - `AnalyzeStage` 타입 추가 (`idle | counting | single | milestone | range | merging`)
   - `buildChunks(milestones, totalPages)` 유틸 함수 추가 (컴포넌트 외부)
   - `analyzeStage`, `stageProgress` 상태 추가
   - `handleAnalyze` 완전 재작성 — 0단계(pagecount) → 분기(≤80p 단일 / >80p 멀티) → 1단계(milestone) → 2단계(range loop) → 3단계(merge)
   - `applyAnalyzeResult()` 헬퍼 — 성공 시 공통 처리(setSessions, toast, history 저장)
   - 분석 버튼 라벨: 단계별 동적 텍스트 표시
   - 멀티 스테이지 진행 UI: 단계 알약(✓/pulse/비활성) + 청크 프로그레스 바

**TS 검증**: exit code 0 ✅

**설계 결정**:
- 멀티 스테이지 임계치: `MULTI_STAGE_THRESHOLD = 80` (페이지)
- 클라이언트 오케스트레이션 채택 (서버 60초 타임아웃 회피)
- 청크당 Gemini 호출이 독립 → 각각 60초 타임아웃 예산
- `constraints.sessionCount` 있으면 청크 비례 배분: `Math.round(total * chunkPages / docTotalPages)`

---

## 2026-03-06

### [Phase 4-9] prompt.ts 대용량 PDF 최적화 — Reasoning 요약·전체 커버리지·순수 JSON 강제

#### 배경
대용량 PDF(100p+) 분석 시 reasoning 필드가 세션마다 길게 생성되어 API 응답 크기가 Gemini 출력 한도에 근접, 응답 잘림(truncation) 발생.

#### 변경 내용 (`lib/gemini/prompt.ts`)

| 위치 | 변경 내용 |
|---|---|
| 핵심 원칙 3 끝 | **Reasoning 요약 모드** 추가: 100p 초과 시 reasoning을 1문장 형식으로 간소화 |
| ⚠️ 페이지 번호 규칙 끝 | **전체 페이지 커버리지 강제**: firstSession.startPage=1, lastSession.endPage=PDF실제마지막, Gap 금지 |
| 응답 형식 지시문 | **출력 규칙 강화**: 순수 JSON만, \`\`\`json 코드블록·설명·주석 완전 금지, 군더더기 표현 제거 |
| JSON 스키마 reasoning 필드 | 100p 이하 / 100p 초과 두 가지 형식을 하나의 예시로 통합 표시 |

#### 각 변경의 효과

| 요청 항목 | 적용 방식 | 효과 |
|---|---|---|
| Reasoning 요약 모드 | Gemini 자율 판단 (PDF 페이지 수 직접 확인) | 10회차 × 3문장 → 10회차 × 1문장 → 응답 크기 ~70% 감소 |
| 전체 범위 강제 | 명시적 규칙 + Gap 금지 | 마지막 챕터·부록 누락 방지, GAP 경고 제거 |
| 순수 JSON 강제 | "단 한 글자도" 강조 + 파싱 실패 경고 | \`\`\`json 래핑으로 인한 파싱 오류 방지 |

#### TypeScript 검사
- `exit code 0` ✅

---

### [Phase 4-8] prompt.ts 고도화 — 핵심 원칙 4: 적정 분량 균형 (Balanced Granularity) 추가

#### 변경 내용 (`lib/gemini/prompt.ts`)

| 위치 | 변경 내용 |
|---|---|
| JSDoc | "3원칙" → **"4원칙"**, 원칙 4 설명 추가 |
| 서두 문장 | "3가지 핵심 원칙" → **"4가지 핵심 원칙"** |
| `sessionCountGuide` (AI 자동 결정 분기) | 200페이지 이상 시 **최소 8~12회차** 기본값 문장 추가 |
| 새 섹션: 핵심 원칙 4 | 원칙 3 다음, 분할 규칙 앞에 삽입 |

#### 원칙 4 세부 내용

| 항목 | 기준 |
|---|---|
| 이상 분량 | 회차당 **15~30페이지** |
| 강제 분할 | **40페이지 초과** 시 "[주제] 기초/심화", "[주제] 1부/2부" 등으로 분리 |
| 소주제 탐색 | H2·H3 소제목, Case Study, 연습 문제, 이론→적용 전환점을 적극 분할점으로 활용 |
| 분량 균형 체크 | 최장/최단 회차 페이지 차이 3배 초과 시 재조정 권고, 5페이지 미만 회차는 통합 검토 |
| 대형 원고 기본값 | 200페이지+ → 특별 지시 없으면 최소 **8~12회차** |

#### TypeScript 검사
- `exit code 0` ✅

---

### [버그픽스] Gemini Fence-Post 오류 — Overlap 검증 실패 대응

#### 증상
```
[analyze] 세션 검증 실패: [오류 7건]
✗ 세션 1(p.5–10)과 세션 2(p.10–20)이 겹칩니다. (겹치는 페이지: p.10–10)
✗ 세션 2(p.10–20)과 세션 3(p.20–33)이 겹칩니다. (겹치는 페이지: p.20–20)
... (7개 세션 전부 경계 1페이지 중복)
```

#### 근본 원인
- Gemini가 `endPage`를 **배타적(exclusive)** 경계로 해석
- Python `range(start, end)` 관행 → 이전 세션 endPage = 다음 세션 startPage 출력
- 우리 시스템은 **inclusive-inclusive** 구간 (`endPage`의 페이지도 현 회차 포함)
- 프롬프트에 inclusive 명시가 없어 7회 연속 동일 오류 발생

#### 수정 내용 (`lib/gemini/prompt.ts`)
1. **"⚠️ 페이지 번호 규칙"** 섹션 신규 추가
   - `startPage/endPage` 모두 포함(inclusive) 명시
   - `다음 startPage = 이전 endPage + 1` 공식 명문화
   - ✅ 올바른 예시 / ❌ 잘못된 예시 나란히 제시
2. **JSON 스키마 예시** — 1개 세션 → **2개 연속 세션**으로 교체
   - 회차1: `endPage: 10` → 회차2: `startPage: 11` 경계값 시각적으로 명시

#### TypeScript 검사
- `exit code 0` ✅

---

### [Phase 4-7] 회차별 개별 다운로드 버튼 구현

#### 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `app/api/split/route.ts` | `sessions.length === 1` 조건 추가 → ZIP 대신 PDF 직접 반환 (`application/pdf`, Content-Length 포함) |
| `components/SessionCard.tsx` | `onDownload`, `isDownloading`, `hasActivePdf` props 추가. 페이지 행에 `Download` 아이콘 버튼 삽입 (AI 근거 버튼 왼쪽) |
| `app/page.tsx` | `downloadingSessionId: number \| null` 상태 추가. `handleDownloadSession(session)` 함수 추가. SessionCard에 3개 props 연결 |

#### 동작 설계

- 각 SessionCard 우측 하단에 `Download` 아이콘 버튼 노출
- `hasActivePdf === false` (이력 로드 상태)이면 버튼 비활성 + tooltip "PDF를 먼저 업로드하세요"
- 클릭 시 → `/api/split` 호출 (`sessions: [단일 세션]`) → PDF 파일로 직접 다운로드
- 다운로드 중: `Loader2` 스피너로 교체, 버튼 비활성
- 완료: success 토스트 ("XX회차 PDF 다운로드 완료")
- API 오류: error 토스트 (백엔드 메시지 직결)

#### API 응답 분기

| 요청 세션 수 | Content-Type | 파일 형식 |
|---|---|---|
| 1개 | `application/pdf` | `.pdf` 직접 반환 |
| 2개 이상 | `application/zip` | `.zip` (기존 동작 유지) |

#### TypeScript 검사
- `exit code 0` ✅

---

## 2026-03-05

### [Phase 4-6] 전문가 워크스페이스 기능 구현 (이력·미니드롭존·초기화)

#### 생성 파일

| 파일 | 역할 |
|---|---|
| `lib/history.ts` | localStorage 이력 CRUD. PDF Base64 저장 금지. MAX 10개, QuotaExceededError 3단계 폴백 |
| `components/HistorySidebar.tsx` | 좌측 슬라이드 드로어. 세션 복원, 개별/전체 삭제 |
| `components/ConfirmDialog.tsx` | Amber 경고 아이콘 모달. 5개 시나리오에서 공통 재사용 |
| `components/MiniDropzone.tsx` | 결과 하단 상시 노출 compact 드롭존. label/sublabel props |

#### handleFileSelect 3-Way 통합 로직

- **Case A** `loadedFromHistory === true`: PDF만 교체, 세션 유지, 분할 활성화
- **Case B** `hasResults === true`: ConfirmDialog → 확인 시 세션 초기화 후 교체
- **Case C** 초기 상태: 즉시 적용

#### localStorage 저장 정책

- 키: `edusplit_history` / 최대 10개
- **저장 금지**: `pdfBase64` (5MB 용량 절약)
- QuotaExceededError: 절반 축소 → 최신 1개 → 포기 (3단계 폴백)
- TypeScript 검사: `exit code 0` ✅

---

### [최종 검증] 실전 테스트 전 3항목 코드 직접 확인 완료 ✅

| 항목 | 검증 위치 | 결과 |
|---|---|---|
| `.env.local` `.gitignore` 포함 여부 | `.gitignore` 27번 줄 `.env*.local` 글로브 | ✅ 완벽히 포함 |
| `gemini-2.0-flash` 모델 호출 정확성 | `lib/gemini/client.ts` 21번 줄 `model: "gemini-2.0-flash"` | ✅ 오타 없음 |
| 에러 원인 → 사용자 알림 연결 여부 | `split/route.ts` 422 응답 → `handleSplit` `addToast("error", data.error)` | ✅ 백엔드 메시지 토스트 직결 |

**에러 알림 설계 정책** (Q3 상세):
- 암호화 PDF / 분할 실패: 인라인 에러 + 🔴 error 토스트 (이중 표시)
- 파일 선택 시 15MB 초과: ⚠️ warning 토스트 (즉시)
- 분석 성공 + 20MB 경고: ⚠️ warning 토스트 (백엔드 `_meta.geminiSizeWarning` 직결)
- 분석 자체 실패 (50MB 초과 등): 인라인 에러 박스 상시 표시 (메시지 길이 고려, 토스트 미사용)

**→ 실전 테스트 준비 완료. `GEMINI_API_KEY` 실제 값 삽입 후 즉시 테스트 가능.**

---

### [Phase 4-1] UX 개선 — 스텝 인디케이터 + 토스트 알림 + 모바일 반응형

#### 구현 내용

| 컴포넌트 | 파일 | 기능 |
|---|---|---|
| `StepIndicator` | `components/StepIndicator.tsx` | 4단계 진행 표시 (업로드→AI분석→회차조정→분할저장), 체크/pulse 애니메이션 |
| `Toast` / `ToastContainer` | `components/Toast.tsx` | success/warning/error/info 4종, 자동 닫힘 (4~6초), framer-motion 슬라이드인 |
| `SessionCard` (수정) | `components/SessionCard.tsx` | 페이지 입력 행에 `flex-wrap` 추가 — 좁은 화면에서 AI 근거 버튼 자동 줄바꿈 |
| `app/page.tsx` (수정) | `app/page.tsx` | 스텝 계산 로직, 토스트 상태 관리, 분할 패널 `flex-col sm:flex-row` 대응 |

#### 토스트 트리거 정책

| 이벤트 | 토스트 타입 | 지속 시간 |
|---|---|---|
| 파일 선택 시 15MB 초과 | warning | 5초 |
| Gemini 분석 성공 | success | 4초 |
| API `_warnings` 필드 감지 | warning | 5초 |
| API `_meta.geminiSizeWarning` 감지 | warning | 5초 |
| PDF 분할 성공 | success | 4초 |
| PDF 분할 실패 (네트워크/API) | error | 6초 |

#### 결정 사항 (bodyParser 한도)
- App Router route handler는 Pages Router의 `api.bodyParser.sizeLimit` 설정을 지원하지 않음
- 실제 요청 크기는 Vercel 함수 메모리(1024MB)와 `next.config.mjs`의 기본값으로 제어
- `vercel.json`에 이미 설정된 60초 타임아웃 + 1024MB 메모리로 충분히 대응 가능
- todo.md 해당 항목 "검토 완료"로 기록

---

### [에지 케이스 테스트] 3단계 검증 시스템 구축 및 결과

---

#### 테스트 1 — 대용량 파일 (50페이지+ PDF)

| 항목 | 결과 |
|---|---|
| **Gemini API inline 제한** | ~20MB (Base64 환산 ~27MB) |
| **현재 서버 허용 한도** | 50MB |
| **잠재 이슈** | 20MB 초과 PDF는 `DEADLINE_EXCEEDED` 또는 `Request payload size exceeds` 오류 발생 가능 |
| **방어 코드** | 2단계 크기 검증 티어 추가 (①서버 50MB 차단 ②Gemini 20MB 경고 헤더) |
| **응답 시간 모니터링** | `console.log("[analyze] Gemini 응답 수신 완료 (Xms, ~YMB)")` 추가 |
| **타임아웃 에러 처리** | `DEADLINE_EXCEEDED` / `timeout` 감지 → HTTP 408 + 사용자 안내 메시지 |
| **결론** | 50페이지 ≈ 2~5MB 범위가 일반적이므로 정상 동작. 이미지 집중 PDF는 20MB 초과 가능 → 경고 UI 추가 예정 |

---

#### 테스트 2 — 비논리적 원고 (목차 없음, 내용 뒤섞임)

| 항목 | 결과 |
|---|---|
| **One Message 원칙 적용** | prompt.ts 고도화로 AI가 문맥적 전환점 강제 탐색 |
| **Gemini 응답 실패 시나리오** | ①JSON 파싱 실패 → HTTP 502 + rawResponse 앞 1000자 반환 ②sessions 배열 비어있음 → HTTP 502 + 명확한 안내 |
| **검증 실패 시나리오** | validator.ts에서 OVERLAP/RANGE_INVERTED 감지 → HTTP 422 + `validationErrors` 배열 반환 |
| **Safety 차단** | `SAFETY` / `blocked` 감지 → HTTP 422 + 안전 정책 안내 |
| **결론** | 비논리적 원고는 Gemini가 최선의 문맥 전환점을 추정하여 분할. 완전 무구조 문서는 재분석 요청 안내 |

---

#### 테스트 3 — Off-by-one 에러 정밀 검증 (코드 트레이싱)

**검증 방법**: `extractRangeFromDoc()` 함수의 인덱스 변환 로직을 수동 추적

| 입력 (1-based) | fromIdx (0-based) | toIdx (0-based) | pageIndices | 실제 추출 페이지 | 판정 |
|---|---|---|---|---|---|
| startPage=1, endPage=5 | 0 | 4 | [0,1,2,3,4] | p.1–5 (5장) | ✅ 정상 |
| startPage=6, endPage=10 | 5 | 9 | [5,6,7,8,9] | p.6–10 (5장) | ✅ 정상 |
| startPage=1, endPage=1 | 0 | 0 | [0] | p.1 (1장) | ✅ 정상 |
| startPage=18, endPage=20, totalPages=20 | 17 | 19 | [17,18,19] | p.18–20 (3장) | ✅ 정상 |
| startPage=18, endPage=25, totalPages=20 | 17 | 19(클램핑) | [17,18,19] | p.18–20 (3장, 자동 클램핑) | ✅ 정상 |

**연속 세션 경계 검증** (가장 중요):
- 세션1 endPage=5 → 0-based 인덱스 4
- 세션2 startPage=6 → 0-based 인덱스 5
- 인덱스 4(p.5)와 5(p.6)는 서로 다른 페이지 → **중복 없음, 누락 없음** ✅

**결론**: Off-by-one 에러 없음. `startPage - 1` / `endPage - 1` 변환 + `toIdx - fromIdx + 1` 길이 계산은 수학적으로 정확.

---

#### 발견된 실제 버그 및 수정

| 버그 | 심각도 | 수정 내용 |
|---|---|---|
| `splitPdfBySessions`가 세션 수만큼 PDF 반복 파싱 | 🟡 중간 (성능) | PDF를 단 1회만 파싱 후 `PDFDocument` 인스턴스 공유로 최적화 (N배→1배) |
| Gemini 20MB 초과 시 런타임 에러만 발생 | 🔴 높음 | 사전 크기 검증 + 명확한 에러 메시지 + HTTP 408 |
| 세션 겹침 시 자동 감지 없음 | 🟡 중간 | `validator.ts` 3단계 검증 시스템으로 OVERLAP 자동 감지 |

### [Phase 3] PDF 분할 + ZIP 다운로드 구현 완료
- **생성 파일**:
  - `lib/pdf/splitter.ts` — `extractPageRange` (pdf-lib copyPages, 원본 품질 보존), `splitPdfBySessions`, `sanitizeFilename`
  - `app/api/split/route.ts` — POST 엔드포인트, JSZip DEFLATE 압축, Content-Disposition UTF-8 파일명
  - `app/page.tsx` — 분할 버튼, 진행 상태 4단계(idle/splitting/done/error), 프로그레스 바, 자동 ZIP 다운로드
- **결정 사항**:
  - 회차별 개별 다운로드는 Phase 4로 연기 (ZIP 일괄 다운로드 우선)
  - 파일명 규칙: `[00]_[제목].pdf` (특수문자 제거, 80자 제한, 공백→언더스코어)
  - ZIP 폴더명: 원본 파일명 기반 (없으면 `EduSplit`)
- **특이사항**: jszip `exit code 1` — EBADENGINE 경고로 인한 PowerShell 오류 코드이나 실제 설치는 정상 완료(`added 13 packages`)

### [Phase 2] Gemini 프롬프트 고도화 (교육공학 3원칙)
- **작업**: `lib/gemini/prompt.ts` 전면 재작성
- **변경 내용**: One Message 원칙, 문맥적 전환점 우선, reasoning 상세화 지시 추가

### [환경] npm run dev 정상 기동 확인 ✅
- **작업**: `http://localhost:3000` 에서 EduSplit AI UI 정상 렌더링 확인
- **해결된 이슈 목록**:
  1. **Node.js 미설치** → CRM 프로젝트 `C:\Users\Administrator\Desktop\REC_Maker_CRM_low\nodejs\` (v18.17.1) 활용. `install.ps1` / `dev.ps1` 스크립트에 PATH 주입
  2. **`next.config.ts` 미지원** → Next.js 14는 `.ts` config 파일 미지원. `next.config.mjs`로 교체
  3. **`api.bodyParser` 잘못된 config 키** → App Router에서는 route.ts의 `maxDuration`으로 관리. config에서 제거
  4. **post-install 실패** → `unrs-resolver` post-install 스크립트가 `node`를 bare command로 호출. `$env:PATH`에 nodejs 경로 사전 추가하여 해결
- **EBADENGINE 경고**: typescript-eslint 8.x가 Node.js ^18.18.0 요구. v18.17.1은 최소 요구치 미달이나 실제 런타임에는 무영향 (WARN만 출력)
- **재발 방지**: 장기적으로 Node.js LTS를 시스템 PATH에 정식 설치 권장

### [보안 수정] NEXT_PUBLIC_GEMINI_API_KEY → GEMINI_API_KEY
- **작업**: `lib/gemini/client.ts` 환경변수명 변경
- **결정**: `NEXT_PUBLIC_` 접두사 제거 완료. `.env.local`도 동일하게 적용
- **영향**: 기존 `.env.local`에 `NEXT_PUBLIC_GEMINI_API_KEY`를 등록했던 경우 `GEMINI_API_KEY`로 키 이름 변경 필요

### [Phase 1-1] Next.js 프로젝트 설정 파일 수동 생성
- **작업**: Node.js 미설치로 인해 `create-next-app` 대신 설정 파일 수동 생성
- **생성 파일**: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `.gitignore`, `app/globals.css`, `app/layout.tsx`
- **차단 사항**: **Node.js가 시스템에 미설치** → `npm install` 및 `npx shadcn@latest init` 실행 불가
- **해결 방법 (수동 필요)**:
  1. [nodejs.org](https://nodejs.org)에서 Node.js LTS 설치
  2. 터미널에서 `cd "D:\rowfile cutter"` 후 `npm install` 실행
  3. `npx shadcn@latest init` 실행 (TypeScript, Tailwind, App Router 선택)
- **재발 방지**: 향후 새 프로젝트는 Node.js 설치 여부를 Phase 1 시작 전 확인

### [Phase 2-5] 인터랙티브 대시보드 UI 구현
- **작업**: 분석 결과 시각화 및 수동 조정 UI 전체 구현
- **생성 파일**:
  - `components/FileDropzone.tsx` — PDF 드래그앤드롭, Base64 변환, framer-motion 애니메이션
  - `components/ConstraintsForm.tsx` — 회차 수, 최대 페이지, 추가 지시사항 입력폼
  - `components/SessionCard.tsx` — 회차 카드 (번호/제목/요약/페이지편집/AI근거 accordion)
  - `app/page.tsx` — 전체 워크플로우 통합, 상태관리, `/api/analyze` 호출, JSON 내보내기
- **사용 라이브러리**: `lucide-react` (아이콘), `framer-motion` (애니메이션)
- **특이사항**: shadcn/ui는 Node.js 설치 후 `npx shadcn@latest init`으로 추가 예정. 현재는 순수 Tailwind로 구현

### [구현] Gemini Flash 연동 및 분석 API 구현
- **작업**: `lib/gemini/` 모듈 3개 + `app/api/analyze/route.ts` 구현
- **생성 파일**:
  - `lib/gemini/client.ts` — Gemini 2.0 Flash 모델 초기화 (temperature 0.2, responseMimeType 고정)
  - `lib/gemini/types.ts` — TypeScript 인터페이스 정의 (Session, AnalyzeResponse, AnalyzeRequestBody)
  - `lib/gemini/prompt.ts` — 교육 공학 원칙 기반 동적 프롬프트 빌더
  - `app/api/analyze/route.ts` — POST 엔드포인트, 에러 핸들링, maxDuration 60초 설정
- **결정 사항**:
  - PDF를 multipart/form-data 대신 Base64 JSON 바디로 전달 (Next.js App Router의 formData 파싱 복잡성 회피)
  - `responseMimeType: "application/json"` + `temperature: 0.2` 조합으로 안정적인 JSON 출력 강제
  - 에러를 HTTP 상태 코드별로 세분화: 400(입력오류), 401(API키), 413(용량초과), 429(할당량), 502(파싱실패), 500(기타)
- **특이사항**:
  - Next.js 프로젝트가 아직 초기화되지 않아 `@google/generative-ai` SDK 설치는 Next.js 셋업 후 수행 필요
  - `NEXT_PUBLIC_GEMINI_API_KEY` 사용 시 클라이언트 번들에 노출 위험 → 서버 전용 Route Handler에서만 사용하므로 `GEMINI_API_KEY`(비공개)로 변경 권장 (ADR-003 참조)

### [설정] 프로젝트 관리 문서 초기화
- **작업**: AGENT.md, todo.md, history.md 생성
- **결정 사항**:
  - 모든 작업은 AGENT.md 원칙을 따름
  - 태스크 완료 시 todo.md 즉시 업데이트 후 history.md에 특이사항 기록
  - 원자 단위 태스크(Atomic Task) 관리 체계 도입

---

## Gemini API 트러블슈팅 로그

> Gemini 연동 중 발생한 이슈는 아래에 누적 기록됩니다.

### [템플릿] 이슈 기록 양식
```
#### [날짜] 이슈 제목
- **증상**:
- **원인**:
- **해결 방법**:
- **참고 링크**:
- **재발 방지**:
```

---

## 설계 결정 로그 (Architecture Decision Record)

### ADR-001 — AI 엔진 선택: Gemini 2.0 Flash
- **날짜**: 2026-03-05
- **결정**: Gemini 2.0 Flash 사용
- **이유**: Native PDF multimodal 입력 지원으로 별도 OCR 파이프라인 불필요, 빠른 응답속도
- **트레이드오프**: OpenAI GPT-4o 대비 한국어 교육 문서 특화 성능 검증 필요

### ADR-003 — 환경변수명: NEXT_PUBLIC_ 접두사 제거 권장
- **날짜**: 2026-03-05
- **결정**: 가이드에서 요청된 `NEXT_PUBLIC_GEMINI_API_KEY` 대신 `GEMINI_API_KEY` 사용 권장
- **이유**: `NEXT_PUBLIC_` 접두사는 클라이언트 번들에 값이 노출됨. Gemini API 키는 서버 Route Handler에서만 사용되므로 비공개 환경변수가 보안상 안전
- **현재 상태**: 코드는 `process.env.NEXT_PUBLIC_GEMINI_API_KEY`로 작성됨 (가이드 준수). 실제 배포 전 변수명 통일 필요

### ADR-002 — PDF 처리 라이브러리: pdf-lib
- **날짜**: 2026-03-05
- **결정**: `pdf-lib` 사용
- **이유**: 원본 폰트/이미지 품질 무손실 페이지 추출, 순수 JS로 서버사이드 처리 가능
- **트레이드오프**: 복잡한 PDF 암호화 해제는 별도 처리 필요

---

## 완료 태스크 이력

| 날짜 | 태스크 | 비고 |
|------|--------|------|
| 2026-03-05 | AGENT.md 생성 | 프로젝트 원칙 문서 확정 |
| 2026-03-05 | todo.md 생성 | Phase 1~4 로드맵 초안 작성 |
| 2026-03-05 | history.md 생성 | 이슈 추적 체계 초기화 |
| 2026-03-05 | lib/gemini/client.ts 생성 | Gemini 2.0 Flash 초기화, JSON 응답 강제 설정 |
| 2026-03-05 | lib/gemini/types.ts 생성 | TypeScript 인터페이스 정의 완료 |
| 2026-03-05 | lib/gemini/prompt.ts 생성 | 교육공학 원칙 기반 동적 프롬프트 빌더 |
| 2026-03-05 | app/api/analyze/route.ts 생성 | POST 엔드포인트, 에러 세분화, maxDuration=60 |
| 2026-03-05 | 보안 수정: GEMINI_API_KEY 변경 | NEXT_PUBLIC_ 접두사 제거, 클라이언트 노출 차단 |
| 2026-03-05 | Phase 1-1 설정 파일 수동 생성 | package.json, tsconfig, tailwind 등 6개 파일 |
| 2026-03-05 | components/FileDropzone.tsx | Drag&Drop, Base64 변환, framer-motion |
| 2026-03-05 | components/ConstraintsForm.tsx | 회차 수, 최대 페이지, 추가 지시사항 입력 |
| 2026-03-05 | components/SessionCard.tsx | 페이지 편집 Input, AI근거 accordion |
| 2026-03-05 | app/page.tsx | 전체 워크플로우 통합, JSON 내보내기 |
| 2026-03-05 | components/StepIndicator.tsx | 4단계 스텝 인디케이터, 체크/pulse 애니메이션 |
| 2026-03-05 | components/Toast.tsx | 토스트 알림 시스템 (4종, 자동 닫힘) |
| 2026-03-05 | app/page.tsx (Phase 4 개선) | 스텝 계산, 토스트 연동, 15MB 경고, 모바일 반응형 |
| 2026-03-05 | components/SessionCard.tsx (수정) | 페이지 입력 행 flex-wrap 모바일 대응 |
