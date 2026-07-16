const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({ 
    headless: 'new',
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  });
  const page = await browser.newPage();
  
  const client = await page.target().createCDPSession();
  await client.send('Network.enable');

  client.on('Network.requestWillBeSent', (e) => {
    if (e.request.method === 'OPTIONS' && e.request.url.includes('api/repos')) {
      console.log('\n--- BROWSER REQUEST CAPTURED ---');
      console.log('URL:', e.request.url);
      console.log('Method:', e.request.method);
      console.log('Origin:', e.request.headers['Origin'] || e.request.headers['origin']);
      console.log('Access-Control-Request-Headers:', e.request.headers['Access-Control-Request-Headers'] || e.request.headers['access-control-request-headers']);
      console.log('Access-Control-Request-Method:', e.request.headers['Access-Control-Request-Method'] || e.request.headers['access-control-request-method']);
      console.log('Credentials mode:', e.request.mixedContentType || 'omit');
    }
  });

  client.on('Network.responseReceived', (e) => {
    if (e.response.url.includes('api/repos')) {
      console.log('\n--- BROWSER RESPONSE CAPTURED ---');
      console.log('URL:', e.response.url);
      console.log('Status:', e.response.status);
      console.log('Headers:');
      for (const [key, value] of Object.entries(e.response.headers)) {
        console.log(`  ${key}: ${value}`);
      }
    }
  });

  console.log("Navigating to frontend...");
  await page.goto('https://chrono-code-web.vercel.app', { waitUntil: 'networkidle2' });

  console.log("Triggering fetch to API...");
  await page.evaluate(async () => {
    try {
      await fetch('https://chrono-code-api.vercel.app/api/repos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url: 'https://github.com/facebook/react' })
      });
    } catch (err) {
      console.log('Fetch error:', err.message);
    }
  });

  await new Promise(r => setTimeout(r, 2000));
  await browser.close();
})();
