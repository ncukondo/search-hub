/**
 * Controlled vocabulary validator.
 *
 * Extracts controlled vocabulary terms (MeSH, etc.) from a QueryAST
 * and validates them against external APIs.
 */
import type { QueryAST } from './types.js';
import type { MeSHLookupClient, MeSHLookupResult } from './mesh-lookup.js';
import type { Provider, ProviderName, TranslatedQuery } from '../providers/base/types.js';
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

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      const item = items[i];
      if (item !== undefined) results[i] = await fn(item);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
}

/**
 * Validate all controlled vocabulary terms in a QueryAST.
 *
 * MeSH terms are validated via the MeSH lookup API (exact match + suggestions).
 * ERIC/Emtree terms are validated via count-only search when countValidators are provided.
 * Terms whose vocabulary has no validator are skipped silently.
 *
 * Different vocabulary groups are validated in parallel; within each group,
 * concurrency is limited to 3 requests at a time.
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

  // Group terms by vocabulary
  const meshTerms = terms.filter((t) => t.vocabulary === 'mesh');
  const countGroups = new Map<VocabType, VocabTerm[]>();
  for (const t of terms) {
    if (t.vocabulary === 'mesh') continue;
    const validator = countValidatorMap.get(t.vocabulary);
    if (!validator) continue;
    const group = countGroups.get(t.vocabulary) ?? [];
    group.push(t);
    countGroups.set(t.vocabulary, group);
  }

  type TermOutcome =
    | { kind: 'valid'; result: VocabTermResult }
    | { kind: 'invalid'; result: VocabTermResult }
    | { kind: 'error'; error: VocabTermError };

  const CONCURRENCY = 3;

  // Validate MeSH terms
  const meshTask = mapWithConcurrency(meshTerms, CONCURRENCY, async (vocabTerm): Promise<TermOutcome> => {
    let result: MeSHLookupResult;
    try {
      result = await meshClient.lookupTerm(vocabTerm.term);
    } catch (err) {
      return {
        kind: 'error',
        error: {
          term: vocabTerm.term,
          vocabulary: vocabTerm.vocabulary,
          error: err instanceof Error ? err.message : String(err),
        },
      };
    }
    const termResult: VocabTermResult = {
      term: vocabTerm.term,
      vocabulary: vocabTerm.vocabulary,
      found: result.found,
      ...(result.suggestions ? { suggestions: result.suggestions } : {}),
    };
    return { kind: result.found ? 'valid' : 'invalid', result: termResult };
  });

  // Validate count-based vocab groups in parallel
  const countTasks = [...countGroups.entries()].map(([vocabType, groupTerms]) => {
    const validator = countValidatorMap.get(vocabType);
    if (!validator) return Promise.resolve([]);
    return mapWithConcurrency(groupTerms, CONCURRENCY, async (vocabTerm): Promise<TermOutcome> => {
      let count: number;
      try {
        count = await validator.countTerm(vocabTerm.term);
      } catch (err) {
        return {
          kind: 'error',
          error: {
            term: vocabTerm.term,
            vocabulary: vocabTerm.vocabulary,
            error: err instanceof Error ? err.message : String(err),
          },
        };
      }
      const termResult: VocabTermResult = {
        term: vocabTerm.term,
        vocabulary: vocabTerm.vocabulary,
        found: count > 0,
      };
      return { kind: count > 0 ? 'valid' : 'invalid', result: termResult };
    });
  });

  const allOutcomes = (await Promise.all([meshTask, ...countTasks])).flat();

  const valid: VocabTermResult[] = [];
  const invalid: VocabTermResult[] = [];
  const errors: VocabTermError[] = [];

  for (const outcome of allOutcomes) {
    if (outcome.kind === 'valid') valid.push(outcome.result);
    else if (outcome.kind === 'invalid') invalid.push(outcome.result);
    else errors.push(outcome.error);
  }

  return { valid, invalid, errors };
}

/**
 * Build a native count-only query for a single ERIC descriptor.
 * Uses subject: field with quoted term.
 */
function buildEricCountQuery(term: string): string {
  return `subject:"${term.replace(/"/g, '')}"`;
}

/**
 * Build a native count-only query for a single Emtree term.
 * Uses INDEXTERMS() function with quoted term.
 */
function buildEmtreeCountQuery(term: string): string {
  return `INDEXTERMS("${term.replace(/"/g, '')}")`;
}

function createCountValidator(
  vocabulary: VocabType,
  provider: Provider,
  buildQuery: (term: string) => string,
  providerName: ProviderName,
  options?: { cache?: VocabCache }
): CountVocabValidator {
  return {
    vocabulary,
    countTerm: async (term: string): Promise<number> => {
      if (options?.cache) {
        const cached = options.cache.get(vocabulary, term);
        if (cached) return cached.found ? 1 : 0;
      }

      const query: TranslatedQuery = {
        native: buildQuery(term),
        provider: providerName,
      };
      const count = await provider.count(query);

      if (options?.cache) {
        options.cache.set(vocabulary, term, { term, found: count > 0 });
      }

      return count;
    },
  };
}

export function createEricCountValidator(
  provider: Provider,
  options?: { cache?: VocabCache }
): CountVocabValidator {
  return createCountValidator('eric', provider, buildEricCountQuery, 'eric', options);
}

export function createEmtreeCountValidator(
  provider: Provider,
  options?: { cache?: VocabCache }
): CountVocabValidator {
  return createCountValidator('emtree', provider, buildEmtreeCountQuery, 'scopus', options);
}
