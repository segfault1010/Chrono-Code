const https = require('https');
https.get('https://github.com/segfault1010/Chrono-Code', res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Stars:', data.match(/id="repo-stars-counter-star"[^>]*title="([^"]+)"/));
    console.log('Forks:', data.match(/id="repo-network-counter"[^>]*title="([^"]+)"/));
  });
});
