import test from "node:test";
import assert from "node:assert";

// Mock global fetch
const originalFetch = global.fetch;

// We need to import the module after mocking, or just test a refactored pure function.
// Since fetchGithubCommitCount is not purely functional, let's extract the parsing logic.

import { fetchGithubCommitCount } from "../github-service";

test("github-service Link parsing", async (t) => {
  await t.test("extracts page number correctly with per_page=1", async () => {
    global.fetch = async () => ({
      ok: true,
      headers: new Headers({
        "Link": '<https://api.github.com/repositories/7929498/commits?per_page=1&page=2>; rel="next", <https://api.github.com/repositories/7929498/commits?per_page=1&page=351>; rel="last"'
      })
    } as any);

    const count = await fetchGithubCommitCount("https://github.com/owner/repo");
    assert.strictEqual(count, 351);
  });

  await t.test("extracts page number correctly with no per_page", async () => {
    global.fetch = async () => ({
      ok: true,
      headers: new Headers({
        "Link": '<https://api.github.com/repositories/123/commits?page=2>; rel="next", <https://api.github.com/repositories/123/commits?page=42>; rel="last"'
      })
    } as any);

    const count = await fetchGithubCommitCount("https://github.com/owner/repo");
    assert.strictEqual(count, 42);
  });

  await t.test("handles single-page repository (no Link header)", async () => {
    global.fetch = async () => ({
      ok: true,
      headers: new Headers(),
      json: async () => [{ sha: "abcdef" }] // 1 commit returned
    } as any);

    const count = await fetchGithubCommitCount("https://github.com/owner/repo");
    assert.strictEqual(count, 1);
  });
  
  await t.test("handles empty repository (409 Conflict)", async () => {
    global.fetch = async () => ({
      ok: false,
      status: 409
    } as any);

    const count = await fetchGithubCommitCount("https://github.com/owner/repo");
    assert.strictEqual(count, 0);
  });

  // Cleanup
  t.after(() => {
    global.fetch = originalFetch;
  });
});
