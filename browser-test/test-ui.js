const puppeteer = require('puppeteer-core');

(async () => {
  console.log("Starting browser...");
  const browser = await puppeteer.launch({ 
    headless: 'new',
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  });
  
  const page = await browser.newPage();
  
  const client = await page.target().createCDPSession();
  await client.send('Network.enable');

  client.on('Network.requestWillBeSent', (e) => {
    if (e.request.url.includes('repos') || e.request.url.includes('api')) {
      console.log(`[REQUEST] ${e.request.method} ${e.request.url}`);
      console.log(`          Headers: ${JSON.stringify(e.request.headers)}`);
    }
  });

  client.on('Network.responseReceived', (e) => {
    if (e.response.url.includes('repos') || e.response.url.includes('api')) {
      console.log(`[RESPONSE] ${e.response.status} ${e.response.url}`);
      console.log(`           Headers: ${JSON.stringify(e.response.headers)}`);
    }
  });

  console.log("Navigating to https://chrono-code-web.vercel.app ...");
  await page.goto('https://chrono-code-web.vercel.app', { waitUntil: 'networkidle2' });

  console.log("Clicking the first demo repository button...");
  // The demo buttons have the text of the repo, e.g. "expressjs/morgan"
  // Let's just find the button with "expressjs/morgan" and click it
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const demoBtn = buttons.find(b => b.textContent.includes('expressjs/morgan'));
    if (demoBtn) {
      demoBtn.click();
    } else {
      console.log("Demo button not found!");
    }
  });

  console.log("Waiting for network requests to finish...");
  await new Promise(r => setTimeout(r, 5000));
  
  await browser.close();
})();
