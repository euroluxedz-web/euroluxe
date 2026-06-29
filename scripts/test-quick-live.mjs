/**
 * Quick test: One share URL
 */
const BASE_URL = "https://my-project-lime-pi.vercel.app";

async function main() {
  console.log("Testing share URL...");
  const start = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/api/scrape-price`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://share.temu.com/iEXtmO1ZX5B" }),
    });
    const data = await res.json();
    console.log(`Time: ${((Date.now() - start) / 1000).toFixed(1)}s`);
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}

main();
