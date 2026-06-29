#!/usr/bin/env node
/**
 * Test the Temu BG API directly to see if it returns product data
 */

const GOODS_IDS = ['601101613236742', '601105214745191', '601102757183337'];

async function testBgApi(goodsId) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing BG API for goods_id: ${goodsId}`);
  console.log('='.repeat(60));
  
  const endpoints = [
    { url: 'https://www.temu.com/bg/goods/api', body: { goods_id: goodsId } },
    { url: 'https://www.temu.com/api/ego/product/detail', body: { goods_id: goodsId, _x_sessn: 'us' } },
  ];
  
  for (const endpoint of endpoints) {
    console.log(`\nEndpoint: ${endpoint.url}`);
    try {
      const res = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Origin': 'https://www.temu.com',
          'Referer': `https://www.temu.com/-g-${goodsId}.html`,
        },
        body: JSON.stringify(endpoint.body),
      });
      
      console.log(`  Status: ${res.status}`);
      const text = await res.text();
      console.log(`  Response length: ${text.length}`);
      
      if (text.length < 500) {
        console.log(`  Response: ${text}`);
        continue;
      }
      
      try {
        const data = JSON.parse(text);
        const goods = data?.result?.goods || data?.result?.data;
        if (goods) {
          console.log(`  Product name: ${goods.name || goods.goodsName || 'N/A'}`);
          console.log(`  minPrice: ${goods.minPrice}`);
          console.log(`  price: ${goods.price}`);
          console.log(`  marketPrice: ${goods.marketPrice}`);
          console.log(`  thumbUrl: ${goods.thumbUrl ? 'present' : 'N/A'}`);
          console.log(`  All keys: ${Object.keys(goods).join(', ')}`);
          
          // Find price-related fields
          for (const [key, value] of Object.entries(goods)) {
            if (/price|Price|cost|Cost|amount|Amount/i.test(key)) {
              console.log(`  ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
            }
          }
        } else {
          console.log(`  No goods data in response`);
          console.log(`  Response keys: ${Object.keys(data || {}).join(', ')}`);
          if (data?.result) {
            console.log(`  Result keys: ${Object.keys(data.result).join(', ')}`);
          }
          // Print first 500 chars
          console.log(`  Preview: ${text.substring(0, 500)}`);
        }
      } catch {
        console.log(`  Not JSON, first 500 chars: ${text.substring(0, 500)}`);
      }
    } catch (err) {
      console.log(`  Error: ${err.message}`);
    }
  }
}

async function main() {
  for (const goodsId of GOODS_IDS) {
    await testBgApi(goodsId);
  }
}

main().catch(console.error);
