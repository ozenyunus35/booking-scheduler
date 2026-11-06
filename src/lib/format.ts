let lang: "en" | "tr" = "en";

/** Follows the interface language; the public booking site always passes "en". */
export function setFormatLocale(next: "en" | "tr") {
  lang = next;
}
export const uiLang = () => lang;
export const uiLocale = () => (lang === "tr" ? "tr-TR" : "en-US");

const usd = new Map<string, Intl.NumberFormat>();

/** "$1,386" in English, "$1.386" in Turkish. */
export const money = (n: number) => {
  const l = uiLocale();
  let f = usd.get(l);
  if (!f) usd.set(l, (f = new Intl.NumberFormat(l, { style: "currency", currency: "USD", maximumFractionDigits: 0 })));
  return f.format(n);
};

export const pct = (x: number) => (lang === "tr" ? `%${Math.round(x * 100)}` : `${Math.round(x * 100)}%`);

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^\p{L}/u.test(w))
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

export const firstName = (name: string) => name.split(/\s+/)[0] ?? name;

export function timeAgo(iso: string, now = Date.now()): string {
  const tr = lang === "tr";
  const s = Math.round((now - Date.parse(iso)) / 1000);
  if (s < 60) return tr ? "Az önce" : "Just now";
  const m = Math.round(s / 60);
  if (m < 60) return tr ? `${m} dk önce` : `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return tr ? `${h} sa önce` : `${h} h ago`;
  const d = Math.round(h / 24);
  return tr ? `${d} gün önce` : `${d} d ago`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
