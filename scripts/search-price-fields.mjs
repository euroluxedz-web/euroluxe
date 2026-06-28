import fs from 'fs';

// Check the goods-api-us page (263KB) which is the page_reader content for the goods page
const content = fs.readFileSync('/home/z/my-project/download/page-reader-goods-api-us.html', 'utf-8');

// Search for ALL patterns that extractProductInfo would match
console.log('=== Step 2d: Embedded JSON price fields ===');
const fields = ['salePrice', 'minPrice', 'minAppPrice', 'appPrice', 'displayPrice', 'normalPrice'];
const found = [];
for (const f of fields) {
  const re = new RegExp(`"${f}"\\s*:\\s*"?([\\d.]+)"?`, 'g');
  for (const m of content.matchAll(re)) {
    const v = parseFloat(m[1]);
    if (v > 0 && v < 100000) {
      found.push({ value: v, field: f, raw: m[1], context: content.slice(Math.max(0, m.index - 50), Math.min(content.length, m.index + 50)).replace(/\n/g, ' ').replace(/\s+/g, ' ') });
    }
  }
}
if (found.length > 0) {
  found.sort((a, b) => a.value - b.value);
  for (const f of found) {
    const price = f.value > 100 ? f.value / 100 : f.value;
    console.log(`  ${f.field}: ${f.raw} → $${price} | context: ${f.context.slice(0, 150)}`);
  }
} else {
  console.log('No embedded price fields found');
}

// Also check the resolved page (395KB)
const content2 = fs.readFileSync('/home/z/my-project/download/resolved-page.html', 'utf-8');
console.log('\n=== Resolved page: Step 2d ===');
const found2 = [];
for (const f of fields) {
  const re = new RegExp(`"${f}"\\s*:\\s*"?([\\d.]+)"?`, 'g');
  for (const m of content2.matchAll(re)) {
    const v = parseFloat(m[1]);
    if (v > 0 && v < 100000) {
      found2.push({ value: v, field: f, raw: m[1], context: content2.slice(Math.max(0, m.index - 50), Math.min(content2.length, m.index + 50)).replace(/\n/g, ' ').replace(/\s+/g, ' ') });
    }
  }
}
if (found2.length > 0) {
  found2.sort((a, b) => a.value - b.value);
  for (const f of found2) {
    const price = f.value > 100 ? f.value / 100 : f.value;
    console.log(`  ${f.field}: ${f.raw} → $${price} | context: ${f.context.slice(0, 150)}`);
  }
} else {
  console.log('No embedded price fields found');
}

// Step 2e: Text dollar prices
console.log('\n=== Step 2e: Text dollar prices (goods-api-us) ===');
const text = content.replace(/<[^>]*>/g, ' ');
const matches = [...text.matchAll(/[£€$]\s*(\d{1,4}(?:[.,]\d{1,2})?)/g)];
const prices = [];
for (const m of matches) {
  const raw = m[1].replace(/,/g, '');
  const v = parseFloat(raw);
  if (v > 1.5 && v < 5000) {
    const cur = m[0].includes('£') ? 'GBP' : m[0].includes('€') ? 'EUR' : 'USD';
    prices.push({ value: v, currency: cur, original: m[0] });
  }
}
if (prices.length > 0) {
  prices.sort((a, b) => a.value - b.value);
  const filtered = prices.filter(p => !(p.value < 20 && p.value === Math.floor(p.value)));
  if (filtered.length > 0) {
    console.log('After filtering round prices < $20:', filtered[0].original);
  } else {
    console.log('All prices filtered out (round prices < $20)');
    console.log('Unfiltered prices:', prices.map(p => p.original).join(', '));
  }
}

// Step 2e: Text dollar prices (resolved page)
console.log('\n=== Step 2e: Text dollar prices (resolved page) ===');
const text2 = content2.replace(/<[^>]*>/g, ' ');
const matches2 = [...text2.matchAll(/[£€$]\s*(\d{1,4}(?:[.,]\d{1,2})?)/g)];
const prices2 = [];
for (const m of matches2) {
  const raw = m[1].replace(/,/g, '');
  const v = parseFloat(raw);
  if (v > 1.5 && v < 5000) {
    const cur = m[0].includes('£') ? 'GBP' : m[0].includes('€') ? 'EUR' : 'USD';
    prices2.push({ value: v, currency: cur, original: m[0] });
  }
}
if (prices2.length > 0) {
  prices2.sort((a, b) => a.value - b.value);
  console.log('All prices:', prices2.map(p => p.original).join(', '));
}

// Check the share-url page too
const content3 = fs.readFileSync('/home/z/my-project/download/page-reader-share-url.html', 'utf-8');
console.log('\n=== Share URL page: Step 2d ===');
const found3 = [];
for (const f of fields) {
  const re = new RegExp(`"${f}"\\s*:\\s*"?([\\d.]+)"?`, 'g');
  for (const m of content3.matchAll(re)) {
    const v = parseFloat(m[1]);
    if (v > 0 && v < 100000) {
      found3.push({ value: v, field: f, raw: m[1], context: content3.slice(Math.max(0, m.index - 50), Math.min(content3.length, m.index + 50)).replace(/\n/g, ' ').replace(/\s+/g, ' ') });
    }
  }
}
if (found3.length > 0) {
  found3.sort((a, b) => a.value - b.value);
  for (const f of found3) {
    const price = f.value > 100 ? f.value / 100 : f.value;
    console.log(`  ${f.field}: ${f.raw} → $${price} | context: ${f.context.slice(0, 150)}`);
  }
} else {
  console.log('No embedded price fields found');
}

