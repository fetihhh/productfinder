// Niş (ürün kategorisi): ürün adı ve Shopify ürün türündeki anahtar kelimelerden. Yeni mağazalar çok dilli olduğu için
// İngilizce, İspanyolca, Fransızca, Almanca, İtalyanca ve Portekizce kelimeler birlikte aranır. İlk eşleşen niş kazanır
// (sıra önemlidir: "dog shampoo" güzellik değil evcil hayvandır).
import { normalizeName } from "../lib/productName.ts";

export type Niche = { key: string; label: string; words: string[] };

export const NICHES: Niche[] = [
  { key: "pet", label: "Evcil hayvan", words: ["dog", "dogs", "cat", "cats", "pet", "pets", "puppy", "kitten", "leash", "collar", "litter", "perro", "perros", "gato", "gatos", "mascota", "mascotas", "chien", "chiens", "chat", "chats", "chiot", "hund", "hunde", "katze", "cane", "gatto", "cachorro", "aquarium", "acuario", "rongeurs", "hond", "honden", "hondenmand", "feeder", "paw", "pawpaw", "harness"] },
  { key: "baby", label: "Bebek ve çocuk", words: ["baby", "babies", "toddler", "kids", "kid", "child", "children", "infant", "bebe", "bebé", "niño", "niños", "enfant", "enfants", "kinder", "bambino", "bambini", "biberon", "stroller", "nursery", "cahiers", "diapers", "diaper", "newborn", "postpartum", "pacifier", "çocuk"] },
  { key: "beauty", label: "Güzellik ve cilt bakımı", words: ["serum", "skin", "skincare", "face", "facial", "cream", "lotion", "mascara", "lash", "lashes", "makeup", "hair", "shampoo", "nail", "nails", "beauty", "glow", "collagen", "balm", "piel", "cabello", "crema", "bálsamo", "peau", "cheveux", "visage", "haut", "haare", "pelle", "capelli", "cuperosis", "rosacea", "déodorant", "deodorant", "perfume", "fragrance", "parfum", "razor", "shaver", "trimmer", "beard", "micellaire", "micellar", "hialuronico", "hyaluronic", "splash", "sanitiser", "sanitizer", "wrinkle", "eyelash", "brow", "lipstick", "lip", "tooth", "toothbrush", "teeth", "whitening", "fırçası", "essential oil", "oil"] },
  { key: "health", label: "Sağlık ve ağrı", words: ["massager", "massage", "pain", "posture", "knee", "back", "neck", "joint", "relief", "therapy", "supplement", "supplements", "vitamin", "masajeador", "dolor", "rodilla", "rodillas", "massaggiatore", "cervicale", "douleur", "genou", "schmerz", "nacken", "chews", "sleep", "snoring", "posturealert", "compression", "creatine", "hydration", "electrolytes", "orthopedic", "orthopedische", "chrapaniu", "calm", "anxiety", "clorofila", "pulmonar", "detox", "intimate", "arthro", "arthropure", "hearing", "glasses", "reading"] },
  { key: "fitness", label: "Spor ve fitness", words: ["fitness", "workout", "gym", "yoga", "exercise", "training", "dumbbell", "resistance", "abs", "glutes", "fessiers", "muscle", "running", "sport", "sports", "deporte", "golf", "football", "ball", "ski", "bike", "ebike", "cycling", "mat", "padel", "tennis"] },
  { key: "kitchen", label: "Mutfak", words: ["kitchen", "cooking", "cook", "knife", "knives", "pan", "pot", "grill", "bbq", "coffee", "latte", "espresso", "blender", "cutting", "board", "parrilla", "cocina", "cuisine", "küche", "cucina", "wine", "vin", "bottle", "gourde", "lunch", "juicer", "olla", "gelato", "measuring", "sharpener", "tea", "cake", "gourmand", "cortadores", "baking", "oven", "fryer", "kettle"] },
  { key: "home", label: "Ev ve dekor", words: ["home", "house", "lamp", "light", "lights", "led", "projector", "decor", "pillow", "blanket", "bedding", "curtain", "storage", "organizer", "cleaning", "cleaner", "vacuum", "mop", "sofa", "canapé", "luces", "lámpara", "lampe", "maison", "hogar", "casa", "haus", "proyector", "humidifier", "fan", "chandelier", "mirror", "miroir", "candle", "tray", "rug", "carpet", "wallpaper", "papier", "quilt", "dispenser", "aspirateur", "lampada", "trinket", "elektrokamin", "fireplace", "shelf", "clock", "towel", "bathroom", "firewood"] },
  { key: "fashion", label: "Moda ve giyim", words: ["dress", "shirt", "tshirt", "hoodie", "jeans", "pants", "jacket", "coat", "sneaker", "sneakers", "shoes", "boots", "bag", "sac", "handbag", "wallet", "socks", "leggings", "trench", "vestido", "zapatos", "robe", "chaussures", "kleid", "schuhe", "borsa", "scarpe", "apparel", "clothing", "tee", "tees", "jersey", "beanie", "cap", "hat", "tote", "backpack", "raincoat", "bra", "shorts", "boxer", "boxers", "sling", "brief", "bandolera", "medias", "sweater", "cardigan", "skirt", "blazer", "swimsuit", "bikini", "lingerie", "slippers", "sandals", "heels"] },
  { key: "jewelry", label: "Takı ve aksesuar", words: ["necklace", "bracelet", "ring", "rings", "earrings", "jewelry", "jewellery", "pendant", "watch", "collar de", "collier", "bijoux", "pulsera", "anillo", "jade", "sunglasses", "kette", "talisman", "chronograph", "dial", "watches", "bracelets", "charm", "gold", "silver"] },
  { key: "tech", label: "Elektronik ve gadget", words: ["bluetooth", "wireless", "charger", "charging", "usb", "phone", "iphone", "earbuds", "headphones", "speaker", "camera", "tracker", "smart", "gadget", "console", "drone", "cable", "magnetic", "borescope", "smartwatch", "remote", "inalámbrico", "scanner", "keyboard", "mouse", "laptop", "tablet", "projector", "powerbank", "power bank", "led strip"] },
  { key: "car", label: "Otomotiv", words: ["car", "auto", "vehicle", "truck", "motorcycle", "coche", "voiture", "acelerador", "cupholder", "dashboard", "tire"] },
  { key: "outdoor", label: "Bahçe ve outdoor", words: ["garden", "outdoor", "camping", "hiking", "plant", "plants", "patio", "pool", "jardin", "jardín", "garten", "fishing", "tent"] },
  { key: "toys", label: "Oyuncak ve hobi", words: ["toy", "toys", "puzzle", "game", "games", "lego", "bricks", "rc", "drift", "craft", "juguete", "jouet", "spielzeug", "giocattolo", "doll", "pokemon", "pokémon", "tcg", "coloring", "plush", "figure", "figurine", "building", "blocks"] },
  { key: "seasonal", label: "Hediye, sezon ve kişiye özel", words: ["christmas", "xmas", "advent", "halloween", "costume", "gift", "gifts", "navidad", "adviento", "noël", "weihnachten", "natale", "valentine", "nativity", "ornament", "festive", "custom", "personalized", "personalised", "personalizada", "personnalisé", "portrait", "poster", "print", "magnets", "engraved", "memorial", "keepsake"] },
];

const BY_KEY = new Map(NICHES.map((n) => [n.key, n]));
export const nicheLabel = (key: string | null | undefined) => (key ? (BY_KEY.get(key)?.label ?? key) : "Diğer");

/** Ürün adı (ve varsa ürün türü) → niş anahtarı; eşleşme yoksa "other". */
export function nicheOf(title: string | null, productType: string | null = null): string {
  const text = ` ${normalizeName(`${productType ?? ""} ${title ?? ""}`)} `;
  for (const n of NICHES) {
    if (n.words.some((w) => text.includes(` ${normalizeName(w)} `))) return n.key;
  }
  return "other";
}
