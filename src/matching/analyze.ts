import { CONCEPTS, SOFT_TERMS, type ConceptDefinition } from "./lexicon";
import { tokenize } from "./normalize";

/** Shortest lexicon entry that may stand in for a longer, suffixed word. */
const MIN_ROOT_LENGTH = 4;
/** How many suffix characters a single word may carry on top of a lexicon root. */
const MAX_SUFFIX_LENGTH = 6;

/** One thing a search demands of a title: a concept, or a word the lexicon does not know. */
export type Requirement = { kind: "concept"; id: string } | { kind: "word"; token: string };

export interface Analysis {
  /** Every concept the text carries, including the ones it implies. */
  concepts: Set<string>;
  /** What a search for this text demands. Soft words never land here. */
  requirements: Requirement[];
  /** All normalized tokens, used to satisfy word requirements. */
  tokens: string[];
}

interface Phrase {
  tokens: string[];
  conceptIds: string[];
}

/** The phrase that starts at a token: its concepts and how many tokens it ate. */
interface PhraseMatch {
  conceptIds: string[];
  length: number;
}

const conceptsById = new Map<string, ConceptDefinition>(
  CONCEPTS.map((concept) => [concept.id, concept]),
);
const { wordIndex, phraseIndex } = buildIndexes();

export function analyze(text: string): Analysis {
  const tokens = tokenize(text);
  const concepts = new Set<string>();
  const requiredConcepts = new Set<string>();
  const requiredWords = new Set<string>();
  let index = 0;

  while (index < tokens.length) {
    const phrase = matchPhrase(tokens, index);

    if (phrase !== undefined) {
      requireConcepts(concepts, requiredConcepts, phrase.conceptIds);
      index += phrase.length;
      continue;
    }

    const conceptIds = lookupWord(tokens[index]);

    if (conceptIds !== undefined) {
      requireConcepts(concepts, requiredConcepts, conceptIds);
    } else if (isMeaningfulUnknown(tokens[index])) {
      requiredWords.add(tokens[index]);
    }

    index += 1;
  }

  return {
    concepts,
    requirements: buildRequirements(requiredConcepts, requiredWords, tokens),
    tokens,
  };
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
    root.length >= MIN_ROOT_LENGTH &&
    word.length - root.length <= MAX_SUFFIX_LENGTH &&
    word.startsWith(root)
  );
}

function buildRequirements(
  conceptIds: ReadonlySet<string>,
  words: ReadonlySet<string>,
  tokens: readonly string[],
): Requirement[] {
  if (conceptIds.size === 0 && words.size === 0) {
    // Everything the user typed was a soft word ("mütəxəssis", "vakansiya"...).
    // Rather than matching the whole board, fall back to the literal words.
    return tokens.filter(isMeaningfulUnknown).map((token) => ({ kind: "word", token }));
  }

  return [
    ...[...conceptIds].map((id): Requirement => ({ kind: "concept", id })),
    ...[...words].map((token): Requirement => ({ kind: "word", token })),
  ];
}

function requireConcepts(concepts: Set<string>, required: Set<string>, conceptIds: string[]): void {
  for (const id of conceptIds) {
    addConceptWithImplications(concepts, id);
    required.add(id);
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

function matchPhrase(tokens: readonly string[], index: number): PhraseMatch | undefined {
  let best: PhraseMatch | undefined;

  for (const phrase of phraseCandidates(tokens[index])) {
    if (index + phrase.tokens.length > tokens.length) {
      continue;
    }

    if (best !== undefined && phrase.tokens.length <= best.length) {
      continue;
    }

    const fits = phrase.tokens.every(
      (root, offset) => covers(root, tokens[index + offset]) || root === tokens[index + offset],
    );

    if (fits) {
      best = { conceptIds: phrase.conceptIds, length: phrase.tokens.length };
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

function lookupWord(token: string): string[] | undefined {
  for (const key of rootKeys(token)) {
    const conceptIds = wordIndex.get(key);

    if (conceptIds !== undefined) {
      return conceptIds;
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

/**
 * Concepts per known term, by word and by first token of a phrase. A term with
 * no concepts is a soft term: known, so never an unknown word, but never required.
 */
function buildIndexes(): {
  wordIndex: Map<string, string[]>;
  phraseIndex: Map<string, Phrase[]>;
} {
  const wordIndex = new Map<string, string[]>();
  const phraseIndex = new Map<string, Phrase[]>();

  const indexTerm = (term: string, conceptId: string | undefined): void => {
    const tokens = tokenize(term);

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
      indexTerm(term, concept.id);
    }
  }

  for (const term of SOFT_TERMS) {
    indexTerm(term, undefined);
  }

  return { wordIndex, phraseIndex };
}

function addWord(index: Map<string, string[]>, key: string, conceptId: string | undefined): void {
  const conceptIds = index.get(key) ?? [];

  addConceptId(conceptIds, conceptId);
  index.set(key, conceptIds);
}

function addPhrase(
  index: Map<string, Phrase[]>,
  tokens: string[],
  conceptId: string | undefined,
): void {
  const bucket = index.get(tokens[0]) ?? [];
  const key = tokens.join(" ");
  let phrase = bucket.find((candidate) => candidate.tokens.join(" ") === key);

  if (phrase === undefined) {
    phrase = { tokens, conceptIds: [] };
    bucket.push(phrase);
  }

  addConceptId(phrase.conceptIds, conceptId);
  index.set(tokens[0], bucket);
}

/** A soft term passes `undefined`: it is indexed, but it carries no concept. */
function addConceptId(conceptIds: string[], conceptId: string | undefined): void {
  if (conceptId !== undefined && !conceptIds.includes(conceptId)) {
    conceptIds.push(conceptId);
  }
}
