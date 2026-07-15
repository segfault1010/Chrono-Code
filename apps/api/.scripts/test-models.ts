import * as dotenv from "dotenv";
dotenv.config({ path: ".env" });

interface GeminiModel {
   name: string;
}

interface GeminiModelsResponse {
   models?: GeminiModel[];
}

async function run() {
   try {
      const res = await fetch(
         `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`
      );

      const data = (await res.json()) as GeminiModelsResponse;

      console.log((data.models ?? []).map((m) => m.name));
   } catch (e) {
      console.error(e);
   }
}

run();