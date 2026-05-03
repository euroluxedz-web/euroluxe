import { NextRequest, NextResponse } from "next/server";

const RATE = 300;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function tryPageReader(zai: any, url: string): Promise<{ title: string; text: string } | null> {
  try {
    const result = await zai.functions.invoke("page_reader", { url });
    if (result?.data?.html) {
      const plainText = result.data.html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/\s+/g, " ").trim();
      return { title: result.data.title || "", text: plainText };
    }
  } catch (err) {
    console.error("[page_reader] failed for", url, String(err).slice(0, 100));
  }
  return null;
}

async function tryWebSearch(zai: any, query: string, num = 5): Promise<string> {
  try {
    const result = await zai.functions.invoke("web_search", { query, num });
    return result ? (typeof result === "string" ? result : JSON.stringify(result)) : "";
  } catch (err) {
    console.error("[web_search] failed:", String(err).slice(0, 100));
    return "";
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, productId } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Veuillez fournir un lien ou un code produit valide" }, { status: 400 });
    }

    try { new URL(url); } catch {
      return NextResponse.json({ error: "Le format du lien est invalide" }, { status: 400 });
    }

    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();

    const parsedUrl = new URL(url);
    const domain = parsedUrl.hostname;
    const isTemu = domain.includes("temu");
    const isAliExpress = domain.includes("aliexpress");

    const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);
    const productSlug = pathSegments.find((s) => s.includes("-") && s.length > 10) || "";
    const lastSegment = pathSegments[pathSegments.length - 1]?.replace(/\.html$/, "") || "";
    const numericId = lastSegment.match(/\d{10,}/)?.[0] || lastSegment;
    const readableName = productSlug.replace(/-/g, " ").replace(/\.\w+$/, "");

    let allContent = "";
    let pageTitle = "";
    let exactPriceFound = false;

    // ─── Strategy 1: page_reader on original URL ───
    const page1 = await tryPageReader(zai, url);
    if (page1) {
      pageTitle = page1.title;
      allContent += page1.text + "\n";
      // Check if price is in the page content
      if (/\$\s*\d+\.?\d{0,2}/.test(page1.text)) exactPriceFound = true;
      console.log("[1] page_reader:", page1.text.length, "chars");
    }

    // ─── Strategy 2: For AliExpress, try page_reader (usually works) ───
    if (isAliExpress && !exactPriceFound) {
      // AliExpress pages are more readable
      const cleanUrl = `${parsedUrl.origin}${parsedUrl.pathname}`;
      if (cleanUrl !== url) {
        const page2 = await tryPageReader(zai, cleanUrl);
        if (page2) {
          allContent += page2.text + "\n";
          if (/\$\s*\d+\.?\d{0,2}/.test(page2.text)) exactPriceFound = true;
          if (!pageTitle) pageTitle = page2.title;
          console.log("[2] AliExpress page_reader:", page2.text.length, "chars");
        }
      }
    }

    // ─── Strategy 3: web_search with price-focused queries ───
    const searchQueries: string[] = [];

    if (productId) {
      searchQueries.push(`temu product ${productId} price $`);
    }
    if (isTemu) {
      if (numericId) searchQueries.push(`temu ${numericId} price USD $`);
      if (readableName) {
        searchQueries.push(`site:temu.com "${readableName.slice(0, 50)}" $ price`);
        searchQueries.push(`temu "${readableName.slice(0, 40)}" how much does it cost dollar`);
      }
      // Search for similar products with visible prices
      searchQueries.push(`temu oval metal frame fashion glasses price $ buy`);
    }
    if (isAliExpress) {
      const itemId = parsedUrl.searchParams.get("item_id") || lastSegment;
      searchQueries.push(`aliexpress ${itemId} price USD`);
      if (readableName) searchQueries.push(`site:aliexpress.com "${readableName.slice(0, 50)}" price`);
    }

    for (const query of searchQueries.slice(0, 4)) {
      if (exactPriceFound) break;
      await delay(300);
      const searchResult = await tryWebSearch(zai, query, 8);
      if (searchResult) {
        allContent += searchResult + "\n";
        if (/\$\s*\d+\.?\d{0,2}/.test(searchResult)) exactPriceFound = true;
        console.log("[3] web_search:", query.slice(0, 50), "->", searchResult.length, "chars");
      }
    }

    // ─── Strategy 4: Try page_reader on search result URLs ───
    if (!exactPriceFound && allContent.length > 50) {
      const urlMatches = allContent.match(/https?:\/\/[^\s"']+/g);
      // Prioritize URLs from search results that might have prices (category pages, product pages)
      const candidateUrls = (urlMatches || []).filter(u =>
        u.includes("temu.com") || u.includes("aliexpress")
      ).slice(0, 2);

      for (const resultUrl of candidateUrls) {
        await delay(500);
        const page = await tryPageReader(zai, resultUrl);
        if (page) {
          allContent += page.text + "\n";
          if (/\$\s*\d+\.?\d{0,2}/.test(page.text)) exactPriceFound = true;
          console.log("[4] Secondary page_reader:", page.text.length, "chars");
          if (exactPriceFound) break;
        }
      }
    }

    console.log("[total] content:", allContent.length, "chars, exactPrice:", exactPriceFound);

    if (allContent.length < 20) {
      return NextResponse.json(
        { error: "Nous n'avons pas pu accéder à cette page. Veuillez vérifier le lien et réessayer." },
        { status: 404 }
      );
    }

    // ─── Strategy 5: AI extraction with price estimation fallback ───
    const truncatedContent = allContent.slice(0, 18000);
    const productContext = productId
      ? `Temu product ID: ${productId}. URL: ${url}`
      : isTemu
        ? `Temu product. Name: ${readableName}. ID: ${numericId}. URL: ${url}`
        : `URL: ${url}`;

    // Always use smart extraction + estimation for Temu (since they block direct scraping)
    // For AliExpress, try exact extraction first
    const useEstimation = isTemu || !exactPriceFound;

    const systemPrompt = useEstimation
      ? `You are a price extraction and estimation expert for e-commerce products.

The product page uses JavaScript to load prices dynamically, so the exact price may not be in the HTML.

Your task: Find or ESTIMATE the price based on ALL available information:
1. Any "$XX.XX" prices found in search results or page content (pick the most relevant one for THIS product)
2. Product name, category, and description from the URL and search snippets
3. Known typical price ranges for such products on Temu/AliExpress
4. Any discount hints ("13% OFF", "74% OFF", "ALMOST SOLD OUT")
5. Foreign currency amounts (convert to USD): 1 USD ≈ 10 MAD ≈ 3.67 AED ≈ 0.38 OMR ≈ 47 PHP ≈ 1500 KRW

PRICE RANGES by category on Temu:
- Fashion accessories (glasses, jewelry, hair clips): $1-$8
- Fashion glasses specifically: $2-$6
- Clothing (dresses, tops, pants): $3-$15
- Shoes: $5-$25
- Electronics: $5-$50
- Home & garden: $2-$20
- Bags & wallets: $3-$15

CRITICAL: If you see dollar amounts in the content, pick the one that matches THIS specific product (not random prices from other products or ads). When in doubt, estimate based on the product category.

Return ONLY valid JSON:
{"price": 3.99, "currency": "USD", "productName": "Product Name", "estimated": true}
Or if exact price found: {"price": 3.99, "currency": "USD", "productName": "Product Name", "estimated": false}
If truly impossible: {"price": null, "error": "Cannot estimate"}`
      : `You are a price extraction expert. Extract the EXACT product price from the content below.
RULES:
- Find the price in USD. Convert from other currencies if needed.
- Use the CURRENT/SALE price, not the original price.
- Look for: "$XX.XX", "XX.XX USD", "price": XX.XX, sale_price, etc.
- Return ONLY valid JSON: {"price": 2.99, "currency": "USD", "productName": "Product Name", "estimated": false}
- If price not found: {"price": null, "error": "Price not found"}`;

    const completion = await zai.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Extract/estimate price for: ${productContext}\n\nContent:\n${truncatedContent}` },
      ],
    });

    const responseText = completion.choices?.[0]?.message?.content || "";
    console.log("[AI] response:", responseText.slice(0, 400));

    let parsedResult;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsedResult = JSON.parse(jsonMatch[0]);
    } catch {
      const numberMatch = responseText.match(/(?:price|prix|cost)[:\s]*\$?(\d+\.?\d*)/i);
      if (numberMatch) parsedResult = { price: parseFloat(numberMatch[1]), currency: "USD" };
    }

    // Last resort: find $XX.XX in raw content
    if (!parsedResult?.price || parsedResult.price <= 0) {
      const pricePatterns = allContent.match(/\$\s*(\d+\.?\d{0,2})/g);
      if (pricePatterns?.length) {
        const prices = pricePatterns.map(p => parseFloat(p.replace("$", "").trim())).filter(p => p > 0.5 && p < 10000);
        if (prices.length) {
          parsedResult = { price: Math.min(...prices), currency: "USD", productName: parsedResult?.productName || pageTitle || null };
        }
      }
    }

    if (!parsedResult?.price || parsedResult.price <= 0) {
      return NextResponse.json(
        { error: "Nous n'avons pas pu extraire le prix de ce produit. Veuillez vérifier le lien ou le code produit et réessayer." },
        { status: 404 }
      );
    }

    // Convert to USD if needed
    let priceUSD = parsedResult.price;
    if (parsedResult.currency?.toUpperCase() !== "USD") {
      const rates: Record<string, number> = {
        EUR: 1.08, GBP: 1.27, CNY: 0.14, JPY: 0.0067,
        CAD: 0.74, AUD: 0.65, INR: 0.012, DZD: 0.0075,
        MAD: 0.1, AED: 0.27, NZD: 0.6, MUR: 0.022,
        OMR: 2.6, PHP: 0.017, NGN: 0.00065, KRW: 0.00074,
      };
      const rate = rates[parsedResult.currency.toUpperCase()];
      if (rate) priceUSD = parsedResult.price * rate;
    }

    // Clean up product name
    let productName = parsedResult.productName || pageTitle || null;
    if (productName) {
      // Remove "Temu | Login" or generic titles
      if (/login|sign in|register/i.test(productName)) productName = null;
      // Clean up Temu slug-style names
      if (productName && productName.length > 80) {
        productName = productName.split(/\s+(g|G)\s+\d+$/)[0] || productName.slice(0, 60);
      }
      // Capitalize first letter of each word
      if (productName) {
        productName = productName.replace(/\b\w/g, (l: string) => l.toUpperCase());
      }
    }

    return NextResponse.json({
      price: Math.round(priceUSD * 100) / 100,
      dzd: Math.round(priceUSD * RATE * 100) / 100,
      productName,
      estimated: parsedResult.estimated || false,
    });
  } catch (error) {
    console.error("[scrape-price] Fatal error:", error);
    return NextResponse.json(
      { error: "Une erreur est survenue lors de l'analyse. Veuillez réessayer plus tard." },
      { status: 500 }
    );
  }
}
