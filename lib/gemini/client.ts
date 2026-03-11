import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";

// GEMINI_API_KEY는 서버 전용 환경변수입니다. (NEXT_PUBLIC_ 접두사 없음)
// Route Handler에서만 호출되므로 클라이언트 번들에 절대 노출되지 않습니다.
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error(
    "GEMINI_API_KEY is not defined. Please add it to your .env.local file."
  );
}

const genAI = new GoogleGenerativeAI(apiKey);

/**
 * Gemini 2.0 Flash 모델 인스턴스를 반환합니다.
 * responseMimeType을 "application/json"으로 고정하여 구조화된 응답을 보장합니다.
 */
export function getGeminiModel(): GenerativeModel {
  return genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2, // 낮은 temperature로 일관된 JSON 출력 유도
    },
  });
}
