import { CONCEPTS, SOFT_TERMS, type ConceptDefinition, type ConceptKind } from "./lexicon";
import { normalize, tokenize } from "./normalize";

/** Shortest lexicon entry that may stand in for a longer, suffixed word. */
const MIN_ROOT_LENGTH = 4;
/** How many suffix characters a single word may carry on top of a lexicon root. */
const MAX_SUFFIX_LENGTH = 6;

export interface Analysis {
  /** Every concept the text carries, including the ones it implies. */
  concepts: Set<string>;
  /**
   * What a search for this text demands: concept ids (`c:<id>`) plus the words
   * the lexicon does not know (`w:<token>`). Soft words never land here.
   */
  requirements: string[];
  /** All normalized tokens, used to satisfy unknown-word requirements. */
  tokens: string[];
}

interface IndexEntry {
  conceptIds: string[];
  soft: boolean;
}

interface Phrase {
  tokens: string[];
  entry: IndexEntry;
}

const conceptsById = new Map<string, ConceptDefinition>(CONCEPTS.map((concept) => [concept.id, concept]));
const { wordIndex, phraseIndex } = buildIndexes();

export function analyze(text: string): Analysis {
  const tokens = tokenize(text);
  const concepts = new Set<string>();
  const requirements = new Set<string>();
  let index = 0;

  while (index < tokens.length) {
    const phrase = matchPhrase(tokens, index);

    if (phrase !== undefined) {
      addEntry(concepts, requirements, phrase.entry);
      index += phrase.length;
      continue;
    }

    const entry = lookupWord(tokens[index]);

    if (entry !== undefined) {
      addEntry(concepts, requirements, entry);
    } else if (isMeaningfulUnknown(tokens[index])) {
      requirements.add(`w:${tokens[index]}`);
    }

    index += 1;
  }

  return {
    concepts,
    requirements: [...(requirements.size > 0 ? requirements : fallbackRequirements(tokens))],
    tokens,
  };
}

export function conceptKind(id: string): ConceptKind | undefined {
  return conceptsById.get(id)?.kind;
}

/**
 * True when two words are the same word ignoring Azerbaijani suffixes:
 * "müəllim" / "müəllimi" / "müəllimlərə" all collapse onto each other.
 */
export function tokensEquivalent(token: string, other: string): boolean {
  if (token === other) {
    return true;
  }

  const [shorter, longer] = token.length <= other.length ? [token, other] : [other, token];

  return covers(shorter, longer);
}

function covers(root: string, word: string): boolean {
  return (
    root.length >= MIN_ROOT_LENGTH && word.length - root.length <= MAX_SUFFIX_LENGTH && word.startsWith(root)
  );
}

function fallbackRequirements(tokens: readonly string[]): string[] {
  // Everything the user typed was a soft word ("mütəxəssis", "vakansiya"...).
  // Rather than matching the whole board, fall back to the literal words.
  return tokens.filter(isMeaningfulUnknown).map((token) => `w:${token}`);
}

function addEntry(concepts: Set<string>, requirements: Set<string>, entry: IndexEntry): void {
  for (const id of entry.conceptIds) {
    addConceptWithImplications(concepts, id);
    requirements.add(`c:${id}`);
  }
}

function addConceptWithImplications(concepts: Set<string>, id: string): void {
  if (concepts.has(id)) {
    return;
  }

  concepts.add(id);

  for (const implied of conceptsById.get(id)?.implies ?? []) {
    addConceptWithImplications(concepts, implied);
  }
}

function matchPhrase(tokens: readonly string[], index: number): { entry: IndexEntry; length: number } | undefined {
  let best: { entry: IndexEntry; length: number } | undefined;

  for (const phrase of phraseCandidates(tokens[index])) {
    if (index + phrase.tokens.length > tokens.length) {
      continue;
    }

    if (best !== undefined && phrase.tokens.length <= best.length) {
      continue;
    }

    const fits = phrase.tokens.every((root, offset) => covers(root, tokens[index + offset]) || root === tokens[index + offset]);

    if (fits) {
      best = { entry: phrase.entry, length: phrase.tokens.length };
    }
  }

  return best;
}

function phraseCandidates(token: string): Phrase[] {
  const candidates: Phrase[] = [];

  for (const key of rootKeys(token)) {
    const phrases = phraseIndex.get(key);

    if (phrases !== undefined) {
      candidates.push(...phrases);
    }
  }

  return candidates;
}

function lookupWord(token: string): IndexEntry | undefined {
  for (const key of rootKeys(token)) {
    const entry = wordIndex.get(key);

    if (entry !== undefined) {
      return entry;
    }
  }

  return undefined;
}

/** The token itself, then every prefix long enough to be a root of it. */
function* rootKeys(token: string): Generator<string> {
  yield token;

  const shortest = Math.max(MIN_ROOT_LENGTH, token.length - MAX_SUFFIX_LENGTH);

  for (let length = token.length - 1; length >= shortest; length -= 1) {
    yield token.slice(0, length);
  }
}

function isMeaningfulUnknown(token: string): boolean {
  return token.length >= 2 && !/^\d+$/.test(token);
}

function buildIndexes(): { wordIndex: Map<string, IndexEntry>; phraseIndex: Map<string, Phrase[]> } {
  const wordIndex = new Map<string, IndexEntry>();
  const phraseIndex = new Map<string, Phrase[]>();

  const add = (term: string, conceptId: string | undefined): void => {
    const tokens = tokenize(normalize(term));

    if (tokens.length === 0) {
      return;
    }

    if (tokens.length === 1) {
      addWord(wordIndex, tokens[0], conceptId);
      return;
    }

    addPhrase(phraseIndex, tokens, conceptId);
  };

  for (const concept of CONCEPTS) {
    for (const term of concept.terms) {
      add(term, concept.id);
    }
  }

  for (const term of SOFT_TERMS) {
    add(term, undefined);
  }

  return { wordIndex, phraseIndex };
}

function addWord(index: Map<string, IndexEntry>, key: string, conceptId: string | undefined): void {
  const existing = index.get(key);

  if (existing === undefined) {
    index.set(key, { conceptIds: conceptId === undefined ? [] : [conceptId], soft: conceptId === undefined });
    return;
  }

  if (conceptId !== undefined && !existing.conceptIds.includes(conceptId)) {
    existing.conceptIds.push(conceptId);
    existing.soft = false;
  }
}

function addPhrase(index: Map<string, Phrase[]>, tokens: string[], conceptId: string | undefined): void {
  const bucket = index.get(tokens[0]) ?? [];
  const existing = bucket.find((phrase) => phrase.tokens.join(" ") === tokens.join(" "));

  if (existing === undefined) {
    bucket.push({
      tokens,
      entry: { conceptIds: conceptId === undefined ? [] : [conceptId], soft: conceptId === undefined },
    });
  } else if (conceptId !== undefined && !existing.entry.conceptIds.includes(conceptId)) {
    existing.entry.conceptIds.push(conceptId);
    existing.entry.soft = false;
  }

  index.set(tokens[0], bucket);
}
