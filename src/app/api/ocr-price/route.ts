import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * OCR Price Extraction API
 *
 * Accepts a screenshot image (base64 or multipart) of a Temu product page,
 * extracts the visible price using vision-based AI.
 *
 * Strategy:
 *   1. Try ZAI Vision API (z-ai-web-dev-sdk VLM) if ZAI_TOKEN is configured
 *   2. Fallback to Tesseract.js (pure JS OCR, no API key needed)
 *
 * Returns: { price, currency, confidence, method }
 */

interface OcrResult {
  price: number | null;
  currency: string | null;
  rawText: string;
  confidence: number;
  method: string;
}

/** Extract price from text using regex patterns */
function extractPriceFromText(text: string): { price: number | null; currency: string | null } {
  const clean = text.replace(/\s+/g, " ").trim();

  // Pattern 1: US $X.XX (Temu's format)
  const usdMatch = clean.match(/US\s*\$\s*(\d+(?:[.,]\d{1,2})?)/i);
  if (usdMatch) {
    const p = parseFloat(usdMatch[1].replace(",", "."));
    if (p > 0 && p < 10000) return { price: p, currency: "USD" };
  }

  // Pattern 2: $X.XX (generic)
  const dollarMatch = clean.match(/\$\s*(\d+(?:[.,]\d{1,2})?)/);
  if (dollarMatch) {
    const p = parseFloat(dollarMatch[1].replace(",", "."));
    if (p > 0 && p < 10000) return { price: p, currency: "USD" };
  }

  // Pattern 3: "X.XX" alone (often the price after $ sign in OCR)
  const plainMatch = clean.match(/\b(\d+\.\d{2})\b/);
  if (plainMatch) {
    const p = parseFloat(plainMatch[1]);
    if (p > 0 && p < 10000) return { price: p, currency: "USD" };
  }

  // Pattern 4: DZD / DA
  const dzdMatch = clean.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:DZD|DA|دج)/i);
  if (dzdMatch) {
    const p = parseFloat(dzdMatch[1].replace(",", "."));
    if (p > 0 && p < 1000000) return { price: p, currency: "DZD" };
  }

  // Pattern 5: €X.XX
  const eurMatch = clean.match(/€\s*(\d+(?:[.,]\d{1,2})?)/);
  if (eurMatch) {
    const p = parseFloat(eurMatch[1].replace(",", "."));
    if (p > 0 && p < 10000) return { price: p, currency: "EUR" };
  }

  // Pattern 6: £X.XX
  const gbpMatch = clean.match(/£\s*(\d+(?:[.,]\d{1,2})?)/);
  if (gbpMatch) {
    const p = parseFloat(gbpMatch[1].replace(",", "."));
    if (p > 0 && p < 10000) return { price: p, currency: "GBP" };
  }

  return { price: null, currency: null };
}

/**
 * Try ZAI Vision API (z-ai-web-dev-sdk) for high-accuracy OCR.
 */
async function extractPriceWithZaiVlm(imageBase64: string, mimeType: string): Promise<OcrResult | null> {
  try {
    const ZAI = await import("z-ai-web-dev-sdk").catch(() => null);
    if (!ZAI) {
      console.log("[OCR] z-ai-web-dev-sdk not installed");
      return null;
    }

    const { default: ZAISDK } = ZAI;
    const zai = await ZAISDK.create();

    const prompt = `You are an OCR assistant specialized in extracting product prices from Temu screenshots.

Look at this screenshot of a Temu product page. Find the MAIN PRODUCT PRICE (the sale/discounted price, usually shown in red/orange and large font).

Return ONLY a JSON object with this exact format:
{
  "price": <number>,
  "currency": "USD" | "EUR" | "GBP" | "DZD" | null,
  "rawText": "<the exact text you saw, e.g. US $11.50>",
  "confidence": <0-1>
}

Rules:
- Look for patterns like "US $X.XX", "$X.XX", "€X.XX", "£X.XX", "DZ XXX"
- Ignore shipping prices, "original price" (strikethrough), and credits
- If you cannot find a clear product price, return {"price": null, "currency": null, "rawText": "", "confidence": 0}
- The SALE price is usually the largest, boldest, often colored price
- Do not include any text outside the JSON object`;

    const result = await zai.chat.completions.create({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
    });

    const content = result.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        price: typeof parsed.price === "number" ? parsed.price : null,
        currency: parsed.currency || null,
        rawText: parsed.rawText || "",
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.8,
        method: "zai_vlm",
      };
    } catch {
      return null;
    }
  } catch (e) {
    console.log("[OCR] ZAI VLM error:", String(e).slice(0, 200));
    return null;
  }
}

