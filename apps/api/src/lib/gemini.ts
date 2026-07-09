import { GoogleGenerativeAI } from "@google/generative-ai";

if (!process.env.GEMINI_API_KEY) {
  console.warn("[chronocode-api] GEMINI_API_KEY is not set. AI explanations will fail.");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "missing-key");

// Using Gemini 3.5 Flash for high speed and up to date model
export const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });
