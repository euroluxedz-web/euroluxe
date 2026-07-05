export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const { url } = await req.json();
  const BRD_USER = "brd-customer-hl_e4276258-zone-residential_proxy1";
  const BRD_PASS = "e3trwtkjfmx9";
  const proxyUrl = `http://${BRD_USER}-country-dz:${BRD_PASS}@brd.superproxy.io:33335`;
  
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  try {
    const undici = require("undici");
    const dispatcher = new undici.ProxyAgent({
      uri: proxyUrl,
      connect: { rejectUnauthorized: false },
    });
    const res = await undici.fetch(url || "https://geo.brdtest.com/welcome.txt", {
      dispatcher,
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const text = await res.text();
    return Response.json({ 
      status: res.status, 
      length: text.length, 
      preview: text.substring(0, 500) 
    });
  } catch (e: any) {
    return Response.json({ error: e.message, cause: e.cause?.message });
  }
}
