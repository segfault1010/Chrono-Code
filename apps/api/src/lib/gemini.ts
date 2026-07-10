import { GoogleGenerativeAI } from "@google/generative-ai";

if (!process.env.GEMINI_API_KEY) {
  console.warn("[chronocode-api] GEMINI_API_KEY is not set. AI explanations will fail.");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "missing-key");

// Using gemini-3.1-flash-lite which is very fast and has high rate limits
export const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });

// Embedding model for semantic search
export const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-2" });
