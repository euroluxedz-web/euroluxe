import http from 'http';

function makeRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : '';
    const req = http.request({
      hostname: '0.0.0.0',
      port: 3001,
      path,
      method,
      timeout: 120000,
      headers: body ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      } : {},
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(postData);
    req.end();
  });
}

async function test() {
  try {
    // First test GET /
    const getRes = await makeRequest('GET', '/', null);
    console.log('GET / status:', getRes.status);
    
    // Then test the API
    console.log('\nTesting share URL...');
    const postRes = await makeRequest('POST', '/api/scrape-price', { url: 'https://share.temu.com/GLv19JAELgB' });
    console.log('POST status:', postRes.status);
    try {
      const data = JSON.parse(postRes.data);
      console.log('Response:', JSON.stringify(data, null, 2));
    } catch {
      console.log('Raw response (first 500):', postRes.data.slice(0, 500));
    }
  } catch (err) {
    console.log('Error:', err.message);
  }
}

test();
