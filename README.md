# EduSplit AI

> 교육 원고 PDF를 주제 완결성 기반으로 자동 회차 분할하는 AI 서비스

**Powered by Gemini 2.0 Flash** · Next.js 14 · Tailwind CSS

---

## 주요 기능

- **AI 자동 분석** — Gemini 2.0 Flash가 교육공학 원칙에 따라 최적 분할점 탐지
- **멀티 스테이지 분석** — 80페이지 이상 대용량 PDF도 청크 단위로 정확하게 처리
- **회차별 다운로드** — 분할된 각 회차를 개별 PDF 또는 ZIP으로 다운로드
- **분할 제약 설정** — 회차 수, 최대 페이지, 강의 시간 등 커스텀 지정 가능
- **분석 이력 관리** — 최근 10개 분석 결과를 로컬에 자동 저장

---

## 시작하기

### 요구 사항

- [Node.js LTS](https://nodejs.org) (v18 이상)
- Gemini API Key ([발급](https://aistudio.google.com/app/apikey))

### 설치 및 실행

```bash
# 1. 저장소 클론
git clone https://github.com/crmubicoq/rowfile-cutter.git
cd rowfile-cutter

# 2. 환경 변수 설정
echo GEMINI_API_KEY=your_api_key_here > .env.local

# 3. 의존성 설치 및 빌드
npm install
npm run build

# 4. 서버 시작
npm start
# → http://localhost:3000
```

### Windows 원클릭 실행 (배치 파일)

| 파일 | 용도 |
|---|---|
| `빌드.bat` | 프로덕션 빌드 (코드 변경 시 실행) |
| `서비스시작.bat` | 서버 기동 + 브라우저 자동 오픈 |

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

## 환경 변수

`.env.local` 파일을 프로젝트 루트에 생성하세요.

```
GEMINI_API_KEY=your_gemini_api_key
```

> API 키는 절대 커밋하지 마세요. `.gitignore`에 의해 자동 제외됩니다.

---

## 라이선스

MIT
