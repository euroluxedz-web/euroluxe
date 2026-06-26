import ZAI from 'z-ai-web-dev-sdk';

const queries = [
  "Temu Ad Library API documentation",
  "temu.com ad library api endpoints",
  "temu affiliate api sign method documentation",
  "temu api signature generation app_key app_secret",
  "temu open api sign algorithm HMAC"
];

async function main() {
  const zai = await ZAI.create();
  const allResults = {};
  
  for (const q of queries) {
    console.log(`\n=== Searching: ${q} ===`);
    try {
      const results = await zai.functions.invoke('web_search', {
        query: q,
        num: 10
      });
      allResults[q] = results;
      if (Array.isArray(results)) {
        results.forEach((item, i) => {
          console.log(`${i+1}. ${item.name}`);
          console.log(`   URL: ${item.url}`);
          console.log(`   Snippet: ${item.snippet}`);
          console.log(`   Date: ${item.date}`);
          console.log('');
        });
      } else {
        console.log('Unexpected:', results);
      }
    } catch(err) {
      console.error(`Failed for "${q}":`, err.message);
      allResults[q] = { error: err.message };
    }
  }
  
  // Write all results to file
  const fs = await import('fs');
  fs.writeFileSync('/tmp/temu_all_results.json', JSON.stringify(allResults, null, 2));
  console.log('\n\nResults saved to /tmp/temu_all_results.json');
}

main();
