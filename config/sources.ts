// Kaynak listesi. Yeni blog eklemek için RSS_FEEDS'e bir satır ekleyin.
// kind "single": her yazı tek bir ürünü anlatır (ürün adı yazı başlığından çıkarılır).

export type RssFeed = {
  id: string;
  name: string;
  feedUrl: string;
  kind: "single";
  enabled: boolean;
};

export const RSS_FEEDS: RssFeed[] = [
  { id: "coolthings", name: "Cool Things", feedUrl: "https://www.coolthings.com/feed/", kind: "single", enabled: true },
  { id: "thegadgeteer", name: "The Gadgeteer", feedUrl: "https://the-gadgeteer.com/feed/", kind: "single", enabled: true },
  { id: "theawesomer", name: "The Awesomer", feedUrl: "https://theawesomer.com/feed/", kind: "single", enabled: true },
];
