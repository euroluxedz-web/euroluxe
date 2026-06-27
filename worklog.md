---
Task ID: 1
Agent: Super Z (Main)
Task: Fix Temu share URL price extraction and add Item ID support

Work Log:
- Diagnosed that Temu blocks all server-side scraping with anti-bot measures
- Tested multiple approaches: direct fetch, CORS proxies, Temu API endpoints, page_reader
- Found that share.temu.com redirects work correctly (307 → full URL with goods_id + image)
- Found that Temu BG API returns JS challenges instead of JSON
- Found that page_reader can access share URLs but gets login/registration page
- Discovered that Google-indexed Temu pages have price snippets in search results
- Added Strategy 0-AI using ZAI web_search + LLM SDK for price extraction
- Added locale-aware currency detection (MUR, OMR, PKR, BHD, SAR, etc.)
- Fixed Item ID (TV10922608) handling - web search instead of broken -g- URL pattern
- Added two-phase search: goods_id search → product name search for prices
- Added LLM fallback to extract prices when snippet parsing fails
- Fixed missing Link import in calculateur page
- Pushed to GitHub for Vercel auto-deploy

Stage Summary:
- Share URL price extraction now works via web search + snippet parsing
- Item ID search attempts web search but may not find indexed results
- When web search fails, falls back to existing strategies + manual price entry
- Price conversion supports 30+ currencies from Temu locale URLs
- Files modified: src/app/api/scrape-price/route.ts, src/app/calculateur/page.tsx
