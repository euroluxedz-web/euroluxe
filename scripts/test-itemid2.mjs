import ZAI from "z-ai-web-dev-sdk";

const itemId = "TV10922608";

console.log(`=== Testing Item ID Alternative Approaches ===\n`);

const zai = await ZAI.create();

// Approach 1: Read the Temu Item ID page
console.log("--- Approach 1: Page Reader on /-i- URL ---");
try {
  const itemUrl = `https://www.temu.com/-i-${itemId}.html`;
  const pageResult = await zai.invokeFunction("page_reader", {
    url: itemUrl,
  });
  
  const data = typeof pageResult === "string" ? JSON.parse(pageResult) : pageResult;
  const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;
  
  if (content) {
    console.log(`Content length: ${content.length}`);
    
    // Search for goods_id in the content
    const gidMatches = [...content.matchAll(/goods_id[":\s]+(\d{10,})/g)];
    console.log(`goods_id mentions:`, [...new Set(gidMatches.map(m => m[1]))]);
    
    // Search for -g- pattern
    const gPatternMatches = [...content.matchAll(/-g-(\d{10,})/g)];
    console.log(`-g- patterns:`, [...new Set(gPatternMatches.map(m => m[1]))]);
    
    // Strip HTML and search for text
    const text = content
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    
    console.log(`Visible text length: ${text.length}`);
    console.log(`First 500 chars: ${text.slice(0, 500)}`);
    
    // Search for product name
    const productName = text.match(/(8pcs|sunglasses|glasses).{0,50}/i);
    console.log(`Product name hint: ${productName?.[0]?.slice(0, 60) || "NOT FOUND"}`);
  }
} catch (err) {
  console.log(`Error: ${err.message}`);
}

// Approach 2: Search with more specific terms
console.log("\n--- Approach 2: Search for Item ID on Temu ---");
try {
  const searchResults = await zai.invokeFunction("web_search", {
    query: `temu.com -i-${itemId}`,
    num: 5,
  });
  
  if (Array.isArray(searchResults)) {
    for (const r of searchResults) {
      console.log(`  ${r.name?.slice(0, 60)}`);
      console.log(`  URL: ${r.url}`);
      console.log(`  Snippet: ${r.snippet?.slice(0, 150)}`);
      
      // Try to extract goods_id from URL
      const gMatch = r.url.match(/-g-(\d{10,})/);
      if (gMatch) {
        console.log(`  → Found goods_id: ${gMatch[1]}`);
      }
    }
  }
} catch (err) {
  console.log(`Error: ${err.message}`);
}

// Approach 3: Try the Temu search page
console.log("\n--- Approach 3: Page Reader on Temu search page ---");
try {
  const searchUrl = `https://www.temu.com/search?q=${itemId}`;
  const pageResult = await zai.invokeFunction("page_reader", {
    url: searchUrl,
  });
  
  const data = typeof pageResult === "string" ? JSON.parse(pageResult) : pageResult;
  const content = data?.data?.content || data?.data?.text || data?.data?.html || data?.content || data?.text || data?.html;
  
  if (content) {
    console.log(`Content length: ${content.length}`);
    
    // Strip HTML and search for text
    const text = content
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    
    // Search for goods_id or -g- pattern
    const gidMatches = [...text.matchAll(/(\d{10,})/g)];
    const numericIds = [...new Set(gidMatches.map(m => m[1]))].filter(id => id.length >= 10 && id.length <= 15);
    console.log(`Long numeric IDs found: ${numericIds.slice(0, 5)}`);
    
    // Search for TV10922608
    const tvMatch = text.match(/TV10922608/i);
    console.log(`Item ID found in search results: ${!!tvMatch}`);
  }
} catch (err) {
  console.log(`Error: ${err.message}`);
}
