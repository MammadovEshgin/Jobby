const DIACRITICS: Record<string, string> = {
  ə: "e",
  Ə: "e",
  ı: "i",
  I: "i",
  İ: "i",
  ü: "u",
  Ü: "u",
  ö: "o",
  Ö: "o",
  ş: "s",
  Ş: "s",
  ç: "c",
  Ç: "c",
  ğ: "g",
  Ğ: "g",
};

export function normalize(value: string): string {
  return value
    .replace(/[əƏıIİüÜöÖşŞçÇğĞ]/g, (char) => DIACRITICS[char] ?? char)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(value: string): string[] {
  const normalized = normalize(value);
  return normalized.length === 0 ? [] : normalized.split(" ");
}
