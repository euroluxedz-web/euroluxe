export type Language = "fr" | "ar";

export const translations: Record<Language, Record<string, string>> = {
  fr: {
    // Navbar
    "nav.accueil": "Accueil",
    "nav.calculateur": "Calculateur",
    "nav.boutiques": "Boutiques",
    "nav.commentCaMarche": "Comment ça marche",
    "nav.contact": "Contact",
    "nav.openMenu": "Ouvrir le menu",
    "nav.closeMenu": "Fermer le menu",

    // Home - Hero
    "home.hero.welcome": "Bienvenue chez",
    "home.hero.subtitle":
      "Votre intermédiaire de confiance pour acheter depuis les plus grandes boutiques mondiales",
    "home.hero.stores": "Temu ✦ AliExpress",
    "home.hero.ctaCalculator": "Calculez le prix de votre produit",
    "home.hero.ctaBoutiques": "Parcourir les boutiques",

    // Home - Features
    "home.features.badge": "Pourquoi nous choisir",
    "home.features.titleWhy": "Pourquoi",
    "home.features.titleEul": "EUROLUXE ?",
    "home.features.subtitle":
      "Plus qu'un simple intermédiaire. Nous sommes votre partenaire de shopping international",
    "home.features.security.title": "Garantie de sécurité",
    "home.features.security.desc":
      "Vos produits sont assurés dès la commande jusqu'à la livraison. Nous prenons l'entière responsabilité.",
    "home.features.delivery.title": "Livraison fiable",
    "home.features.delivery.desc":
      "Un vaste réseau de livraison qui garantit l'arrivée de votre produit en toute sécurité et dans les délais.",
    "home.features.price.title": "Prix transparents",
    "home.features.price.desc":
      "Pas de frais cachés. Le prix que vous calculez est le prix que vous payez. Clair et simple.",
    "home.features.speed.title": "Rapidité d'exécution",
    "home.features.speed.desc":
      "Nous traitons votre commande dès sa réception. Pas besoin d'attendre longtemps pour recevoir vos achats.",

    // Home - CTA
    "home.cta.titleReady": "Prêt à",
    "home.cta.titleStart": "commencer ?",
    "home.cta.subtitle":
      "N'hésitez plus ! Commencez dès maintenant et calculez le prix de votre produit préféré. Un processus simple, rapide et sécurisé.",
    "home.cta.calculator": "Calculez le prix de votre produit",
    "home.cta.contact": "Contactez-nous",

    // Calculator
    "calc.badge": "Calcul instantané",
    "calc.titleCalc": "Calculez le prix",
    "calc.titleProduct": "de votre produit",
    "calc.subtitle":
      "Collez simplement le lien de votre produit et nous extrairons le prix automatiquement",
    "calc.label": "Lien ou code du produit",
    "calc.placeholder":
      "Collez le lien du produit ou le code Temu (ex: 5GM305X711)...",
    "calc.hint": "Vous pouvez coller un lien complet ou simplement le code produit Temu (ex: 5GM305X711)",
    "calc.analyze": "Analyser le prix",
    "calc.analyzing": "Analyse en cours...",
    "calc.extracting":
      "Extraction du prix en cours... Cela peut prendre quelques secondes",
    "calc.error.empty": "Veuillez coller le lien ou le code du produit",
    "calc.error.invalidUrl":
      "Veuillez entrer un lien valide (ex: https://...) ou un code produit Temu (ex: 5GM305X711)",
    "calc.error.generic":
      "Impossible d'extraire le prix. Veuillez réessayer.",
    "calc.error.notFound":
      "Nous n'avons pas pu trouver le prix de ce produit. Veuillez vérifier le lien ou réessayer.",
    "calc.error.network":
      "Une erreur est survenue. Veuillez vérifier votre connexion et réessayer.",
    "calc.error.tip":
      "Astuce : Vous pouvez coller un lien ou un code produit Temu (ex: 5GM305X711)",
    "calc.result": "Résultat",
    "calc.copy": "Copier",
    "calc.copied": "Copié !",
    "calc.product": "Produit",
    "calc.priceUsd": "Prix en dollars",
    "calc.priceDzd": "Prix en Dinar Algérien",
    "calc.dinarAlgerien": "Dinar Algérien",
    "calc.estimated": "* Prix estimé basé sur des produits similaires",
    "calc.orderNow": "Passer votre commande",
    "calc.supportedStores": "Boutiques supportées",

    // Boutiques
    "shops.badge": "Boutiques mondiales",
    "shops.titleBuy": "Achetez depuis",
    "shops.titleAnywhere": "n'importe où",
    "shops.subtitle":
      "Nous achetons pour vous depuis Temu et AliExpress aux meilleurs prix",
    "shops.temu.desc":
      "Des prix irrésistibles sur tout — mode, tech, maison et plus. Collez le lien ou le code produit et on s'occupe du reste.",
    "shops.temu.category": "Généraliste",
    "shops.aliexpress.desc":
      "Le plus grand marché en ligne chinois avec des millions de produits à des prix imbattables.",
    "shops.aliexpress.category": "Généraliste",
    "shops.calculate": "Calculer",
    "shops.trustNote":
      "✦ Votre intermédiaire de confiance pour Temu et AliExpress ✦",
    "shops.calcNow": "Calculer le prix maintenant",

    // Comment ça marche
    "how.badge": "Comment ça marche",
    "how.titleSteps": "4 étapes",
    "how.titleOnly": "seulement",
    "how.subtitle":
      "Du choix du produit à la livraison, le processus est simple et rapide",
    "how.step1.title": "Choisissez votre produit",
    "how.step1.desc":
      "Parcourez les boutiques Temu et AliExpress, puis choisissez le produit qui vous plaît. Copiez le lien du produit ou le code Temu.",
    "how.step2.title": "Collez le lien dans notre calculateur",
    "how.step2.desc":
      "Utilisez notre calculateur intelligent en collant le lien du produit ou simplement le code produit Temu. Nous extrairons le prix automatiquement et le convertirons en Dinar Algérien.",
    "how.step3.title": "Passez votre commande",
    "how.step3.desc":
      "Envoyez-nous le lien du produit et nous l'achèterons pour vous. Nous nous occupons de tout, de la commande jusqu'à la livraison internationale.",
    "how.step4.title": "Recevez votre produit",
    "how.step4.desc":
      "Une fois le produit arrivé, nous vous le remettons en toute sécurité. Un processus fiable et transparent du début à la fin.",
    "how.cta.title": "C'est aussi simple que ça !",
    "how.cta.subtitle":
      "Commencez dès maintenant et recevez vos produits préférés chez vous en Algérie",
    "how.cta.calculator": "Essayer le calculateur",
    "how.cta.shops": "Voir les boutiques",

    // Contact
    "contact.badge": "Contactez-nous",
    "contact.titleContact": "Contactez",
    "contact.titleUs": "-nous",
    "contact.subtitle":
      "Vous avez une question ou besoin d'informations ? Nous sommes là pour vous aider",
    "contact.whatsapp.desc": "Réponse rapide, commandes et suivi",
    "contact.instagram.desc": "Découvrir nos produits et promotions",
    "contact.facebook.desc": "Rejoignez notre communauté",
    "contact.form.title": "Envoyez-nous un message",
    "contact.form.nameLabel": "Nom complet",
    "contact.form.namePlaceholder": "Votre nom",
    "contact.form.emailLabel": "Email",
    "contact.form.emailPlaceholder": "votre@email.com",
    "contact.form.messageLabel": "Message",
    "contact.form.messagePlaceholder": "Comment pouvons-nous vous aider ?",
    "contact.form.submit": "Envoyer le message",
    "contact.form.success": "Message envoyé !",
    "contact.form.successDesc":
      "Nous vous répondrons dans les plus brefs délais",
    "contact.info.location": "Localisation",
    "contact.info.locationDesc":
      "Algérie — Livraison disponible dans toutes les wilayas",
    "contact.info.whatsapp": "WhatsApp",
    "contact.info.whatsappDesc":
      "Le moyen le plus rapide pour passer commande et suivre votre livraison",
    "contact.info.email": "Email",
    "contact.info.priority": "Votre satisfaction est notre priorité",

    // Footer
    "footer.copyright":
      "Votre intermédiaire de confiance pour les achats internationaux",
  },

  ar: {
    // Navbar
    "nav.accueil": "الرئيسية",
    "nav.calculateur": "الحاسبة",
    "nav.boutiques": "المتاجر",
    "nav.commentCaMarche": "كيف يعمل",
    "nav.contact": "اتصل بنا",
    "nav.openMenu": "فتح القائمة",
    "nav.closeMenu": "إغلاق القائمة",

    // Home - Hero
    "home.hero.welcome": "مرحباً بكم في",
    "home.hero.subtitle":
      "وسيطكم الموثوق للشراء من أكبر المتاجر العالمية",
    "home.hero.stores": "Temu ✦ AliExpress",
    "home.hero.ctaCalculator": "احسب سعر منتجك",
    "home.hero.ctaBoutiques": "تصفح المتاجر",

    // Home - Features
    "home.features.badge": "لماذا تختارنا",
    "home.features.titleWhy": "لماذا",
    "home.features.titleEul": "EUROLUXE ؟",
    "home.features.subtitle":
      "أكثر من مجرد وسيط. نحن شريككم في التسوق الدولي",
    "home.features.security.title": "ضمان الأمان",
    "home.features.security.desc":
      "منتجاتكم مؤمنة منذ الطلب حتى التسليم. نتحمل المسؤولية الكاملة.",
    "home.features.delivery.title": "توصيل موثوق",
    "home.features.delivery.desc":
      "شبكة توصيل واسعة تضمن وصول منتجكم بأمان وفي الوقت المحدد.",
    "home.features.price.title": "أسعار شفافة",
    "home.features.price.desc":
      "لا رسوم خفية. السعر الذي تحسبه هو السعر الذي تدفعه. واضح وبسيط.",
    "home.features.speed.title": "سرعة التنفيذ",
    "home.features.speed.desc":
      "نعالج طلبكم فور استلامه. لا حاجة للانتظار طويلاً لتلقي مشترياتكم.",

    // Home - CTA
    "home.cta.titleReady": "مستعد",
    "home.cta.titleStart": "للبدء ؟",
    "home.cta.subtitle":
      "لا تترددوا! ابدأوا الآن واحسبوا سعر منتجكم المفضل. عملية بسيطة وسريعة وآمنة.",
    "home.cta.calculator": "احسب سعر منتجك",
    "home.cta.contact": "اتصل بنا",

    // Calculator
    "calc.badge": "حساب فوري",
    "calc.titleCalc": "احسب سعر",
    "calc.titleProduct": "منتجك",
    "calc.subtitle":
      "الصقوا رابط المنتج وسنستخرج السعر تلقائياً",
    "calc.label": "رابط أو رمز المنتج",
    "calc.placeholder":
      "الصقوا رابط المنتج أو رمز Temu (مثال: 5GM305X711)...",
    "calc.hint": "يمكنكم لصق رابط كامل أو رمز منتج Temu فقط (مثال: 5GM305X711)",
    "calc.analyze": "تحليل السعر",
    "calc.analyzing": "جارٍ التحليل...",
    "calc.extracting":
      "جارٍ استخراج السعر... قد يستغرق بضع ثوانٍ",
    "calc.error.empty": "يرجى لصق رابط أو رمز المنتج",
    "calc.error.invalidUrl":
      "يرجى إدخال رابط صالح (مثال: https://...) أو رمز منتج Temu (مثال: 5GM305X711)",
    "calc.error.generic":
      "تعذر استخراج السعر. يرجى المحاولة مرة أخرى.",
    "calc.error.notFound":
      "لم نتمكن من العثور على سعر هذا المنتج. يرجى التحقق من الرابط أو المحاولة مرة أخرى.",
    "calc.error.network":
      "حدث خطأ. يرجى التحقق من اتصالكم والمحاولة مرة أخرى.",
    "calc.error.tip":
      "نصيحة: يمكنكم لصق رابط أو رمز منتج Temu (مثال: 5GM305X711)",
    "calc.result": "النتيجة",
    "calc.copy": "نسخ",
    "calc.copied": "تم النسخ!",
    "calc.product": "المنتج",
    "calc.priceUsd": "السعر بالدولار",
    "calc.priceDzd": "السعر بالدينار الجزائري",
    "calc.dinarAlgerien": "دينار جزائري",
    "calc.estimated": "* سعر تقديري مبني على منتجات مشابهة",
    "calc.orderNow": "قدّموا طلبكم",
    "calc.supportedStores": "المتاجر المدعومة",

    // Boutiques
    "shops.badge": "متاجر عالمية",
    "shops.titleBuy": "تسوقوا من",
    "shops.titleAnywhere": "أي مكان",
    "shops.subtitle":
      "نشتري لكم من Temu و AliExpress بأفضل الأسعار",
    "shops.temu.desc":
      "أسعار لا تُقاوم على كل شيء — أزياء، تقنية، منزل والمزيد. الصقوا الرابط أو رمز المنتج ونحن نتولى الباقي.",
    "shops.temu.category": "عام",
    "shops.aliexpress.desc":
      "أكبر سوق إلكتروني صيني بملايين المنتجات بأسعار لا تُضاهى.",
    "shops.aliexpress.category": "عام",
    "shops.calculate": "احسب",
    "shops.trustNote":
      "✦ وسيطكم الموثوق لـ Temu و AliExpress ✦",
    "shops.calcNow": "احسبوا السعر الآن",

    // Comment ça marche
    "how.badge": "كيف يعمل",
    "how.titleSteps": "4 خطوات",
    "how.titleOnly": "فقط",
    "how.subtitle":
      "من اختيار المنتج إلى التسليم، العملية بسيطة وسريعة",
    "how.step1.title": "اختاروا منتجكم",
    "how.step1.desc":
      "تصفحوا متاجر Temu و AliExpress، ثم اختاروا المنتج الذي يعجبكم. انسخوا رابط المنتج أو رمز Temu.",
    "how.step2.title": "الصقوا الرابط في حاسبتنا",
    "how.step2.desc":
      "استخدموا حاسبتنا الذكية بلصق رابط المنتج أو رمز منتج Temu فقط. سنستخرج السعر تلقائياً ونحوّله إلى الدينار الجزائري.",
    "how.step3.title": "قدّموا طلبكم",
    "how.step3.desc":
      "أرسلوا لنا رابط المنتج وسنشتريه لكم. نتولى كل شيء، من الطلب حتى التسليم الدولي.",
    "how.step4.title": "استلموا منتجكم",
    "how.step4.desc":
      "بمجرد وصول المنتج، نسلّمه لكم بأمان. عملية موثوقة وشفافة من البداية إلى النهاية.",
    "how.cta.title": "بهذه البساطة!",
    "how.cta.subtitle":
      "ابدأوا الآن واستلموا منتجاتكم المفضلة في منزلكم بالجزائر",
    "how.cta.calculator": "جرّبوا الحاسبة",
    "how.cta.shops": "شاهدوا المتاجر",

    // Contact
    "contact.badge": "اتصل بنا",
    "contact.titleContact": "اتصل",
    "contact.titleUs": "بنا",
    "contact.subtitle":
      "لديكم سؤال أو تحتاجون معلومات؟ نحن هنا لمساعدتكم",
    "contact.whatsapp.desc": "رد سريع، طلبات ومتابعة",
    "contact.instagram.desc": "اكتشفوا منتجاتنا وعروضنا",
    "contact.facebook.desc": "انضموا إلى مجتمعنا",
    "contact.form.title": "أرسلوا لنا رسالة",
    "contact.form.nameLabel": "الاسم الكامل",
    "contact.form.namePlaceholder": "اسمكم",
    "contact.form.emailLabel": "البريد الإلكتروني",
    "contact.form.emailPlaceholder": "your@email.com",
    "contact.form.messageLabel": "الرسالة",
    "contact.form.messagePlaceholder": "كيف يمكننا مساعدتكم؟",
    "contact.form.submit": "إرسال الرسالة",
    "contact.form.success": "تم إرسال الرسالة!",
    "contact.form.successDesc":
      "سنرد عليكم في أقرب وقت ممكن",
    "contact.info.location": "الموقع",
    "contact.info.locationDesc":
      "الجزائر — التسليم متاح في جميع الولايات",
    "contact.info.whatsapp": "واتساب",
    "contact.info.whatsappDesc":
      "أسرع طريقة لتقديم الطلب ومتابعة التسليم",
    "contact.info.email": "البريد الإلكتروني",
    "contact.info.priority": "رضاكم هو أولويتنا",

    // Footer
    "footer.copyright":
      "وسيطكم الموثوق للشراء الدولي",
  },
};

export function t(lang: Language, key: string): string {
  return translations[lang]?.[key] ?? key;
}
