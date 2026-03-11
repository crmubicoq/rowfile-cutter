# 프로젝트명: EduSplit AI (시니어 AI PM 가이드)

## 1. 개요
- 목적: 교육 원고(PDF, MD, TXT)를 분석하여 주제 완결성 기반으로 회차를 나누고 PDF를 물리적으로 분할하는 도구.
- 핵심 가치: 지식의 원자화(Atomization), 교육적 흐름 보존.

## 2. 기술 스택
- 프레임워크: Next.js 14+ (App Router)
- 스타일링: Tailwind CSS + shadcn/ui
- AI 엔진: Gemini 2.0 Flash (Native PDF OCR 및 시맨틱 분석용)
- PDF 처리: pdf-lib (페이지 단위 분할 및 병합)

## 3. 핵심 로직 규칙
- Gemini Flash에 PDF를 직접 전달하여 텍스트와 페이지 매핑 정보를 추출한다.
- 사용자의 '제약 조건(회차 수, 분량)'을 프롬프트에 반영하여 JSON 형태로 응답받는다.
- `pdf-lib`을 사용하여 원본 품질 손실 없이 페이지를 물리적으로 잘라낸다.

## 4. 폴더 구조 규칙
- `/components/ui`: shadcn UI 컴포넌트
- `/lib/gemini`: Gemini API 연동 로직
- `/lib/pdf`: PDF 분할 유틸리티
- `/api/analyze`: 원고 분석 API
- `/api/split`: PDF 분할 실행 API
