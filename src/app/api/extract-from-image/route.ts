import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Extract product info (price, name, image) from a screenshot image.
 * Uses ZAI Vision API (glm-4v) for high-accuracy extraction.
 * Falls back to Tesseract.js for price-only extraction.
 */

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let imageBase64: string | null = null;
    let mimeType = "image/jpeg";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("image") as File | null;
      if (!file) {
        return NextResponse.json({ success: false, error: "No image file provided" }, { status: 400 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      imageBase64 = buffer.toString("base64");
      mimeType = file.type || "image/jpeg";
    } else {
      const body = await req.json();
      const dataUrl: string = body.image || body.dataUrl || "";
      if (!dataUrl) {
        return NextResponse.json({ success: false, error: "No image provided" }, { status: 400 });
      }
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        if (/^[A-Za-z0-9+/=]+$/.test(dataUrl)) {
          imageBase64 = dataUrl;
        } else {
          return NextResponse.json({ success: false, error: "Invalid image format" }, { status: 400 });
        }
      } else {
        mimeType = match[1];
        imageBase64 = match[2];
      }
    }

    if (imageBase64.length > 7_000_000) {
      return NextResponse.json({ success: false, error: "Image too large (max 5MB)" }, { status: 413 });
    }

    console.log(`[ExtractImage] Processing image (${imageBase64.length} bytes, ${mimeType})`);

    // Strategy 1: ZAI Vision API (extracts price, name, and detects product image)
    const zaiResult = await extractWithZaiVlm(imageBase64, mimeType);
    if (zaiResult && zaiResult.price !== null) {
      console.log(`[ExtractImage] ✓ ZAI VLM: price=$${zaiResult.price}, name="${zaiResult.productName?.substring(0, 40)}"`);
      return NextResponse.json({
        success: true,
        price: zaiResult.price,
        currency: zaiResult.currency || "USD",
        productName: zaiResult.productName || null,
        productImage: zaiResult.productImage || null,
        method: "zai_vlm",
        confidence: zaiResult.confidence || 0.9,
      });
    }

    // Strategy 2: Tesseract.js (price only, no product name/image)
    const tessResult = await extractWithTesseract(imageBase64);
    if (tessResult && tessResult.price !== null) {
      console.log(`[ExtractImage] ✓ Tesseract: price=$${tessResult.price}`);
      return NextResponse.json({
        success: true,
        price: tessResult.price,
        currency: "USD",
        productName: null,
        productImage: null,
        method: "tesseract",
        confidence: 0.7,
      });
    }

    return NextResponse.json({
      success: false,
      error: "Could not extract product info from image. Make sure the screenshot shows a clear product page with price.",
    });
  } catch (e: any) {
    console.error("[ExtractImage] Fatal error:", e);
    return NextResponse.json({ success: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}

async function extractWithZaiVlm(imageBase64: string, mimeType: string) {
  try {
    const zaiToken = process.env.ZAI_TOKEN || process.env.ZAI_API_KEY;
    if (!zaiToken) {
      console.log("[ExtractImage] ZAI token not configured, trying Tesseract...");
      return null;
    }

    const zaiBaseUrl = "https://api.z.ai/api/paas/v4";
    const prompt = `You are an AI assistant that extracts product information from e-commerce screenshots (Temu, SHEIN, Amazon, etc).

Look at this screenshot and extract:
1. Product price (the SALE/discounted price, not original/strikethrough)
2. Product name/title
3. Currency (USD, EUR, GBP, DZD)

Return ONLY a JSON object:
{
  "price": <number or null>,
  "currency": "USD" | "EUR" | "GBP" | "DZD" | null,
  "productName": "<product name or null>",
  "confidence": <0-1>
}

Rules:
- Look for "US $X.XX", "$X.XX", "€X.XX", "£X.XX" patterns
- Ignore shipping prices, credits, and original prices (strikethrough)
- If you can't find a price, return {"price": null, "currency": null, "productName": null, "confidence": 0}
- Return ONLY the JSON, no other text`;

    const res = await fetch(`${zaiBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${zaiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "glm-4v",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
          ],
        }],
        max_tokens: 300,
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      console.log(`[ExtractImage] ZAI error: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        price: typeof parsed.price === "number" ? parsed.price : null,
        currency: parsed.currency || null,
        productName: parsed.productName || null,
        productImage: null, // VLM doesn't extract image URL
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.8,
      };
    } catch {
      return null;
    }
  } catch (e) {
    console.log(`[ExtractImage] ZAI error: ${String(e).slice(0, 100)}`);
    return null;
  }
}

async function extractWithTesseract(imageBase64: string) {
  try {
    const Tesseract = await import("tesseract.js").catch(() => null);
    if (!Tesseract) return null;

    const { createWorker } = Tesseract;
    const worker = await createWorker("eng");
    const buffer = Buffer.from(imageBase64, "base64");
    const { data } = await worker.recognize(buffer);
    await worker.terminate();

    const text = data?.text || "";
    console.log("[ExtractImage] Tesseract text:", text.substring(0, 200));

    // Extract price from text
    const patterns = [
      { name: "US $", regex: /US\s*\$\s*(\d+(?:[.,]\d{1,2})?)/i },
      { name: "$", regex: /\$\s*(\d+(?:[.,]\d{1,2})?)/ },
      { name: "DZD", regex: /(\d+(?:[.,]\d{1,2})?)\s*(?:DZD|DA|دج)/i },
      { name: "EUR", regex: /€\s*(\d+(?:[.,]\d{1,2})?)/ },
      { name: "plain", regex: /\b(\d+\.\d{2})\b/ },
    ];

    for (const { name, regex } of patterns) {
      const match = text.match(regex);
      if (match) {
        const price = parseFloat(match[1].replace(",", "."));
        if (price > 0 && price < 10000) {
          return { price, currency: name === "DZD" ? "DZD" : "USD" };
        }
      }
    }
    return null;
  } catch (e) {
    console.log(`[ExtractImage] Tesseract error: ${String(e).slice(0, 100)}`);
    return null;
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    usage: "POST with image (multipart form-data or { image: 'data:image/...' })",
    returns: "price, currency, productName, productImage, method, confidence",
  });
}
