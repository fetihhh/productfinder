export type Candidate = {
  source: string;
  sourceItemId: string;
  sourceUrl: string;
  title: string;
  productName: string;
  brandDomain: string;
  productUrl: string;
  imageUrl: string | null;
  category: string | null;
  postedAt: Date;
  engagement: number;
  comments: number;
  /** Yazının aynı ürün için verdiği pazaryeri linkleri (varsa ürün pazaryerinde satılıyor demektir). */
  marketplaceLinks: string[];
};

export type SourceStats = {
  source: string;
  items: number;
  newItems: number;
  candidates: number;
  noBrandLink: number;
  errors: string[];
};

export type SourceContext = {
  /** Verilen kimliklerden veritabanında henüz OLMAYANLARI döndürür. */
  filterNew: (source: string, ids: string[]) => Promise<Set<string>>;
};

export type SeenItem = { sourceItemId: string; outcome: "candidate" | "no_brand_link" };

export interface SourceAdapter {
  id: string;
  /** seen: başarıyla işlenen yazılar (hata alanlar hariç; onlar sonraki çalıştırmada yeniden denenir). */
  fetchCandidates(ctx: SourceContext): Promise<{ candidates: Candidate[]; seen: SeenItem[]; stats: SourceStats }>;
}
