import "dotenv/config";

const API_BASE = "http://localhost:3001/api";

const DEMO_REPOS = [
  "https://github.com/expressjs/morgan",
  "https://github.com/expressjs/cors"
];

async function seedDemos() {
  console.log("[Seed] Starting demo repository seeding...");

  for (const url of DEMO_REPOS) {
    try {
      console.log(`\n[Seed] Importing: ${url}`);
      const res = await fetch(`${API_BASE}/repos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      
      const repo = await res.json() as { id: string; status: string };
      
      if (!res.ok) {
        console.error(`[Seed] Failed to import ${url}:`, repo);
        continue;
      }

      console.log(`[Seed] Successfully queued ${url}. ID: ${repo.id}`);
      console.log(`[Seed] Current status: ${repo.status}`);

      // Wait a moment before starting the next one
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (err) {
      console.error(`[Seed] Error seeding ${url}:`, err);
    }
  }

  console.log("\n[Seed] Seeding complete. Repositories will finish indexing in the background.");
}

seedDemos().catch(console.error);
