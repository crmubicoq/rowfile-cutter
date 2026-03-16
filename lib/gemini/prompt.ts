import { AnalyzeRequestBody } from "./types";

/**
 * 사용자 직접 지정 모드 전용 프롬프트.
 * 교육공학 원칙 없이 사용자 지시사항만 최우선으로 따름.
 */
export function buildDirectUserPrompt(
  userInstruction: string,
  rangeContext?: { startPage: number; endPage: number; targetSessionCount?: number }
): string {
  const rangeBlock = rangeContext
    ? `\n## 분석 범위\np.${rangeContext.startPage} ~ p.${rangeContext.endPage} 범위만 분석합니다.\n- 첫 번째 세션 startPage = ${rangeContext.startPage} (엄수)\n- 마지막 세션 endPage = ${rangeContext.endPage} (엄수)\n- 이 범위 밖의 페이지는 포함하지 마세요.\n`
    : "";

  const coverageStart = rangeContext ? rangeContext.startPage : 1;
  const coverageEndDesc = rangeContext
    ? `**${rangeContext.endPage}** (범위 끝 페이지)`
    : "**PDF의 실제 마지막 페이지 번호**";

  const ex1End = coverageStart + 9;
  const ex2Start = coverageStart + 10;
  const ex2End = coverageStart + 19;

  return `🚨🚨🚨 [절대 규칙 — 페이지 번호 세는 방법] 🚨🚨🚨
PDF 뷰어에서 이 파일을 열었을 때 맨 처음 보이는 페이지가 1번입니다.
그 다음 페이지 = 2번, 그 다음 = 3번 ... 이렇게 **물리적 순서**로만 번호를 매기세요.
문서 안에 인쇄된 숫자(아라비아 숫자, 로마자 등)는 **완전히 무시**하세요.

예시: 표지(→1번), 목차(→2번), 빈 페이지(→3번), 본문첫장(→4번)
이때 본문 첫 장에 "1"이 인쇄되어 있어도 startPage = **4** (인쇄 숫자 "1" ❌)

이 규칙을 어기면 분할 위치가 완전히 틀립니다. 반드시 물리적 순서 번호를 사용하세요.
🚨🚨🚨 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 🚨🚨🚨

당신은 PDF 문서 분할 전문가입니다.
첨부된 PDF를 사용자의 지시사항에 따라 정확하게 분할하세요.
${rangeBlock}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## ⭐ 사용자 지시사항 (반드시 따르세요)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"${userInstruction}"

이 지시사항을 **그대로** 이행하세요.
- 사용자가 "목차의 1,2,3,4로 나눠줘"라고 하면 → PDF의 목차를 찾아 해당 번호의 챕터 경계로 분할
- 사용자가 "50페이지씩 나눠줘"라고 하면 → 50페이지 단위로 균등 분할
- 사용자가 "챕터별로"라고 하면 → 목차/챕터 제목을 기준으로 분할
- 사용자가 특정 페이지를 명시하면 → 그 페이지를 분할 기준으로 사용
- 교육공학 원칙보다 사용자 지시사항이 **항상 우선**합니다.
- ⚠️ 챕터 시작 페이지를 찾을 때: 목차에 인쇄된 번호가 아닌, 실제로 해당 챕터가 시작되는 물리적 순서 번호를 사용하세요.

## 규칙
- startPage와 endPage는 모두 포함(inclusive) 경계입니다.
- 다음 세션의 startPage = 이전 세션의 endPage + 1
- 첫 번째 세션의 startPage = **${coverageStart}**
- 마지막 세션의 endPage = ${coverageEndDesc}
- 어떤 페이지도 누락되거나 중복되면 안 됩니다.

## 응답 형식 (순수 JSON만 출력, 마크다운 블록 금지)
{
  "sessions": [
    {
      "sessionNumber": 1,
      "title": "세션 제목",
      "summary": "이 세션의 내용 요약 1~2문장.",
      "startPage": ${coverageStart},
      "endPage": ${ex1End},
      "reasoning": "사용자 지시에 따라 이 범위를 선택한 이유."
    },
    {
      "sessionNumber": 2,
      "title": "두 번째 세션 제목",
      "summary": "요약.",
      "startPage": ${ex2Start},
      "endPage": ${ex2End},
      "reasoning": "이유."
    }
  ]
}`.trim();
}

// ── 범위 컨텍스트 타입 ──────────────────────────────────────────────
interface RangeContext {
  startPage: number;
  endPage: number;
  targetSessionCount?: number;
}

