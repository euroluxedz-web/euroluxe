import fs from 'fs';

const content = fs.readFileSync('/home/z/my-project/download/page-reader-goods-api-us.html', 'utf-8');
console.log('Content length:', content.length);

// 1. Page title
const title = content.match(/<title[^>]*>([^<]+)<\/title>/i);
console.log('Title:', title?.[1] || 'none');

// 2. Search for ANY price-related text
console.log('\n=== Price-related text patterns ===');

// Dollar amounts
const dollarMatches = [...content.matchAll(/\$\s*([\d,]+(?:\.\d{1,2})?)/g)];
console.log(`$ prices: ${dollarMatches.length}`);
const dollarValues = dollarMatches.map(m => ({ str: m[0], value: parseFloat(m[1].replace(/,/g, '')) }));
const uniqueDollar = [...new Set(dollarValues.map(v => v.str))].sort();
console.log(`Unique $ amounts: ${uniqueDollar.join(', ')}`);

// DA/DZD amounts
const daMatches = [...content.matchAll(/([\d,]+)\s*(?:DA|DZD|د\.ج|دج)/gi)];
console.log(`\nDA prices: ${daMatches.length}`);
const daValues = daMatches.map(m => ({ str: m[0], value: parseFloat(m[1].replace(/,/g, '')) }));
const uniqueDA = [...new Set(daValues.map(v => v.str))].sort();
console.log(`Unique DA amounts: ${uniqueDA.join(', ')}`);

// 3. Search for specific number 3000 (which would be $30.00 in cents)
const n3000 = [...content.matchAll(/\b3000\b/g)];
console.log(`\n"3000" occurrences: ${n3000.length}`);
for (const m of n3000.slice(0, 5)) {
  const ctx = content.slice(Math.max(0, m.index - 100), Math.min(content.length, m.index + 100));
  console.log(`  ...${ctx.replace(/\n/g, ' ').slice(0, 200)}...`);
}

// 4. Search for "9,000" or "9000" 
const n9000 = [...content.matchAll(/\b9[,]?000\b/g)];
console.log(`\n"9,000/9000" occurrences: ${n9000.length}`);
for (const m of n9000.slice(0, 5)) {
  const ctx = content.slice(Math.max(0, m.index - 100), Math.min(content.length, m.index + 100));
  console.log(`  ...${ctx.replace(/\n/g, ' ').slice(0, 200)}...`);
}

// 5. Search for "credit" or "delay" (delivery guarantee)
const creditMatches = [...content.matchAll(/credit[^.]{0,100}/gi)];
console.log(`\n"credit" occurrences: ${creditMatches.length}`);
for (const m of creditMatches.slice(0, 5)) {
  console.log(`  ${m[0].slice(0, 150)}`);
}

// 6. Search for "delivery" + "guarantee"
const deliveryMatches = [...content.matchAll(/deliver[^.]{0,50}(?:guarantee|credit|refund)/gi)];
console.log(`\n"delivery guarantee" occurrences: ${deliveryMatches.length}`);
for (const m of deliveryMatches.slice(0, 5)) {
  console.log(`  ${m[0].slice(0, 150)}`);
}

// 7. Search for "30" as a price context
const price30 = [...content.matchAll(/(?:price|cost|\$)\s*[=:]*\s*["']?30(?:\.0{1,2})?/gi)];
console.log(`\n"price 30" patterns: ${price30.length}`);

// 8. Search for text content with "30" near price context
const text = content.replace(/<[^>]*>/g, ' ');
const text30 = [...text.matchAll(/30(?:\.00)?\s*(?:\$|USD|DA|DZD)/gi)];
console.log(`"30$ or 30DA" patterns: ${text30.length}`);

// Also reverse
const text30rev = [...text.matchAll(/(?:\$|USD|DA|DZD)\s*30(?:\.00)?/gi)];
console.log(`"$30 or DA30" patterns: ${text30rev.length}`);
for (const m of [...text30, ...text30rev].slice(0, 5)) {
  const ctx = text.slice(Math.max(0, m.index - 100), Math.min(text.length, m.index + 100));
  console.log(`  ...${ctx.replace(/\s+/g, ' ').slice(0, 250)}...`);
}

