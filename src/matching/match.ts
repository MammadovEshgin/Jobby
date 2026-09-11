import { analyze, tokensEquivalent, type Analysis, type Requirement } from "./analyze";
import { normalize } from "./normalize";

export interface MatchResult {
  matched: boolean;
  /** Higher means a tighter match. Only meaningful for ordering results. */
  score: number;
}

/** A title or a saved field, analysed once so it can be reused across a run. */
export interface CompiledText {
  raw: string;
  normalized: string;
  analysis: Analysis;
}

const NO_MATCH: MatchResult = { matched: false, score: 0 };

export function compile(text: string): CompiledText {
  return { raw: text, normalized: normalize(text), analysis: analyze(text) };
}

export function compileAll(texts: readonly string[]): CompiledText[] {
  return texts.map(compile);
}

/**
 * A vacancy matches a saved field when the title carries *every* idea the field
 * carries — in any language.
 *
 * The rule is deliberately one-directional: the title may add ideas (seniority,
 * a second subject, a branch name), but it may never drop one. That is what
 * keeps "Fizika müəllimi" away from a search for "music teacher": both share the
 * teacher concept, but the title has no music concept, so the search fails.
 */
export function matchCompiled(title: CompiledText, fields: readonly CompiledText[]): MatchResult {
  let best = NO_MATCH;

  for (const field of fields) {
    const result = matchOne(title, field);

    if (result.matched && result.score > best.score) {
      best = result;
    }
  }

  return best;
}

/** Convenience wrapper for one-off matches; the pipeline uses `matchCompiled`. */
export function matchTitle(title: string, fields: string | readonly string[]): MatchResult {
  return matchCompiled(compile(title), compileAll(typeof fields === "string" ? [fields] : fields));
}

function matchOne(title: CompiledText, field: CompiledText): MatchResult {
  // A field with nothing to demand would otherwise match every vacancy on the board.
  if (field.analysis.requirements.length === 0) {
    return NO_MATCH;
  }

  for (const requirement of field.analysis.requirements) {
    if (!satisfies(title.analysis, requirement)) {
      return NO_MATCH;
    }
  }

  return { matched: true, score: score(title, field) };
}

function satisfies(title: Analysis, requirement: Requirement): boolean {
  return requirement.kind === "concept"
    ? title.concepts.has(requirement.id)
    : title.tokens.some((token) => tokensEquivalent(token, requirement.token));
}

function score(title: CompiledText, field: CompiledText): number {
  if (title.normalized === field.normalized) {
    return 1000;
  }

  let extraConcepts = 0;

  for (const concept of title.analysis.concepts) {
    if (!field.analysis.concepts.has(concept)) {
      extraConcepts += 1;
    }
  }

  // A title that adds little beyond what was searched for is the better hit.
  return 900 - extraConcepts * 40 - Math.min(title.analysis.tokens.length, 24) * 3;
}