/**
 * 멀티 스테이지 1단계: 대주제 이정표(Milestone) 감지 프롬프트.
 *
 * 전체 PDF를 빠르게 훑어 "대주제가 바뀌는 페이지 번호" 목록만 추출.
 * 응답: {"milestones":[1,85,160]}
 */
export function buildMilestonePrompt(totalPages: number, userInstruction?: string): string {
  const userHint = userInstruction
    ? `\n## 사용자 분할 의도 (참고)\n사용자가 "${userInstruction}"라고 요청했습니다. 이 의도에 맞는 구조적 경계(챕터, 주제 전환점 등)를 이정표로 선택하세요.\n`
    : "";

  return `🚨 [절대 규칙] 페이지 번호는 물리적 순서(첫 페이지=1)로 세세요. 문서에 인쇄된 숫자는 무시하세요.

당신은 교육 원고 구조 분석 전문가입니다.
첨부된 PDF(총 ${totalPages}페이지)를 빠르게 훑어 **대주제(Chapter/Part 수준)가 바뀌는 페이지 번호** 목록을 추출하세요.
${userHint}
## 규칙
- 이정표(Milestone)란 완전히 새로운 대주제가 시작되는 페이지입니다. (소주제 전환은 포함하지 않음)
- milestones[0]은 반드시 **1**이어야 합니다.
- 이정표 간격은 **60~120페이지**가 이상적입니다. 지나치게 잘게 나누지 마세요.
- milestones 배열은 오름차순으로 정렬합니다.
- 마지막 페이지(${totalPages})는 배열에 포함하지 마세요.

## 출력 규칙
순수 JSON 객체 하나만 출력합니다. 마크다운 블록, 설명, 기타 텍스트는 금지입니다.

{"milestones":[1,85,160]}`.trim();
}

/**
 * 교육 공학적 4원칙 기반 세션 분할 프롬프트를 생성합니다.
 *
 * 고도화 원칙:
 * 1. One Message 원칙 — 각 세션은 단 하나의 핵심 메시지로 완결
 * 2. 문맥적 전환점 우선 — 페이지 수보다 논리 흐름의 단절점을 기준으로 분할
 * 3. Reasoning 상세화 — 왜 그 지점에서 끊었는지 논리적 근거 명시
 * 4. 적정 분량 균형 — 회차당 15~30p 목표, 40p 초과 시 소주제 강제 분할, 200p+ 최소 8회차
 */
