import { NextRequest, NextResponse } from "next/server";

const RATE = 300;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "Veuillez fournir un lien valide" },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: "Le format du lien est invalide" },
        { status: 400 }
      );
    }

    // Use z-ai-web-dev-sdk to scrape the price
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();

    // Step 1: Fetch the page content using web_reader
    let pageContent = "";
    try {
      const webReaderResult = await zai.functions.invoke("web_reader", { url });
      if (webReaderResult && typeof webReaderResult === "object") {
        pageContent = JSON.stringify(webReaderResult);
      } else if (typeof webReaderResult === "string") {
        pageContent = webReaderResult;
      }
    } catch (err) {
      console.error("Web reader failed:", err);
    }

    // Step 2: If web_reader didn't return useful content, try web search
    if (!pageContent || pageContent.length < 50) {
      try {
        const domain = new URL(url).hostname;
        const pathSegments = new URL(url).pathname.split("/").filter(Boolean);
        const productHint = pathSegments[pathSegments.length - 1] || domain;

        const searchResult = await zai.functions.invoke("web_search", {
          query: `site:${domain} ${productHint} price`,
        });

        if (searchResult) {
          pageContent = typeof searchResult === "string"
            ? searchResult
            : JSON.stringify(searchResult);
        }
      } catch (err) {
        console.error("Web search failed:", err);
      }
    }

    // Step 3: Use AI to extract the price from the content
    const truncatedContent = pageContent.slice(0, 15000);

    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            'You are a price extractor. Given a product URL and page content, extract the product price in USD. Return ONLY a valid JSON object like {"price": 29.99, "currency": "USD", "productName": "Product Name"}. If the price is in another currency, convert it to USD. If you cannot find the price, return {"price": null, "error": "Price not found"}. Do NOT include any other text, just the JSON.',
        },
        {
          role: "user",
          content: `Extract the price from this product page for URL: ${url}\n\nPage content: ${truncatedContent}`,
        },
      ],
    });

    const responseText =
      completion.choices?.[0]?.message?.content || "";

    // Parse the AI response to extract price
    let parsedResult;
    try {
      // Try to find JSON in the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResult = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // If JSON parsing fails, try to extract a number from the response
      const numberMatch = responseText.match(
        /(?:price|prix|cost|amount)[:\s]*\$?(\d+\.?\d*)/i
      );
      if (numberMatch) {
        parsedResult = {
          price: parseFloat(numberMatch[1]),
          currency: "USD",
        };
      }
    }

    if (!parsedResult || !parsedResult.price || parsedResult.price <= 0) {
      return NextResponse.json(
        {
          error:
            "Nous n'avons pas pu extraire le prix de ce produit. Veuillez vérifier le lien ou réessayer manuellement.",
        },
        { status: 404 }
      );
    }

    // Convert to USD if needed
    let priceUSD = parsedResult.price;
    if (
      parsedResult.currency &&
      parsedResult.currency.toUpperCase() !== "USD"
    ) {
      // Simple conversion estimates for common currencies
      const rates: Record<string, number> = {
        EUR: 1.08,
        GBP: 1.27,
        CNY: 0.14,
        JPY: 0.0067,
        CAD: 0.74,
        AUD: 0.65,
        INR: 0.012,
      };
      const rate = rates[parsedResult.currency.toUpperCase()];
      if (rate) {
        priceUSD = parsedResult.price * rate;
      }
    }

    return NextResponse.json({
      price: Math.round(priceUSD * 100) / 100,
      dzd: Math.round(priceUSD * RATE * 100) / 100,
      productName: parsedResult.productName || null,
    });
  } catch (error) {
    console.error("Scrape price error:", error);
    return NextResponse.json(
      {
        error:
          "Une erreur est survenue lors de l'analyse. Veuillez réessayer plus tard.",
      },
      { status: 500 }
    );
  }
}
