import { createAppError } from "../middleware/error-handler";

const GITHUB_API_BASE = "https://api.github.com";

/**
 * Fetches the exact total commit count from GitHub for a specific repository.
 * Uses the Link header pagination trick for efficiency (O(1) API call).
 */
export async function fetchGithubCommitCount(url: string, githubToken?: string): Promise<number> {
  try {
    // Extract owner and repo from URL (e.g., https://github.com/owner/repo)
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split("/").filter(Boolean);
    if (pathParts.length < 2) {
      throw new Error("Invalid GitHub URL");
    }
    const owner = pathParts[0];
    const repo = pathParts[1]!.replace(/\.git$/, "");

    const headers: Record<string, string> = {
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "Chrono-Code"
    };

    if (githubToken) {
      headers["Authorization"] = `Bearer ${githubToken}`;
    }

    // Fetch only 1 commit per page to minimize payload size
    const response: globalThis.Response = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/commits?per_page=1`, { headers });
    
    if (!response.ok) {
      if (response.status === 409) return 0; // Empty repository
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const linkHeader = response.headers.get("Link");
    
    // If there's no Link header, it means there's only 1 page.
    if (!linkHeader) {
      const data = await response.json();
      return Array.isArray(data) ? data.length : 0;
    }

    // Parse the Link header to find rel="last"
    // Format: <url>; rel="next", <url>; rel="last"
    const links = linkHeader.split(",");
    const lastLink = links.find(link => link.includes('rel="last"'));
    
    if (lastLink) {
      const urlMatch = lastLink.match(/<([^>]+)>/);
      if (urlMatch && urlMatch[1]) {
        const urlStr = urlMatch[1];
        try {
          const parsedUrl = new URL(urlStr);
          const pageParam = parsedUrl.searchParams.get("page");
          if (pageParam) {
            return parseInt(pageParam, 10);
          }
        } catch (e) {
          // Fall through to error
        }
      }
    }

    throw new Error("Could not parse Link header to determine commit count");
  } catch (err) {
    console.error(`[github-service] Error fetching commit count for ${url}:`, err);
    throw err;
  }
}
