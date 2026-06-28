async function test() {
  const shareUrl = 'https://share.temu.com/GLv19JAELgB';
  console.log('Testing with share URL:', shareUrl);
  
  try {
    const res = await fetch('http://127.0.0.1:3001/api/scrape-price', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: shareUrl }),
      signal: AbortSignal.timeout(120000),
    });
    
    const data = await res.json();
    console.log('Response status:', res.status);
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.log('Error:', err.message);
    
    // Try the network address
    try {
      const res2 = await fetch('http://21.0.16.185:3001/api/scrape-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: shareUrl }),
        signal: AbortSignal.timeout(120000),
      });
      const data2 = await res2.json();
      console.log('Network address response:', JSON.stringify(data2, null, 2));
    } catch (err2) {
      console.log('Network address also failed:', err2.message);
    }
  }
}

test();
