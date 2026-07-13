async function run() {
  const url = "https://api.github.com/repos/expressjs/cors/commits?per_page=1";
  
  const headers = {
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "Chrono-Code"
  };

  const response = await fetch(url, { headers });
  const linkHeader = response.headers.get("Link");
  
  console.log("Status:", response.status);
  console.log("Link Header:", linkHeader);

  if (!linkHeader) {
    const data = await response.json();
    console.log("No link header. Data length:", Array.isArray(data) ? data.length : 0);
  } else {
    const links = linkHeader.split(",");
    const lastLink = links.find(link => link.includes('rel="last"'));
    console.log("Last Link:", lastLink);
    if (lastLink) {
      const match = lastLink.match(/page=(\d+)/);
      console.log("Parsed Page:", match ? match[1] : null);
    }
  }
}

run().catch(console.error);
