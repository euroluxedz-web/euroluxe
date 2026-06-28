import ZAI from 'z-ai-web-dev-sdk';

const GOODS_ID = '601105214745191';
const RESOLVED_URL = 'https://www.temu.com/dz-en/goods.html?_bg_fs=1&goods_id=601105214745191&share_img=https%3A%2F%2Fimg.kwcdn.com%2Fproduct%2Ffancy%2Fbda56930-a7c3-4991-be8c-89c9790b45d8.jpg&top_gallery_url=https%3A%2F%2Fimg.kwcdn.com%2Fproduct%2Ffancy%2Fbda56930-a7c3-4991-be8c-89c9790b45d8.jpg&_x_sessn=us&currency=USD';

async function analyzeResolvedPage() {
  const zai = await ZAI.create();
  
  console.log('=== Reading resolved share URL ===');
  const result = await zai.invokeFunction('page_reader', { url: RESOLVED_URL });
  const data = typeof result === 'string' ? JSON.parse(result) : result;
  const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;
  
  if (!content) {
    console.log('No content');
    return;
  }
  
  console.log('Content length:', content.length);
  
  // Save for manual inspection
  const fs = await import('fs');
  fs.writeFileSync('/home/z/my-project/download/resolved-page.html', content);
  
  // Deep search for ANY price-related data
  console.log('\n=== Deep price search ===');
  
  // 1. All "price" fields with different quote styles
  const priceFields = [...content.matchAll(/["'](?:minPrice|salePrice|price|marketPrice|origPrice|appPrice|displayPrice|normalPrice|priceNum|skuPrice|retailPrice|discountPrice)["']\s*:\s*["']?(\d+\.?\d*)["']?/gi)];
  console.log('Price fields found:', priceFields.length);
  for (const m of priceFields) {
    console.log(`  ${m[0].slice(0, 80)}`);
  }
  
  // 2. Numeric "price" in JSON context (key: value)
  const numericPrice = [...content.matchAll(/"price"\s*:\s*(\d+)/g)];
  console.log('\nNumeric "price" fields:', numericPrice.length);
  for (const m of numericPrice.slice(0, 20)) {
    const ctx = content.slice(Math.max(0, m.index - 80), Math.min(content.length, m.index + 80));
    console.log(`  price=${m[1]} | context: ${ctx.replace(/\n/g, ' ').replace(/\s+/g, ' ').slice(0, 200)}`);
  }
  
  // 3. Search for "sku" with "price"
  const skuPrice = [...content.matchAll(/"sku(?:Id|Code|Name)?"\s*:\s*["']?(\w+)["']?\s*[^}]{0,300}?"price"\s*:\s*(\d+)/gi)];
  console.log('\nSKU with price:', skuPrice.length);
  for (const m of skuPrice.slice(0, 10)) {
    console.log(`  sku=${m[1]}, price=${m[2]}`);
  }
  
  // 4. Search for "amount" in cents-like patterns  
  const amountCents = [...content.matchAll(/"amount"\s*:\s*(\d{3,6})/g)];
  console.log('\n"amount" in cents range:', amountCents.length);
  for (const m of amountCents.slice(0, 20)) {
    console.log(`  amount=${m[1]} (${parseInt(m[1])/100} USD)`);
  }
  
  // 5. Search for "7.01" or "701" or "2103" (expected price)
  for (const pattern of ['7.01', '701', '2103', '210300']) {
    const idx = content.indexOf(pattern);
    if (idx >= 0) {
      const ctx = content.slice(Math.max(0, idx - 100), Math.min(content.length, idx + 100));
      console.log(`\n"${pattern}" found at ${idx}: ...${ctx.replace(/\n/g, ' ').slice(0, 250)}...`);
    }
  }
  
  // 6. Search for "30" as price context
  const price30ctx = [...content.matchAll(/["'](?:price|amount|cost|value)["']\s*:\s*["']?30(?:\.0{1,2})?["']?/gi)];
  console.log('\n"price: 30" patterns:', price30ctx.length);
  
  // 7. What does the rawData contain? Let's look more carefully
  const rawDataMatch = content.match(/window\.rawData\s*=\s*(\{[\s\S]*?\})\s*(?:;|window\.)/);
  if (rawDataMatch) {
    console.log('\n=== rawData analysis ===');
    const rawData = rawDataMatch[1];
    console.log('rawData length:', rawData.length);
    
    // Search for goods_id context
    const gidIdx = rawData.indexOf(GOODS_ID);
    if (gidIdx >= 0) {
      console.log('goods_id found in rawData');
      const extended = rawData.slice(Math.max(0, gidIdx - 5000), Math.min(rawData.length, gidIdx + 30000));
      
      // Find ALL numeric fields in this window
      const allNumeric = [...extended.matchAll(/"(\w+)"\s*:\s*"?(\d+\.?\d*)"?/g)];
      console.log('All numeric fields near goods_id (first 50):');
      for (const m of allNumeric.slice(0, 50)) {
        if (m[2].length <= 10) {  // Skip very long numbers (IDs etc)
          console.log(`  ${m[1]}: ${m[2]}`);
        }
      }
    }
    
    // Also search the entire rawData for price-like fields
    const allPriceLike = [...rawData.matchAll(/"(minPrice|salePrice|price|marketPrice|origPrice|appPrice|displayPrice|normalPrice|skuPrice|retailPrice|discountPrice|priceNum|lowPrice|highPrice)"\s*:\s*"?(\d+\.?\d*)"?/gi)];
    console.log('\nAll price-like fields in rawData:', allPriceLike.length);
    for (const m of allPriceLike) {
      console.log(`  ${m[1]}: ${m[2]}`);
    }
  }
  
  // 8. Let's also try the Temu API with cookies from page_reader
  // The page_reader session might have valid cookies
  console.log('\n=== Try reading a search result page ===');
  const searchResultUrl = 'https://www.temu.com/de-en/random-12pcs-10pcs-7pcs-simple-old-money-style-vintage-elegant-irregular-pattern-bow-twist-leopard-print-bracelet-set-for-women-for-dates-vacations-daily-wear-parties-and-anniversary-gifts-g-601105214745191.html';
  const deResult = await zai.invokeFunction('page_reader', { url: searchResultUrl });
  const deData = typeof deResult === 'string' ? JSON.parse(deResult) : deResult;
  const deContent = deData?.data?.content || deData?.data?.text || deData?.data?.html || deData?.content || deData?.text || deData?.html;
  
  if (deContent) {
    console.log('DE page content length:', deContent.length);
    const deTitle = deContent.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
    console.log('DE page title:', deTitle || 'none');
    
    // Search for priceInfo
    const dePi = [...deContent.matchAll(/"priceInfo"\s*:\s*\{[^}]*?"price"\s*:\s*(\d+)[^}]*?"currency"\s*:\s*"([A-Z]{3})"/g)];
    console.log('DE priceInfo blocks:', dePi.length);
    for (const pi of dePi.slice(0, 10)) {
      console.log(`  ${pi[2]} ${parseInt(pi[1])/100} (${pi[1]} cents)`);
    }
    
    // Search for price in visible text
    const deText = deContent.replace(/<[^>]*>/g, ' ');
    const deDollar = [...deText.matchAll(/\$\s*([\d,]+(?:\.\d{1,2})?)/g)].map(m => m[1]);
    console.log('DE $ prices:', [...new Set(deDollar)].slice(0, 20).join(', '));
    
    const deEuro = [...deText.matchAll(/€\s*([\d,]+(?:\.\d{1,2})?)/g)].map(m => m[1]);
    console.log('DE € prices:', [...new Set(deEuro)].slice(0, 20).join(', '));
    
    // Search for minPrice/salePrice
    const dePriceFields = [...deContent.matchAll(/"(minPrice|salePrice|price|marketPrice)"\s*:\s*"?(\d+\.?\d*)"?/gi)];
    console.log('DE price fields:', dePriceFields.length);
    for (const m of dePriceFields.slice(0, 20)) {
      console.log(`  ${m[1]}: ${m[2]}`);
    }
  }
}

analyzeResolvedPage();
