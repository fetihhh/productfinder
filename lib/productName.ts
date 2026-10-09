// Blog başlığından ürün adını çıkarır. Faz C'de marka sitesindeki ürün başlığıyla iyileştirilir.

// Başlıklarda ürün adından sonra gelen tipik fiiller ("X Offers ...", "X Lets You ...").
const VERB_BREAKS = [
  "Offers", "Is", "Are", "Lets", "Gives", "Turns", "Brings", "Makes", "Has", "Adds", "Packs", "Features",
  "Can", "Will", "Wants", "Takes", "Keeps", "Puts", "Delivers", "Combines", "Comes", "Uses", "Helps",
  "Transforms", "Doubles", "Looks", "Folds", "Converts", "Gets", "Returns", "Debuts", "Launches",
  "Make", "Lets", "Crams", "Finally", "Updates", "Starts", "Arrives", "Goes", "Hits", "Shows",
];
const PREFIXES = /^(review|hands[- ]on|first look|deal|new|now available|pre-?order)\s*[:\-–—]\s*|^(this|these|meet)\s+/i;
const SUFFIXES = /\s+(review|hands-on review|first look)$/i;

export function productNameFromTitle(title: string): string {
  let name = title.trim().replace(PREFIXES, "");
  name = name.split(/\s*(?::| – | — | \| | - )\s*/)[0];
  // Fiil ancak en az iki kelimelik bir ürün adından sonra geliyorsa kesilir ("Is" vb. erken kesmesin).
  const verb = new RegExp(`^(\\S+\\s+\\S+.*?)\\s+(?:${[...new Set(VERB_BREAKS)].join("|")})\\s+`, "i");
  const m = name.match(verb);
  if (m) name = m[1];
  name = name.replace(SUFFIXES, "").replace(/^(the|a|an)\s+/i, "").trim();
  return name.slice(0, 120);
}

/** Tekrar birleştirme anahtarı: küçük harf, aksansız, yalnızca harf/rakam. */
export function normalizeName(name: string): string {
  return name
    .toLocaleLowerCase("en")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
