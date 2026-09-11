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
  // Boards and Telegram clients send the same letter both precomposed and
  // decomposed ("ü" vs "u" + U+0308). Compose first, or the combining mark is
  // dropped as punctuation and splits the word in two.
  return value
    .normalize("NFC")
    .replace(/[əƏıIİüÜöÖşŞçÇğĞ]/g, (char) => DIACRITICS[char])
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(value: string): string[] {
  const normalized = normalize(value);
  return normalized.length === 0 ? [] : normalized.split(" ");
}
