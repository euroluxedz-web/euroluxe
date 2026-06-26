import ZAI from 'z-ai-web-dev-sdk';

const urls = [
  "https://seller.kuajingmaihuo.com/apis/document",
  "https://seller.kuajingmaihuo.com/apis/document/sign",
  "https://open-api.temu.com/document",
  "https://affiliate.temu.com/api-docs",
  "https://www.temu.com/affiliate-api-document"
];

async function main() {
  const zai = await ZAI.create();
  
  for (const url of urls) {
    console.log(`\n=== Reading: ${url} ===`);
    try {
      const result = await zai.functions.invoke('page_reader', { url });
      console.log('Title:', result.data?.title);
      const text = (result.data?.html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 2000);
      console.log('Content preview:', text);
    } catch(err) {
      console.error(`Failed: ${err.message}`);
    }
  }
}

main();
