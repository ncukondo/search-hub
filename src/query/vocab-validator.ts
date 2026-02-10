/**
 * Controlled vocabulary validator.
 *
 * Extracts controlled vocabulary terms (MeSH, etc.) from a QueryAST
 * and validates them against external APIs.
 */
import type { QueryAST } from './types.js';
import type { MeSHLookupClient, MeSHLookupResult } from './mesh-lookup.js';

/**
 * A controlled vocabulary term extracted from a QueryAST.
 */
export interface VocabTerm {
  term: string;
  vocabulary: 'mesh';
}

/**
 * Result of validating a single controlled vocabulary term.
 */
export interface VocabTermResult {
  term: string;
  vocabulary: 'mesh';
  found: boolean;
  suggestions?: string[];
}

/**
 * A controlled vocabulary term that failed due to an API error.
 */
export interface VocabTermError {
  term: string;
  vocabulary: 'mesh';
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

  for (const block of ast.blocks) {
    if (block.terms.mesh) {
      for (const term of block.terms.mesh) {
        const key = `mesh:${term}`;
        if (!seen.has(key)) {
          seen.add(key);
          terms.push({ term, vocabulary: 'mesh' });
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
