// Test the actual scrape-price API
const SHARE_URL = 'https://share.temu.com/GLv19JAELgB';

async function testApi() {
  try {
    const res = await fetch('http://localhost:3000/api/scrape-price', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: SHARE_URL }),
    });

    const data = await res.json();
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.log('Error:', err.message);
    console.log('\nTrying direct test instead...');
  }
}

testApi();