/**
 * Fallback: Tesseract.js (pure JS OCR, no API key required)
 */
async function extractPriceWithTesseract(imageBase64: string): Promise<OcrResult | null> {
  try {
    const Tesseract = await import("tesseract.js").catch(() => null);
    if (!Tesseract) {
      console.log("[OCR] tesseract.js not installed");
      return null;
    }

    const { createWorker } = Tesseract;
    const worker = await createWorker("eng");

    const buffer = Buffer.from(imageBase64, "base64");
    const { data } = await worker.recognize(buffer);
    await worker.terminate();

    const text = data?.text || "";
    console.log("[OCR] Tesseract raw text:", text.substring(0, 200));

    const { price, currency } = extractPriceFromText(text);
    if (price !== null) {
      return {
        price,
        currency,
        rawText: text,
        confidence: data?.confidence ? data.confidence / 100 : 0.5,
        method: "tesseract",
      };
    }
    return null;
  } catch (e) {
    console.log("[OCR] Tesseract error:", String(e).slice(0, 200));
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    let imageBase64: string | null = null;
    let mimeType = "image/jpeg";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("image") as File | null;
      if (!file) {
        return NextResponse.json(
          { success: false, error: "No image file provided" },
          { status: 400 }
        );
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      imageBase64 = buffer.toString("base64");
      mimeType = file.type || "image/jpeg";
    } else {
      const body = await req.json();
      const dataUrl: string = body.image || body.dataUrl || "";
      if (!dataUrl) {
        return NextResponse.json(
          { success: false, error: "No image provided. Send { image: 'data:image/...' } or multipart form with 'image' field" },
          { status: 400 }
        );
      }
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        if (/^[A-Za-z0-9+/=]+$/.test(dataUrl)) {
          imageBase64 = dataUrl;
        } else {
          return NextResponse.json(
            { success: false, error: "Invalid image format. Expected data URL or raw base64" },
            { status: 400 }
          );
        }
      } else {
        mimeType = match[1];
        imageBase64 = match[2];
      }
    }

    if (imageBase64.length > 7_000_000) {
      return NextResponse.json(
        { success: false, error: "Image too large (max 5MB)" },
        { status: 413 }
      );
    }

    console.log(`[OCR] Processing image (${imageBase64.length} bytes base64, ${mimeType})`);

    // Strategy 1: Tesseract.js (fast, runs locally, no API latency)
    // Try this first because ZAI SDK init can be slow on Vercel cold start
    let result = await extractPriceWithTesseract(imageBase64);

    // Strategy 2: ZAI Vision API (high accuracy, fallback if Tesseract fails)
    if (!result || result.price === null) {
      console.log("[OCR] Tesseract failed or no price found, trying ZAI VLM...");
      const zaiResult = await extractPriceWithZaiVlm(imageBase64, mimeType);
      if (zaiResult && zaiResult.price !== null) {
        result = zaiResult;
      }
    }

    if (!result || result.price === null) {
      return NextResponse.json({
        success: false,
        error: "Could not extract price from image. Please make sure the screenshot shows a clear product price.",
        rawText: result?.rawText || "",
        method: result?.method || "none",
      });
    }

    return NextResponse.json({
      success: true,
      price: result.price,
      currency: result.currency,
      rawText: result.rawText,
      confidence: result.confidence,
      method: result.method,
    });
  } catch (e: any) {
    console.error("[OCR] Fatal error:", e);
    return NextResponse.json(
      { success: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    usage: "POST { image: 'data:image/jpeg;base64,...' } OR multipart form-data with 'image' field",
    returns: "Extracted price from screenshot using VLM (ZAI) or Tesseract.js fallback",
  });
}
