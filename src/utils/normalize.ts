export const normalizeText = (t: string) => t.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();

export function toNumber(t?: string | null) {
  if (!t) return null;
  const s = normalizeText(t).replace(/,/g, "");
  if (!s || /^[—\-]$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}




