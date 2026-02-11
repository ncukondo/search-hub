/**
 * MeSH Lookup API client.
 *
 * Validates MeSH (Medical Subject Headings) terms against the NLM MeSH Lookup API.
 * No API key required.
 *
 * API docs: https://id.nlm.nih.gov/mesh/lookup/term
 */

import type { RateLimiter } from '../providers/base/rate-limiter.js';
import type { VocabCache } from './vocab-cache.js';
import { levenshteinDistance } from '../utils/levenshtein.js';

const MESH_LOOKUP_BASE_URL = 'https://id.nlm.nih.gov/mesh/lookup/term';
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Result of a MeSH term lookup.
 */
export interface MeSHLookupResult {
  /** The term that was looked up */
  term: string;
  /** Whether the term was found as a valid MeSH heading */
  found: boolean;
  /** Suggested terms if the lookup term was not found */
  suggestions?: string[];
}

interface MeSHApiEntry {
  resource: string;
  label: string;
}

/**
 * Client for the NLM MeSH Lookup API.
 */
export class MeSHLookupClient {
  private readonly rateLimiter: RateLimiter | undefined;
  private readonly timeoutMs: number;
  private readonly cache: VocabCache | undefined;

  constructor(options?: { rateLimiter?: RateLimiter; timeoutMs?: number; cache?: VocabCache }) {
    this.rateLimiter = options?.rateLimiter;
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.cache = options?.cache;
  }

  /**
   * Look up a single MeSH term.
   *
   * Tries multiple match strategies in order:
   * 1. exact — exact match
   * 2. startsWith (full term) — prefix match
   * 2b. startsWith (truncated) — suffix typo recovery (1-3 chars removed)
   * 3. contains (full term) — substring match
   * 4. startsWith (first word) — for multi-word terms
   *
   * Returns on the first strategy that produces results.
   * Results are cached when a VocabCache is provided.
   */
  async lookupTerm(term: string): Promise<MeSHLookupResult> {
    // Check cache first
    if (this.cache) {
      const cached = this.cache.get('mesh', term);
      if (cached) {
        return cached;
      }
    }

    // 1. Try exact match first
    const exactResults = await this.fetchLookup(term, 'exact', 1);

    if (exactResults.length > 0) {
      const result: MeSHLookupResult = { term, found: true };
      this.cache?.set('mesh', term, result);
      return result;
    }

    // 2. Try startsWith (full term) for suggestions
    const startsWithResults = await this.fetchLookup(term, 'startswith', 5);

    if (startsWithResults.length > 0) {
      const result: MeSHLookupResult = {
        term,
        found: false,
        suggestions: startsWithResults.map((s) => s.label),
      };
      this.cache?.set('mesh', term, result);
      return result;
    }

    // 2b. Try startsWith with progressively shorter input (handles suffix typos)
    if (term.length > 3) {
      for (let len = term.length - 1; len >= Math.max(term.length - 3, 3); len--) {
        const truncated = term.slice(0, len);
        const truncatedResults = await this.fetchLookup(truncated, 'startswith', 5);
        if (truncatedResults.length > 0) {
          const result: MeSHLookupResult = {
            term,
            found: false,
            suggestions: truncatedResults.map((s) => s.label),
          };
          this.cache?.set('mesh', term, result);
          return result;
        }
      }
    }

    // 2c. Multi-word progressive prefix: try word1 + word2.slice(0, N)
    const words = term.split(/\s+/);
    if (words.length >= 2 && words[1]!.length > 3) {
      const startN = Math.min(words[1]!.length - 4, words[1]!.length - 1);
      const endN = 3;
      let iterations = 0;
      for (let n = startN; n >= endN && iterations < 3; n--, iterations++) {
        const prefix = words[0]! + ' ' + words[1]!.slice(0, n);
        const prefixResults = await this.fetchLookup(prefix, 'startswith', 5);
        if (prefixResults.length > 0) {
          const result: MeSHLookupResult = {
            term,
            found: false,
            suggestions: prefixResults.map((s) => s.label),
          };
          this.cache?.set('mesh', term, result);
          return result;
        }
      }
    }

    // 3. Try contains (full term) for typos and variant spellings
    const containsResults = await this.fetchLookup(term, 'contains', 5);

    if (containsResults.length > 0) {
      const result: MeSHLookupResult = {
        term,
        found: false,
        suggestions: containsResults.map((s) => s.label),
      };
      this.cache?.set('mesh', term, result);
      return result;
    }

    // 4. Try startsWith with first word only (for multi-word terms)
    //    Fetch up to 25 results and re-rank by Levenshtein distance
    if (words.length > 1) {
      const firstWord = words[0]!;
      const firstWordResults = await this.fetchLookup(firstWord, 'startswith', 25);

      if (firstWordResults.length > 0) {
        const ranked = firstWordResults
          .map((s) => ({
            label: s.label,
            distance: levenshteinDistance(term.toLowerCase(), s.label.toLowerCase()),
          }))
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 5)
          .map((s) => s.label);
        const result: MeSHLookupResult = { term, found: false, suggestions: ranked };
        this.cache?.set('mesh', term, result);
        return result;
      }
    }

    const result: MeSHLookupResult = { term, found: false };
    this.cache?.set('mesh', term, result);
    return result;
  }

  /**
   * Look up multiple MeSH terms.
   */
  async lookupTerms(terms: string[]): Promise<MeSHLookupResult[]> {
    const results: MeSHLookupResult[] = [];
    for (const term of terms) {
      results.push(await this.lookupTerm(term));
    }
    return results;
  }

  private async fetchLookup(
    label: string,
    match: 'exact' | 'startswith' | 'contains',
    limit: number
  ): Promise<MeSHApiEntry[]> {
    if (this.rateLimiter) {
      await this.rateLimiter.acquire();
    }

    const params = new URLSearchParams({
      label,
      match,
      limit: String(limit),
    });

    const url = `${MESH_LOOKUP_BASE_URL}?${params.toString()}`;

    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`MeSH lookup failed: ${message}`);
    }

    if (!response.ok) {
      throw new Error(
        `MeSH lookup failed: HTTP ${response.status} ${response.statusText}`
      );
    }

    return (await response.json()) as MeSHApiEntry[];
  }
}
