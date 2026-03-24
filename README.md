# EduSplit AI

> 교육 원고 PDF를 주제 완결성 기반으로 자동 회차 분할하는 AI 서비스

**Powered by Gemini 2.0 Flash** · Next.js 14 · Tailwind CSS

---

## 주요 기능

- **AI 자동 분석** — Gemini 2.0 Flash가 교육공학 원칙에 따라 최적 분할점 탐지
- **직접 지정 모드** — 사용자가 "목차의 1,2,3,4로 나눠줘" 등 직접 분할 방법 입력
- **멀티 스테이지 분석** — 80페이지 이상 대용량 PDF도 청크 단위로 정확하게 처리
- **페이지 오프셋 보정** — 표지·목차 등 앞 페이지 수 입력 시 자동으로 실제 PDF 위치 보정
- **회차별 다운로드** — 분할된 각 회차를 개별 PDF 또는 ZIP으로 다운로드
- **분할 제약 설정** — 회차 수, 최대 페이지, 강의 시간 등 커스텀 지정 가능 (AI 모드)
- **분석 이력 관리** — 최근 10개 분석 결과를 로컬에 자동 저장

---

## 시작하기

### 요구 사항

- [Node.js LTS](https://nodejs.org) (v18 이상) — 공식 사이트에서 설치 후 시스템 PATH에 등록
- Gemini API Key ([발급](https://aistudio.google.com/app/apikey))

### 설치 및 실행

```bash
# 1. 저장소 클론
git clone https://github.com/crmubicoq/rowfile-cutter.git
cd rowfile-cutter

# 2. 의존성 설치 및 빌드
npm install
npm run build

# 3. 서버 시작
npm start
# → http://localhost:3001
# → 브라우저에서 Gemini API 키 입력 팝업이 자동으로 뜸
```

### Windows 원클릭 실행 (배치 파일)

| 파일 | 용도 |
|---|---|
| `빌드.bat` | 최초 1회 또는 코드 변경 시 실행 |
| `서비스시작.bat` | 서버 기동 + 브라우저 자동 오픈 |

> **팀원 최초 설정 순서**
> 1. Node.js LTS 설치 ([nodejs.org](https://nodejs.org))
> 2. `빌드.bat` 실행 (최초 1회)
> 3. `서비스시작.bat` 실행
> 4. 브라우저에서 Gemini API 키 입력 팝업 → 키 입력 후 저장

---

## 기술 스택

| 분류 | 기술 |
|---|---|
| Framework | Next.js 14 (App Router) |
| AI | Google Gemini 2.0 Flash |
| Styling | Tailwind CSS |
| PDF 처리 | pdf-lib |
| 압축 | JSZip |
| 애니메이션 | Framer Motion |
| 언어 | TypeScript |

---

## API 키

앱 실행 후 브라우저에서 **API 키 입력 팝업**이 자동으로 표시됩니다.
[Google AI Studio](https://aistudio.google.com/app/apikey)에서 발급받은 키를 입력하면 브라우저에 저장됩니다.

> 키는 이 기기의 브라우저 로컬 스토리지에만 저장되며 외부로 전송되지 않습니다.

---

## 라이선스

MIT
