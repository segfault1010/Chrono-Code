async function run() {
  const GITHUB_API_BASE = "https://api.github.com";
  const url = "https://github.com/expressjs/express";
  
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split("/").filter(Boolean);
  const owner = pathParts[0];
  const repo = pathParts[1].replace(/\.git$/, "");

  const headers = {
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "Chrono-Code"
  };

  const response = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/commits?per_page=1`, { headers });
  const linkHeader = response.headers.get("Link");
  
  console.log("Status:", response.status);
  console.log("Link Header:", linkHeader);

  if (!linkHeader) {
    const data = await response.json();
    console.log("No link header. Data length:", Array.isArray(data) ? data.length : 0);
  } else {
    const links = linkHeader.split(",");
    const lastLink = links.find((link: string) => link.includes('rel="last"'));
    console.log("Last Link:", lastLink);
    if (lastLink) {
      const match = lastLink.match(/page=(\d+)/);
      console.log("Parsed Page:", match ? match[1] : null);
    }
  }
}

run().catch(console.error);
