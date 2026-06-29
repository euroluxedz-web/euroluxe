# EUROLUXE - Temu Scraping Fix Report

## المشاكل المكتشفة والحلول المطبقة

### المشكلة 1: روابط share.temu.com ترجع سعر 30.00$ خاطئ

**السبب الجذري:**
1. Vercel serverless functions لا تستطيع الوصول المباشر لـ `share.temu.com` - الطلب يعلق (DNS/geo-blocking)
2. الكود القديم كان يحاول `fetch(share.temu.com, {redirect: "follow"})` ثم يقرأ HTML كامل (300KB+) مما يسبب timeout
3. `_oak_rec_ext_1` لم يعد موجوداً في روابط share الجديدة (كان يشفر سعر "ضمان التوصيل" 30.00$ بدلاً من سعر المنتج)

**الحل المطبق:**
1. استخدام `redirect-checker.net` API لحل رابط share.temu.com (سريع ويعمل من Vercel)
2. استخدام `AllOrigins proxy` مع الصفحة الأمريكية كاستراتيجية أولى (موثوقة - ترجع OG price tags)
3. معالجة أول 50KB فقط من HTML (OG tags في `<head>`)
4. تخطي الاستراتيجيات البطيئة (Web Search, LLM) لروابط share.temu.com

### المشكلة 2: Item ID (مثل TV10922608) لا يعمل

**السبب:**
- رابط `-i-TV10922608.html` يرجع صفحة فارغة عبر AllOrigins
- Temu search page لا تحتوي على بيانات المنتج (JavaScript-rendered)
- Page Reader يرجع محتوى فارغ

**الحل المطبق:**
1. إضافة AllOrigins Quick لـ Item IDs عبر `-i-` URL format
2. إضافة AllOrigins Quick عند العثور على goods_id من نتائج البحث
3. تحسين بحث الويب باستخدام AllOrigins على نتائج البحث

## التغييرات في الكود

### الملف: `src/app/api/scrape-price/route.ts`

1. **مرحلة حل رابط share.temu.com** (سطر ~2202):
   - Method 1: `redirect-checker.net` API (سريع، يعمل من Vercel)
   - Method 2: HEAD request مع redirect: "manual" (يعمل محلياً)
   - Method 3: GET مع redirect: "follow" (آخر احتياط)

2. **Strategy -0.9: AllOrigins Quick** (سطر ~2539):
   - استراتيجية جديدة وسريعة تستخدم AllOrigins proxy
   - تعالج أول 50KB فقط من HTML (OG tags في `<head>`)
   - timeout قصير (8 ثواني)
   - تُتخطى لروابط share مع goods_id

3. **تحسين Strategy -0.8** (سطر ~2644):
   - إضافة AllOrigins Quick عند العثور على goods_id من نتائج البحث
   - تخطي هذه الاستراتيجية لروابط share.temu.com مع goods_id

4. **تحسين Strategy 0.5** (سطر ~2850):
   - تخطي لروابط share.temu.com مع goods_id
   - ترتيب URL جديد: الصفحة الأمريكية أولاً

## مشكلة Vercel الحالية

Vercel serverless functions تعاني من:
1. **Cache**: لا يحدّث الكود فوراً مع كل نشر
2. **Timeout**: الدوال تنتهي بعد 10 ثوانٍ (خطة مجانية) أو 60 ثانية
3. **DNS/Geo-blocking**: لا يستطيع الوصول لـ share.temu.com مباشرة
4. **Memory**: HTML ضخم (300KB+) يستهلك ذاكرة كثيرة

**الحل الدائم**: الانتقال لـ Railway المدفوعة الذي يوفر:
- مدة تنفيذ أطول (حتى 300 ثانية)
- ذاكرة أكبر
- وصول مباشر لجميع المواقع
- بدون cache problems

## نتائج الاختبارات المحلية

| URL | النتيجة | السعر |
|-----|---------|-------|
| `https://share.temu.com/t0mQUcAlkoB` | redirect-checker.net حل الـ URL ✓ | goods_id: 601105214745191 |
| AllOrigins + US product page | OG Price: 7.35 USD ✓ | قريب من السعر المتوقع (7.01$) |
| `https://www.temu.com/` | يعمل ✓ | الصفحة الرئيسية |
| Manual price `7.01$` | يعمل ✓ | 7.01$ = 2,103 DA |
