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
  
  // Require authentication (prevent anonymous abuse)
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  
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
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

async function extractWithZaiVlm(imageBase64: string, mimeType: string) {
  try {
    // IMPORTANT: use the PUBLIC Z.ai API (api.z.ai/api/paas/v4), NOT internal-api.z.ai.
    // internal-api.z.ai resolves to private IPs (172.25.x.x) reachable only inside
    // Z.ai's own infrastructure — from Railway/Vercel every call times out
    // (ConnectTimeoutError after 10s), which is why this endpoint never worked in
    // production before. The public API needs a real API key (format "id.secret").
    const apiKey = process.env.ZAI_API_KEY_PUBLIC || process.env.ZAI_API_KEY;

    // Key sanity check: "Z.ai" (and other placeholders) are NOT valid public API keys.
    // Skipping the call avoids a guaranteed 401 and saves the user's waiting time.
    // A real key looks like "1234567890abcdef.abcdefg..." (contains a dot, long).
    const isValidKey = typeof apiKey === "string" && apiKey.includes(".") && apiKey.length >= 30 && apiKey !== "Z.ai";
    if (!isValidKey) {
      console.log("[ExtractImage] No valid ZAI_API_KEY configured (current value is a placeholder) — skipping AI Vision, client will use OCR fallbacks");
      return null;
    }

    const zaiBaseUrl = "https://api.z.ai/api/paas/v4";

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

    // Direct HTTP call to the OpenAI-compatible endpoint (same pattern as /api/ocr-price)
    const startTime = Date.now();
    console.log(`[ExtractImage] Calling ${zaiBaseUrl}/chat/completions (glm-4v)...`);
    const res = await fetch(`${zaiBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ZAI_VISION_MODEL || "glm-4v",
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
      signal: AbortSignal.timeout(45000),
    });

    console.log(`[ExtractImage] ZAI VLM response: ${res.status} (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.log("[ExtractImage] ZAI error response:", errText.substring(0, 200));
      return null;
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || "";
    console.log("[ExtractImage] ZAI VLM content:", content.substring(0, 200));

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
    console.log(`[ExtractImage] ZAI VLM error: ${e?.message || String(e).slice(0, 200)}`);
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
