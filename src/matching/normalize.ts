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

/**
 * Names where the punctuation is the name. Stripping it leaves "c#" as the bare letter "c", which
 * the lexicon then holds as a term of the dotnet concept, so every title carrying a stray C -
 * "Sürücü (B, C kateqoriyalı)", "Hepatit C üzrə həkim" - is offered to someone following C#.
 * Folding them while the symbols are still there keeps each name a word of its own.
 */
const SYMBOL_NAMES: readonly (readonly [RegExp, string])[] = [
  [/\bc\+\+/g, "cplusplus"],
  [/\bc#/g, "csharp"],
  [/\bf#/g, "fsharp"],
];

export function normalize(value: string): string {
  // Boards and Telegram clients send the same letter both precomposed and
  // decomposed ("ü" vs "u" + U+0308). Compose first, or the combining mark is
  // dropped as punctuation and splits the word in two.
  const folded = value
    .normalize("NFC")
    .replace(/[əƏıIİüÜöÖşŞçÇğĞ]/g, (char) => DIACRITICS[char])
    .toLowerCase();

  return SYMBOL_NAMES.reduce((text, [pattern, name]) => text.replace(pattern, name), folded)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(value: string): string[] {
  const normalized = normalize(value);
  return normalized.length === 0 ? [] : normalized.split(" ");
}
