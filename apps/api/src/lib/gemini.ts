import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY || "";

if (!apiKey) {
  console.warn(
    "[chronocode-api] WARNING: GEMINI_API_KEY is not set. " +
    "AI explanations will fail. Set this in your .env file."
  );
}

export const genAI = new GoogleGenerativeAI(apiKey);

// Using Gemini 1.5 Flash as default for fast, cost-effective explanations
export const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
