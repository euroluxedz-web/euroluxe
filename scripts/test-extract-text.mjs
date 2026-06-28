import ZAI from "z-ai-web-dev-sdk";

const shareUrl = "https://share.temu.com/iEXtmO1ZX5B";

console.log("=== Extract visible text and find price ===\n");

const zai = await ZAI.create();

const pageResult = await zai.invokeFunction("page_reader", {
  url: shareUrl,
});

const data = typeof pageResult === "string" ? JSON.parse(pageResult) : pageResult;
const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;

if (!content) {
  console.log("No content!");
  process.exit(1);
}

console.log("Total content length:", content.length);

// Strip HTML tags, CSS, and JavaScript to get visible text
let text = content
  // Remove <style> tags and their content
  .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
  // Remove <script> tags and their content
  .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
  // Remove all HTML tags
  .replace(/<[^>]+>/g, " ")
  // Decode HTML entities
  .replace(/&nbsp;/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&#\d+;/g, "")
  // Collapse whitespace
  .replace(/\s+/g, " ")
  .trim();

console.log("Text length after stripping:", text.length);

// Now search for price patterns in the visible text
console.log("\n--- Price patterns in visible text ---");

// 1. Dollar amounts
const dollarAmounts = [...text.matchAll(/\$\s*(\d{1,5}(?:[.,]\d{1,2})?)/g)];
console.log("\nDollar amounts:");
for (const m of dollarAmounts.slice(0, 30)) {
  const val = parseFloat(m[1].replace(/,/g, ""));
  if (val >= 0.5 && val <= 500) {
    console.log(`  ${m[0]} (val: ${val})`);
  }
}

// 2. DA/DZD amounts
const daAmounts = [...text.matchAll(/([\d,]+(?:\.\d{1,2})?)\s*(?:DA|DZD|da|dzd)/g)];
console.log("\nDA/DZD amounts:");
for (const m of daAmounts.slice(0, 30)) {
  const val = parseFloat(m[1].replace(/,/g, ""));
  if (val >= 1 && val <= 100000) {
    console.log(`  ${m[0]} (val: ${val})`);
  }
}

// 3. Look for "OFF" patterns (Temu shows "67% OFF")
const offPatterns = [...text.matchAll(/(\d+)\s*%\s*OFF/gi)];
console.log("\nDiscount patterns:");
for (const m of offPatterns.slice(0, 10)) {
  console.log(`  ${m[0]}`);
}

// 4. Look for "Sold" or "bought" patterns
const soldPatterns = [...text.matchAll(/(\d{1,3}(?:,\d{3})*)\s*(?:sold|bought|bought\+)/gi)];
console.log("\nSold/bought patterns:");
for (const m of soldPatterns.slice(0, 10)) {
  console.log(`  ${m[0]}`);
}

// 5. Look for any number followed by "free shipping"
const freeShipping = text.match(/free shipping/i);
console.log("\nFree shipping found:", !!freeShipping);

// 6. Search for specific product name
const productNameMatch = text.match(/8pcs[^.]*sunglasses/i);
console.log("\nProduct name found:", productNameMatch?.[0]?.slice(0, 80) || "NOT FOUND");

// 7. Try to find the first 2000 chars of visible text
console.log("\n--- First 2000 chars of visible text ---");
console.log(text.slice(0, 2000));

// 8. Search around "8pcs" or "sunglasses" keywords
const keywords = ["8pcs", "sunglasses", "UV400", "glasses"];
for (const kw of keywords) {
  const idx = text.toLowerCase().indexOf(kw.toLowerCase());
  if (idx >= 0) {
    const context = text.slice(Math.max(0, idx - 100), Math.min(text.length, idx + 200));
    console.log(`\nContext around "${kw}": ...${context}...`);
  }
}

