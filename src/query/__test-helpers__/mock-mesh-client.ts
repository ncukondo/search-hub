import { vi } from 'vitest';
import type { MeSHLookupClient } from '../mesh-lookup.js';

/**
 * Create a mock MeSH lookup client for testing.
 *
 * @param results - Map of term to lookup result
 * @returns A mock MeSHLookupClient
 */
export function createMockMeSHClient(
  results: Map<string, { found: boolean; suggestions?: string[] }>
): MeSHLookupClient {
  return {
    lookupTerm: vi.fn(async (term: string) => {
      const result = results.get(term);
      if (result) {
        return { term, found: result.found, suggestions: result.suggestions };
      }
      return { term, found: false };
    }),
    lookupTerms: vi.fn(),
  } as unknown as MeSHLookupClient;
}
