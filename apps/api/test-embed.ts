import * as dotenv from "dotenv";
dotenv.config({ path: ".env" });
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

async function run() {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-embedding-2" });
    const result = await model.embedContent("Hello world");
    console.log("Success:", result.embedding.values.slice(0, 5));
  } catch(e) {
    console.error("Failed text-embedding-004:", e);
  }
}
run();
