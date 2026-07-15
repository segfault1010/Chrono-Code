import { GoogleGenerativeAI } from "@google/generative-ai";
import "dotenv/config";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

async function testModel(modelName: string) {
  try {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent("Hello!");
    console.log(`[SUCCESS] ${modelName}:`, result.response.text());
  } catch (err: any) {
    console.log(`[ERROR] ${modelName}:`, err.message);
  }
}

async function run() {
  await testModel("gemini-2.5-flash");
  await testModel("gemini-flash-latest");
  await testModel("gemini-3.1-flash-lite");
  await testModel("gemini-3.5-flash");
}

run();
