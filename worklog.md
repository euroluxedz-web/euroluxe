---
Task ID: 1
Agent: main
Task: Fix Temu share URL price extraction (always returns 30.00$ instead of actual price) and add Item ID support

Work Log:
- Analyzed the share URL resolution flow: `share.temu.com` URLs resolve to product URLs with `goods_id` and `top_gallery_url` but NO `_oak_rec_ext_1` (price parameter)
- Tested all existing strategies: Direct fetch, BG API, AllOrigins, CorsProxy, Page Reader, Web Search - all blocked by Temu's anti-bot
- Discovered that `api.allorigins.win/raw` endpoint CAN sometimes bypass anti-bot and return the full product page with correct OG meta tags (including `product:price:amount`)
- Confirmed OG price of $3.81 USD for product 601105214745191 (share URL https://share.temu.com/GLv19JAELgB)
- Added Strategy 0.5: AllOrigins with retries - tries multiple URL formats with both /raw and /get endpoints, up to 3 attempts each
- Improved fetchViaAllOrigins to use both /raw and /get endpoints
- Added multiple CORS proxies (corsproxy.io, corsproxy.org) in Strategy 3
- Enhanced web search strategy (Step 5) to read search result pages via AllOrigins for OG price extraction
- Added `isTemu` variable for proper strategy gating
- Item ID support already existed via web search strategy

Stage Summary:
- Key fix: Added Strategy 0.5 (AllOrigins with retries) BEFORE expensive ZAI strategies
- AllOrigins /raw endpoint returns correct OG price when it works ($3.81 for the test product)
- Multiple URL formats tried: -g- URL, resolved share URL, plain URL, goods.html URL
- Both /raw and /get AllOrigins endpoints attempted for reliability
- Web search strategy enhanced to also try AllOrigins on search result pages
- TypeScript compilation passes with no errors in scrape-price route
