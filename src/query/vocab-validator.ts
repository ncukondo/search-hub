/**
 * Controlled vocabulary validator.
 *
 * Extracts controlled vocabulary terms (MeSH, etc.) from a QueryAST
 * and validates them against external APIs.
 */
import type { QueryAST } from './types.js';
import type { MeSHLookupClient, MeSHLookupResult } from './mesh-lookup.js';

/** Supported controlled vocabulary types. */
export type VocabType = 'mesh' | 'eric' | 'emtree';

/**
 * A controlled vocabulary term extracted from a QueryAST.
 */
export interface VocabTerm {
  term: string;
  vocabulary: VocabType;
}

/**
 * Result of validating a single controlled vocabulary term.
 */
export interface VocabTermResult {
  term: string;
  vocabulary: VocabType;
  found: boolean;
  suggestions?: string[];
}

/**
 * A controlled vocabulary term that failed due to an API error.
 */
export interface VocabTermError {
  term: string;
  vocabulary: VocabType;
  error: string;
}

/**
 * Result of validating all controlled vocabulary terms in a query.
 */
export interface VocabValidationResult {
  valid: VocabTermResult[];
  invalid: VocabTermResult[];
  errors: VocabTermError[];
}

/**
 * Extract all controlled vocabulary terms from a QueryAST.
 * Terms are deduplicated across blocks.
 */
export function extractControlledVocabTerms(ast: QueryAST): VocabTerm[] {
  const seen = new Set<string>();
  const terms: VocabTerm[] = [];

  const vocabFields: { key: keyof typeof ast.blocks[0]['terms']; vocab: VocabType }[] = [
    { key: 'mesh', vocab: 'mesh' },
    { key: 'eric', vocab: 'eric' },
    { key: 'emtree', vocab: 'emtree' },
  ];

  for (const block of ast.blocks) {
    for (const { key, vocab } of vocabFields) {
      const fieldTerms = block.terms[key];
      if (fieldTerms) {
        for (const term of fieldTerms) {
          const dedupeKey = `${vocab}:${term}`;
          if (!seen.has(dedupeKey)) {
            seen.add(dedupeKey);
            terms.push({ term, vocabulary: vocab });
          }
        }
      }
    }
  }

  return terms;
}

/**
 * Validate all controlled vocabulary terms in a QueryAST.
 */
export async function validateControlledVocab(
  ast: QueryAST,
  meshClient: MeSHLookupClient
): Promise<VocabValidationResult> {
  const terms = extractControlledVocabTerms(ast);

  const valid: VocabTermResult[] = [];
  const invalid: VocabTermResult[] = [];
  const errors: VocabTermError[] = [];

  for (const vocabTerm of terms) {
    let result: MeSHLookupResult;
    try {
      result = await meshClient.lookupTerm(vocabTerm.term);
    } catch (err) {
      errors.push({
        term: vocabTerm.term,
        vocabulary: vocabTerm.vocabulary,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    const termResult: VocabTermResult = {
      term: vocabTerm.term,
      vocabulary: vocabTerm.vocabulary,
      found: result.found,
      ...(result.suggestions ? { suggestions: result.suggestions } : {}),
    };

    if (result.found) {
      valid.push(termResult);
    } else {
      invalid.push(termResult);
    }
  }

  return { valid, invalid, errors };
}
