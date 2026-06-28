import ZAI from 'z-ai-web-dev-sdk';

const GOODS_ID = '601105214745191';

async function testWebSearch() {
  console.log('=== Testing ZAI Web Search ===\n');

  const zai = await ZAI.create();

  // Test different search queries
  const queries = [
    `site:temu.com "g-${GOODS_ID}"`,
    `site:temu.com ${GOODS_ID}`,
    `temu ${GOODS_ID} price`,
  ];

  for (const query of queries) {
    console.log(`\n--- Search: ${query} ---`);
    try {
      const results = await zai.invokeFunction('web_search', {
        query,
        num: 5,
      });

      if (!Array.isArray(results) || results.length === 0) {
        console.log('No results');
        continue;
      }

      for (const r of results) {
        console.log(`  Title: ${r.name || 'No title'}`);
        console.log(`  URL: ${r.url || 'No URL'}`);
        console.log(`  Snippet: ${r.snippet || 'No snippet'}`);
        console.log();
      }
    } catch (err) {
      console.log(`Error: ${err.message}`);
    }
  }
}

testWebSearch();
