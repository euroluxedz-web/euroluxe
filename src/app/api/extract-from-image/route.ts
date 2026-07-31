import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/security";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Extract product info (price, name, image) from a screenshot image.
 * Uses ZAI Vision API (glm-4v) for high-accuracy extraction.
 * Falls back to Tesseract.js for price-only extraction.
 */

export async function POST(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req as any, 20, 60_000);
  if (rateLimitResponse) return rateLimitResponse;
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

    // Tesseract strategy removed (module not available on Railway)

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
    // Use the z-ai-web-dev-sdk with explicit config (don't rely on .z-ai-config file)
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    
    // Try to create with config from env vars
    const zaiToken = process.env.ZAI_TOKEN;
    if (!zaiToken) {
      console.log("[ExtractImage] ZAI_TOKEN not set");
      return null;
    }
    
    // Create ZAI instance with explicit config
    const zai = new ZAI({
      baseUrl: "https://internal-api.z.ai/v1",
      apiKey: "Z.ai",
      token: zaiToken,
      chatId: "chat-e75f7106-3d39-4630-81be-37e65a84e9f2",
      userId: "8d7a9a03-e90a-4343-9861-5c38c7feb919",
    });
    
    const prompt = `You are an AI assistant that extracts product information from e-commerce screenshots (Temu, SHEIN, Amazon, etc).

Look at this screenshot and extract:
1. Product price (the SALE/discounted price, not original/strikethrough)
2. Product name/title
3. Currency (USD, EUR, GBP, DZD)

IMPORTANT: Distinguish between:
- Product PRICE (e.g., "$10.14", "US $11.50") - what you pay
- Product RATING (e.g., "4.64", "4.5 stars") - customer review score - NOT a price!
- Original price (strikethrough) - do NOT return this, return the discounted price

Return ONLY a JSON object:
{
  "price": <number or null>,
  "currency": "USD" | "EUR" | "GBP" | "DZD" | null,
  "productName": "<product name or null>",
  "confidence": <0-1>
}

Rules:
- Look for "US $X.XX", "$X.XX", "\u20acX.XX", "\u00a3X.XX" patterns
- Ignore shipping prices, credits, ratings (stars), and original prices (strikethrough)
- If you can\'t find a price, return {"price": null, "currency": null, "productName": null, "confidence": 0}
- Return ONLY the JSON, no other text`;

    const response = await zai.chat.completions.createVision({
      messages: [{
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
        ],
      }],
      thinking: { type: "disabled" },
      max_tokens: 300,
    });

    const content = response?.choices?.[0]?.message?.content || "";
    console.log("[ExtractImage] ZAI VLM response:", content.substring(0, 200));
    
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        price: typeof parsed.price === "number" ? parsed.price : null,
        currency: parsed.currency || null,
        productName: parsed.productName || null,
        productImage: null,
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.8,
      };
    } catch {
      return null;
    }
  } catch (e: any) {
    console.log(`[ExtractImage] ZAI SDK error: ${e?.message || String(e).slice(0, 200)}`);
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