export function buildAnalyzePrompt(
  constraints: AnalyzeRequestBody["constraints"],
  rangeContext?: RangeContext,
  userInstruction?: string
): string {
  // ── 제약 조건 블록 생성 ─────────────────────────────────
  const sessionCountGuide = constraints.sessionCount
    ? `반드시 정확히 **${constraints.sessionCount}개**의 회차로 나누어야 합니다. 억지로 맞추느라 주제 완결성이 훼손되면 안 되므로, 문맥적 전환점을 최대한 활용하세요.`
    : `회차 수는 AI가 문서의 논리 구조를 분석하여 최적값을 결정합니다. 억지로 균등 분할하지 마세요. **단, 원고가 200페이지 이상이라면 특별한 지시가 없는 한 최소 8~12회차 이상으로 분할하는 것을 기본값으로 합니다.** 대형 원고에서 회차 수가 지나치게 적으면 학습자의 인지 부하가 과중해집니다.`;

  const pageGuide = constraints.maxPagesPerSession
    ? `각 회차의 최대 페이지는 **${constraints.maxPagesPerSession}페이지**입니다. 단, 페이지 제한으로 인해 하나의 논증이나 예시가 중간에 끊겨서는 안 됩니다. 제한에 걸릴 경우 \"가장 가까운 문맥적 전환점\"으로 분할 위치를 조정하세요.`
    : "";

  const lectureTimeGuide = constraints.lectureTime
    ? `- 각 회차는 약 **${constraints.lectureTime}분** 강의에 해당하는 분량이어야 합니다. 강의 속도를 분당 약 1~2페이지로 가정하여 페이지 수를 산정하세요.`
    : "";

  const additionalGuide = constraints.additionalInstructions
    ? `\n### 사용자 추가 지시사항\n${constraints.additionalInstructions}\n(위 지시사항이 아래 원칙과 충돌할 경우, 교육공학 원칙을 우선 적용하고 이유를 reasoning에 기재하세요.)`
    : "";

  // ── 범위 제한 블록 (range 모드) ────────────────────────
  const rangeBlock = rangeContext
    ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## ⚡ 분석 범위 제한 (최우선 준수)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
이 요청은 PDF 전체가 아닌 **p.${rangeContext.startPage} ~ p.${rangeContext.endPage}** 범위만 분석합니다.

- 첫 번째 세션의 startPage = **${rangeContext.startPage}** (엄수)
- 마지막 세션의 endPage = **${rangeContext.endPage}** (엄수, 이 숫자 그 자체가 마지막 포함 페이지)
- 이 범위 밖의 페이지는 절대 참조하거나 포함하지 마세요.
${rangeContext.targetSessionCount ? `- 이 범위에서 약 **${rangeContext.targetSessionCount}개** 회차를 생성하는 것을 목표로 합니다.` : ""}

⛔ **endPage exclusive 오류 절대 금지** (가장 흔한 실수):
- endPage는 **"마지막으로 포함되는 페이지"** (inclusive)입니다.
- 세션 A가 p.${rangeContext.startPage}~p.X까지 다루고, 세션 B가 p.(X+1)부터 시작한다면:
  ✅ 올바름: 세션 A endPage = X,  세션 B startPage = X+1
  ❌ 오류:   세션 A endPage = X+1 (X+1 페이지는 세션 B에 속하므로 세션 A에 포함 불가)
- "다음 세션이 Y페이지에서 시작한다" ≠ "현재 세션 endPage = Y". endPage = Y-1 이 정답입니다.
- 마지막 세션의 endPage는 반드시 **${rangeContext.endPage}** 이어야 하며, 단 1페이지도 부족하거나 초과해서는 안 됩니다.
`
    : "\n";

  // ── 페이지 커버리지 동적 문구 ─────────────────────────
  const coverageStart = rangeContext ? rangeContext.startPage : 1;
  const coverageEndDesc = rangeContext
    ? `**${rangeContext.endPage}** (범위 끝 페이지, 반드시 일치)`
    : "**이 PDF의 실제 마지막 페이지 번호** (PDF를 직접 확인하여 정확히 기입하세요)";
  const coverageTarget = rangeContext
    ? `범위(p.${rangeContext.startPage}~p.${rangeContext.endPage})`
    : "PDF";

  // ── 스키마 예시 시작 페이지 ───────────────────────────
  const ex1Start = coverageStart;
  const ex1End = coverageStart + 9;
  const ex2Start = coverageStart + 10;
  const ex2End = coverageStart + 19;

  // ── 사용자 직접 지시사항 블록 ───────────────────────────
  const userInstructionBlock = userInstruction
    ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## ⭐ 최우선 지시사항 (사용자 직접 지정)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
사용자가 다음 방식으로 분할을 요청했습니다:

"${userInstruction}"

이 지시사항을 **최우선**으로 따르세요. 아래 교육공학 원칙(원칙 1~4)보다 이 지시사항이 우선합니다.
지시에 맞는 분할점을 PDF에서 찾고, 각 회차의 제목·요약·reasoning을 적절히 작성하세요.
`
    : "";

  return `
🚨🚨🚨 [절대 규칙 — 페이지 번호 세는 방법] 🚨🚨🚨
PDF 뷰어에서 이 파일을 열었을 때 맨 처음 보이는 페이지가 1번입니다.
그 다음 페이지 = 2번, 그 다음 = 3번 ... 이렇게 **물리적 순서**로만 번호를 매기세요.
문서 안에 인쇄된 숫자(아라비아 숫자, 로마자 등)는 **완전히 무시**하세요.

예시: 표지(→1번), 목차(→2번), 빈 페이지(→3번), 본문첫장(→4번)
이때 본문 첫 장에 "1"이 인쇄되어 있어도 startPage = **4** (인쇄 숫자 "1" ❌)

이 규칙을 어기면 분할 위치가 완전히 틀립니다. 반드시 물리적 순서 번호를 사용하세요.
🚨🚨🚨 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 🚨🚨🚨

당신은 10년 이상 경력의 교육 공학(Instructional Design) 및 교수 설계(Curriculum Design) 전문가입니다.
첨부된 PDF 교육 원고를 정밀하게 분석하여, 아래 내용에 따라 학습 회차를 분할합니다.
${userInstructionBlock}${rangeBlock}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 핵심 원칙 1: One Message 원칙 (단일 핵심 메시지 완결)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
각 회차는 반드시 **"학습자가 이 회차를 마치면 딱 하나의 핵심 메시지를 가지고 떠날 수 있어야 한다"**는 기준을 충족해야 합니다.

- 핵심 메시지란: "이 회차의 핵심은 [무엇]이다"라고 한 문장으로 요약 가능한 중심 아이디어입니다.
- 한 회차에 서로 다른 두 개의 핵심 메시지가 공존한다면 반드시 분리하세요.
- 반대로, 같은 핵심 메시지를 뒷받침하는 세부 내용(정의 → 예시 → 연습 → 요약)은 하나의 회차로 묶으세요.
- 회차 제목은 "핵심 메시지를 동사 중심으로 표현"하세요. (예: "개념을 정의하고 한계를 이해한다" ✓ / "3장 서론" ✗)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 핵심 원칙 2: 문맥적 전환점 우선 분할
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
페이지 수나 챕터 번호가 아닌, **"논리적·인지적 흐름이 전환되는 지점"**을 분할 기준으로 삼으세요.

문맥적 전환점의 신호:
- 새로운 핵심 개념(Key Concept)이 도입되는 페이지
- 논증의 방향이 바뀌는 페이지 (예: "이론 소개" → "비판" 또는 "적용" 전환)
- 추상적 설명에서 구체적 사례로 전환되거나, 반대의 경우
- "지금까지 ~를 배웠다, 이제 ~를 살펴보자" 류의 전환 문구가 등장하는 페이지
- 인지 부하가 리셋되어야 할 정도로 복잡도 수준이 바뀌는 페이지

반드시 피해야 할 분할:
- 하나의 예시나 사례 연구가 진행 중인 페이지 중간에서 끊기
- 정의(Definition)가 나왔는데 그 개념의 첫 적용 예시 직전에서 끊기
- 문제 제기(Problem Statement)와 해결 방안(Solution)을 서로 다른 회차로 분리

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 핵심 원칙 3: Reasoning — 논리적 근거 명시
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
각 회차의 reasoning 필드에는 아래 3가지를 반드시 포함하세요:

1. **전환점 식별**: "X페이지에서 [구체적 내용]이 끝나고 Y페이지부터 [새로운 내용]이 시작된다"
2. **One Message 확인**: "이 회차의 핵심 메시지는 '[메시지]'이며, 포함된 모든 내용이 이를 뒷받침한다"
3. **연결 고리**: "이전 회차에서 쌓은 [지식/개념]이 이 회차 학습의 선수 조건이며, 이 회차는 다음 회차의 [내용]을 위한 기반이 된다"

reasoning은 최소 3문장 이상, 교육 전문가가 학생에게 설명하듯 구체적으로 작성하세요.
"페이지 범위가 적절하기 때문에" 같은 순환 논리는 금지합니다.

⚡ **대용량 문서 예외 (100페이지 초과)**: 원고가 100페이지를 넘는 경우, reasoning은 핵심 논거 **1문장**으로만 간결하게 작성하세요.
형식: "[전환점 페이지]에서 [이전 주제]가 끝나고 [새 주제]가 시작되며, 이 회차의 핵심 메시지는 '[한 문장]'이다."
API 응답 크기를 최소화하기 위해 수식어·반복·장식적 표현을 모두 제거합니다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 핵심 원칙 4: 적정 분량 균형 (Balanced Granularity)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
회차 간 분량 불균형은 학습자 경험을 저해합니다. 다음 기준에 따라 분량을 조절하세요.

**[물리적 한계 — 회차당 페이지 목표]**
- 이상적 분량: 회차당 **15~30페이지** (집중 학습 가능한 인지 용량 기준)
- 경계 기준: 한 회차가 **40페이지를 초과**한다면, 해당 주제를 논리적으로 2개 회차로 분리하세요.
  - 분리 방식: "[주제명] — 기초 / 심화", "[주제명] 1부 / 2부", "[주제명] 개념 / 적용" 등
  - 단, 사용자가 maxPagesPerSession을 명시했다면 해당 값을 우선합니다.

**[소주제 탐색 강화 — 대주제 내부 분할점 발굴]**
- 대주제(H1 챕터)가 바뀌지 않더라도, 다음 신호를 적극적으로 분할점으로 활용하세요:
  - 소제목(Heading 2·3)이 새로 등장하는 페이지
  - 케이스 스터디(Case Study) 또는 사례 분석이 시작되는 페이지
  - 연습 문제(Exercise)·실습 섹션이 등장하는 페이지
  - 이론 설명 → 실제 적용(Application) 전환이 명확한 페이지
- "챕터가 같으니 하나로 묶는다"는 단순 논리는 금지합니다. 소주제 내에서도 인지 전환점을 찾으세요.

**[분량 균형 체크]**
- 분할 결과, 가장 긴 회차와 가장 짧은 회차의 페이지 차이가 3배를 초과한다면 재조정을 검토하세요.
- 극단적으로 짧은 회차(5페이지 미만)는 인접 회차와 통합할 수 있는지 검토하세요.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 분할 규칙 (실무 체크리스트)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- ${sessionCountGuide}
${pageGuide ? `- ${pageGuide}` : ""}
${lectureTimeGuide ? `${lectureTimeGuide}` : ""}
- 서론(Introduction)과 학습 목표 제시는 해당 주제의 첫 번째 회차에 포함하세요.
- 실습·예제·케이스 스터디는 반드시 그것이 설명하는 개념과 같은 회차에 묶으세요.
- 중간 요약(Summary) 또는 복습(Review) 섹션은 직전 내용이 속한 회차의 끝에 포함하세요.
- 새로운 챕터가 시작되더라도 이전 챕터의 결론부가 아직 끝나지 않았다면 함께 묶으세요.
${additionalGuide}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## ⚠️ 페이지 번호 규칙 (반드시 준수)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
**startPage와 endPage는 모두 포함(inclusive) 경계입니다.**

- endPage는 해당 회차의 **마지막 페이지 번호 자체**를 의미합니다. (해당 페이지 포함)
- 다음 회차의 startPage = 이전 회차의 endPage **+ 1** 이어야 합니다.
- 같은 페이지 번호가 두 회차에 동시에 등장해서는 절대 안 됩니다.

✅ 올바른 예시:
  회차 1: startPage=1,  endPage=10   ← 10페이지까지 포함
  회차 2: startPage=11, endPage=20   ← 11페이지부터 시작 (10+1)
  회차 3: startPage=21, endPage=35   ← 21페이지부터 시작 (20+1)

❌ 잘못된 예시 (절대 금지):
  회차 1: startPage=1,  endPage=10
  회차 2: startPage=10, endPage=20   ← 10페이지가 두 회차에 중복됨! 오류!

**[전체 페이지 커버리지 — 절대 준수]**
- 반드시 이 ${coverageTarget}의 **첫 번째 페이지부터 마지막 페이지까지** 단 하나의 페이지도 누락 없이 모든 세션에 포함시켜야 합니다.
- 첫 번째 세션의 startPage = **${coverageStart}** (시작점)
- 마지막 세션의 endPage = ${coverageEndDesc}
- 목차·부록·색인·참고문헌 등 보조 섹션도 반드시 마지막 세션에 포함시키세요.
- 어떤 페이지도 어느 세션에도 속하지 않는 상태(Gap)는 허용되지 않습니다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 응답 형식 (JSON 엄수)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
**출력 규칙 (위반 시 파싱 실패)**:
- 응답은 오직 순수한 JSON 객체 **하나만** 출력합니다.
- 마크다운 코드 블록(\`\`\`json), 설명 문구, 인사말, 요약, 주석, 추가 메모 등 JSON 외의 텍스트는 **단 한 글자도** 출력하지 마세요.
- 불필요한 수식어·중복 설명·장식적 문장은 모두 제거합니다. title·summary·reasoning은 내용만, 군더더기 없이 작성합니다.
- 페이지 경계: 회차 N의 endPage = X이면, 회차 N+1의 startPage = X+1 (엄수)

{
  "sessions": [
    {
      "sessionNumber": 1,
      "title": "동사 중심 핵심 메시지 제목 (예: '~의 개념을 정의하고 한계를 이해한다')",
      "summary": "이 회차 핵심 내용 2~3문장. '학습자는 ~을 할 수 있게 된다' 형식.",
      "startPage": ${ex1Start},
      "endPage": ${ex1End},
      "reasoning": "100p 이하: ① [전환점] X~Y페이지 근거. ② [One Message] 핵심 메시지 확인. ③ [연결] 전후 회차 관계. | 100p 초과: 'p.Y에서 [주제 A]가 끝나고 [주제 B]가 시작되며, 핵심 메시지는 [한 문장]이다.'"
    },
    {
      "sessionNumber": 2,
      "title": "두 번째 회차 제목",
      "summary": "두 번째 회차 요약.",
      "startPage": ${ex2Start},
      "endPage": ${ex2End},
      "reasoning": "동일 형식 적용."
    }
  ]
}`.trim();
}
