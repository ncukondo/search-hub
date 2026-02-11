/**
 * Controlled vocabulary validator.
 *
 * Extracts controlled vocabulary terms (MeSH, etc.) from a QueryAST
 * and validates them against external APIs.
 */
import type { QueryAST } from './types.js';
import type { MeSHLookupClient, MeSHLookupResult } from './mesh-lookup.js';
import type { Provider, TranslatedQuery } from '../providers/base/types.js';
import type { VocabCache } from './vocab-cache.js';

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
 * A count-based vocabulary validator.
 * Validates terms by executing a count-only search — hit count 0 means invalid.
 */
export interface CountVocabValidator {
  vocabulary: VocabType;
  countTerm: (term: string) => Promise<number>;
}

/**
 * Validate all controlled vocabulary terms in a QueryAST.
 *
 * MeSH terms are validated via the MeSH lookup API (exact match + suggestions).
 * ERIC/Emtree terms are validated via count-only search when countValidators are provided.
 * Terms whose vocabulary has no validator are skipped silently.
 */
export async function validateControlledVocab(
  ast: QueryAST,
  meshClient: MeSHLookupClient,
  options?: { countValidators?: CountVocabValidator[] }
): Promise<VocabValidationResult> {
  const terms = extractControlledVocabTerms(ast);

  const countValidatorMap = new Map<VocabType, CountVocabValidator>();
  for (const cv of options?.countValidators ?? []) {
    countValidatorMap.set(cv.vocabulary, cv);
  }

  const valid: VocabTermResult[] = [];
  const invalid: VocabTermResult[] = [];
  const errors: VocabTermError[] = [];

  for (const vocabTerm of terms) {
    if (vocabTerm.vocabulary === 'mesh') {
      // Validate via MeSH lookup API
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
    } else {
      // Validate via count-only search
      const validator = countValidatorMap.get(vocabTerm.vocabulary);
      if (!validator) continue; // No validator for this vocabulary — skip

      let count: number;
      try {
        count = await validator.countTerm(vocabTerm.term);
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
        found: count > 0,
      };

      if (count > 0) {
        valid.push(termResult);
      } else {
        invalid.push(termResult);
      }
    }
  }

  return { valid, invalid, errors };
}

/**
 * Build a native count-only query for a single ERIC descriptor.
 * Uses subject: field with quoted term.
 */
function buildEricCountQuery(term: string): string {
  return `subject:"${term}"`;
}

/**
 * Build a native count-only query for a single Emtree term.
 * Uses INDEXTERMS() function with quoted term.
 */
function buildEmtreeCountQuery(term: string): string {
  return `INDEXTERMS("${term}")`;
}

/**
 * Create a CountVocabValidator for ERIC descriptors.
 * Validates terms by running count-only searches against the ERIC API.
 */
export function createEricCountValidator(
  provider: Provider,
  options?: { cache?: VocabCache }
): CountVocabValidator {
  return {
    vocabulary: 'eric',
    countTerm: async (term: string): Promise<number> => {
      if (options?.cache) {
        const cached = options.cache.get('eric', term);
        if (cached) return cached.found ? 1 : 0;
      }

      const query: TranslatedQuery = {
        native: buildEricCountQuery(term),
        provider: 'eric',
      };
      const count = await provider.count(query);

      if (options?.cache) {
        options.cache.set('eric', term, { term, found: count > 0 });
      }

      return count;
    },
  };
}

/**
 * Create a CountVocabValidator for Emtree terms.
 * Validates terms by running count-only searches against the Scopus API.
 */
export function createEmtreeCountValidator(
  provider: Provider,
  options?: { cache?: VocabCache }
): CountVocabValidator {
  return {
    vocabulary: 'emtree',
    countTerm: async (term: string): Promise<number> => {
      if (options?.cache) {
        const cached = options.cache.get('emtree', term);
        if (cached) return cached.found ? 1 : 0;
      }

      const query: TranslatedQuery = {
        native: buildEmtreeCountQuery(term),
        provider: 'scopus',
      };
      const count = await provider.count(query);

      if (options?.cache) {
        options.cache.set('emtree', term, { term, found: count > 0 });
      }

      return count;
    },
  };
}
