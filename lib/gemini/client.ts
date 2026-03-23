import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";

/**
 * Gemini 2.0 Flash 모델 인스턴스를 반환합니다.
 * API 키는 요청 헤더(x-gemini-api-key) 또는 환경변수에서 주입받습니다.
 */
export function getGeminiModel(apiKey: string): GenerativeModel {
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  });
}
