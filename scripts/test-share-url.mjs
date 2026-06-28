// Test share URL resolution and price extraction
import { Buffer } from 'buffer';

const SHARE_URL = 'https://share.temu.com/GLv19JAELgB';

async function testShareUrl() {
  console.log('=== Testing share URL:', SHARE_URL, '===\n');

  // Step 1: Follow redirect
  try {
    const res = await fetch(SHARE_URL, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    console.log('1. Response status:', res.status);
    console.log('2. Final URL:', res.url);
    console.log('3. Redirected:', res.redirected);

    const html = await res.text();
    console.log('4. HTML length:', html.length);

    // Parse the resolved URL
    const resolvedUrl = res.url;
    try {
      const parsed = new URL(resolvedUrl);
      console.log('\n5. Resolved URL details:');
      console.log('   Hostname:', parsed.hostname);
      console.log('   Pathname:', parsed.pathname);
      console.log('   Search params:');
      for (const [key, value] of parsed.searchParams.entries()) {
        console.log(`     ${key}: ${value.slice(0, 200)}${value.length > 200 ? '...' : ''}`);
      }

      // Extract _oak_rec_ext_1
      const hint = parsed.searchParams.get('_oak_rec_ext_1');
      if (hint) {
        console.log('\n6. _oak_rec_ext_1 found:', hint);
        const b64 = hint.replace(/-/g, '+').replace(/_/g, '/');
        const decoded = Buffer.from(b64, 'base64').toString('utf-8').trim();
        console.log('   Decoded:', decoded);
        const cents = parseInt(decoded.replace(/\D/g, ''), 10);
        console.log('   Cents:', cents);
        console.log('   As price (/100):', cents / 100);

        // Determine locale currency
        const localeMatch = parsed.pathname.match(/^\/([a-z]{2}(?:-[a-z]{2})?)\//i);
        const locale = localeMatch ? localeMatch[1].toLowerCase() : '';
        console.log('   Locale from path:', locale || 'none');
      } else {
        console.log('\n6. _oak_rec_ext_1: NOT FOUND');
      }

      // Extract goods_id
      const gMatch = parsed.pathname.match(/-g-([a-zA-Z0-9]+)/);
      if (gMatch) {
        console.log('\n7. goods_id:', gMatch[1]);
      }

      // Extract top_gallery_url
      const topGallery = parsed.searchParams.get('top_gallery_url');
      if (topGallery) {
        console.log('\n8. top_gallery_url:', topGallery.slice(0, 150) + '...');
      }

    } catch (e) {
      console.log('Error parsing resolved URL:', e.message);
    }

    // Check HTML for price data
    console.log('\n9. HTML content analysis:');

    // Check for priceInfo blocks
    const priceInfoMatches = [...html.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
    console.log('   priceInfo blocks found:', priceInfoMatches.length);
    for (const pi of priceInfoMatches) {
      const cents = parseInt(pi[1]);
      const cur = pi[2];
      console.log(`     ${cur} ${cents} cents = ${cents/100} ${cur}`);
    }

    // Check for rawData
    const rawDataMatch = html.match(/window\.rawData\s*=/);
    console.log('   window.rawData present:', !!rawDataMatch);

    // Check for OG price
    const ogPrice = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i);
    console.log('   OG price:', ogPrice?.[1] || 'none');

    // Check for price patterns in text
    const textContent = html.replace(/<[^>]*>/g, ' ');
    const dollarPrices = [...textContent.matchAll(/\$\s*(\d{1,4}(?:\.\d{1,2})?)/g)].map(m => m[1]);
    console.log('   Dollar prices found in text:', dollarPrices.slice(0, 20));

    // Check for DZD prices in text
    const dzdPrices = [...textContent.matchAll(/([\d,]+)\s*(?:DA|DZD|دج)/gi)].map(m => m[1]);
    console.log('   DZD prices found in text:', dzdPrices.slice(0, 20));

    // Save HTML for analysis
    const fs = await import('fs');
    fs.writeFileSync('/home/z/my-project/download/share-url-html.html', html);
    console.log('\n10. HTML saved to /home/z/my-project/download/share-url-html.html');

    // Show first 3000 chars of HTML
    console.log('\n11. First 3000 chars of HTML:');
    console.log(html.slice(0, 3000));

  } catch (err) {
    console.error('Error:', err.message);
  }
}

testShareUrl();
