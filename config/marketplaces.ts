// Pazaryeri engel listesi. Genişletmek için MARKETPLACES dizisine bir satır ekleyin.
//
// labels:        Kayıtlı alan adının uzantısız adı (eTLD+1'den TLD çıkarılmış hali).
//                "amazon" → amazon.com, amazon.com.tr, smile.amazon.de hepsini yakalar.
// searchDomains: Pazaryeri araması (DTC doğrulama adımı) bu alan adlarıyla sınırlanır.

export type Marketplace = {
  name: string;
  labels: string[];
  searchDomains: string[];
  /** Arama sonucunun ilan sayılması için URL yolunun uyması gereken desen (yalnızca pazaryeri bölümü olan sitelerde). */
  listingPath?: RegExp;
  /** Markanın bu pazaryerindeki resmi mağaza sayfası (ör. amazon.com/stores/Marka) → marka burada satıyor demektir. */
  storePath?: RegExp;
};

export const MARKETPLACES: Marketplace[] = [
  // "amzn" → amzn.to/amzn.eu kısa linkleri; ".amazon" üst düzey alan adı (link.amazon) ayrıca domain.ts'te yakalanır.
  { name: "Amazon", labels: ["amazon", "amzn", "aboutamazon"], searchDomains: ["amazon.com", "amazon.com.tr", "amazon.de", "amazon.co.uk"], storePath: /^\/stores\// },
  { name: "eBay", labels: ["ebay"], searchDomains: ["ebay.com", "ebay.de", "ebay.co.uk"], storePath: /^\/str\// },
  { name: "Etsy", labels: ["etsy"], searchDomains: ["etsy.com"], storePath: /^\/shop\// },
  { name: "AliExpress", labels: ["aliexpress"], searchDomains: ["aliexpress.com"], storePath: /^\/store\// },
  { name: "Alibaba", labels: ["alibaba"], searchDomains: ["alibaba.com"] },
  { name: "Temu", labels: ["temu"], searchDomains: ["temu.com"] },
  { name: "Shein", labels: ["shein"], searchDomains: ["shein.com"] },
  { name: "Walmart", labels: ["walmart"], searchDomains: ["walmart.com"] },
  { name: "Wish", labels: ["wish"], searchDomains: ["wish.com"] },
  { name: "Trendyol", labels: ["trendyol"], searchDomains: ["trendyol.com"], storePath: /\/magaza\// },
  { name: "Hepsiburada", labels: ["hepsiburada"], searchDomains: ["hepsiburada.com"], storePath: /^\/magaza\// },
  { name: "n11", labels: ["n11"], searchDomains: ["n11.com"], storePath: /^\/magaza\// },
  { name: "Çiçeksepeti", labels: ["ciceksepeti"], searchDomains: ["ciceksepeti.com"] },
  { name: "Pazarama", labels: ["pazarama"], searchDomains: ["pazarama.com"] },
  { name: "Mercado Libre", labels: ["mercadolibre", "mercadolivre"], searchDomains: ["mercadolibre.com", "mercadolivre.com.br"] },
  { name: "Rakuten", labels: ["rakuten"], searchDomains: ["rakuten.com", "rakuten.co.jp"] },
  { name: "Shopee", labels: ["shopee"], searchDomains: ["shopee.com", "shopee.sg"] },
  { name: "Lazada", labels: ["lazada"], searchDomains: ["lazada.com", "lazada.sg"] },
  { name: "TikTok Shop", labels: ["tiktok"], searchDomains: ["shop.tiktok.com"] },
  { name: "Facebook Marketplace", labels: ["facebook", "fb"], searchDomains: ["facebook.com"], listingPath: /^\/marketplace\// },

  // Çok markalı büyük perakendeciler (satış platformu sayılır). İstenmeyen satırı silmeniz yeterli.
  { name: "Best Buy", labels: ["bestbuy"], searchDomains: ["bestbuy.com"] },
  { name: "Target", labels: ["target"], searchDomains: ["target.com"] },
  { name: "Costco", labels: ["costco"], searchDomains: ["costco.com"] },
  { name: "Home Depot", labels: ["homedepot"], searchDomains: ["homedepot.com"] },
  { name: "Lowe's", labels: ["lowes"], searchDomains: ["lowes.com"] },
  { name: "B&H Photo", labels: ["bhphotovideo"], searchDomains: ["bhphotovideo.com"] },
  { name: "Newegg", labels: ["newegg"], searchDomains: ["newegg.com"] },
  { name: "Wayfair", labels: ["wayfair"], searchDomains: ["wayfair.com"] },
  { name: "Zappos", labels: ["zappos"], searchDomains: ["zappos.com"] },
  { name: "Nordstrom", labels: ["nordstrom"], searchDomains: ["nordstrom.com"] },
  { name: "REI", labels: ["rei"], searchDomains: ["rei.com"] },
  { name: "Kohl's", labels: ["kohls"], searchDomains: ["kohls.com"] },
  { name: "Macy's", labels: ["macys"], searchDomains: ["macys.com"] },
  { name: "Sam's Club", labels: ["samsclub"], searchDomains: ["samsclub.com"] },
];

// Pazaryeri değil ama "markanın kendi alan adı" da sayılmayan barındırma/sosyal alan adları.
// Ör. brand.myshopify.com veya instagram.com/brand → kendi alan adı koşulunu (2a) sağlamaz.
export const NOT_OWN_DOMAIN_LABELS: string[] = [
  "myshopify",
  "wixsite",
  "squarespace",
  "bigcartel",
  "gumroad",
  "square",
  "linktr",
  "instagram",
  "youtube",
  "youtu",
  "wp",
  "twitter",
  "x",
  "pinterest",
  "kickstarter",
  "indiegogo",
  "producthunt",
  "reddit",
  "ycombinator",
  "github",
  "google",
  "apple",
  "medium",
  "substack",
  "spotify",
  "vimeo",
  "threads",
  "linkedin",
  "behance",
  "fandom",
  "wikipedia",
  "eepurl",
  "mailchi",
  "fourthwall",
  // Affiliate ağları ve link kısaltıcılar: hedef adres URL parametresinde yoksa marka çözülemez, atlanır.
  "skimresources",
  "redirectingat",
  "sjv",
  "pxf",
  "nnh2",
  "prf",
  "linksynergy",
  "shareasale",
  "awin1",
  "howl",
  "geni",
  "bit",
  "tinyurl",
  "ow",
  "go2cloud",
  "dpbolvw",
  "jdoqocy",
  "kqzyfj",
  "anrdoezrs",
  "tkqlhce",
  "avantlink",
  "pntra",
  "gopjn",
  "7eer",
  "evyy",
  "gftrk",
  "pboost",
  "littlestack",
];
