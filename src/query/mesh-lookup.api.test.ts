/**
 * API tests for MeSH Lookup client.
 *
 * These tests make real API calls to the NLM MeSH Lookup API.
 * They are NOT run in CI — use `npx vitest run --project api` to run.
 */
import { describe, it, expect } from 'vitest';
import { MeSHLookupClient } from './mesh-lookup.js';

describe('MeSHLookupClient (real API)', () => {
  const client = new MeSHLookupClient();

  it('should find a valid MeSH term', async () => {
    const result = await client.lookupTerm('Diabetes Mellitus, Type 2');

    expect(result.found).toBe(true);
    expect(result.term).toBe('Diabetes Mellitus, Type 2');
    expect(result.suggestions).toBeUndefined();
  });

  it('should find another valid MeSH term', async () => {
    const result = await client.lookupTerm('Artificial Intelligence');

    expect(result.found).toBe(true);
    expect(result.term).toBe('Artificial Intelligence');
  });

  it('should return not found for an invalid term', async () => {
    const result = await client.lookupTerm(
      'Xyzzy Not A Real Medical Subject Heading'
    );

    expect(result.found).toBe(false);
    expect(result.term).toBe('Xyzzy Not A Real Medical Subject Heading');
  });

  it('should return suggestions for a misspelled term', async () => {
    const result = await client.lookupTerm('Diabetes Mellitu');

    expect(result.found).toBe(false);
    expect(result.suggestions).toBeDefined();
    expect(result.suggestions!.length).toBeGreaterThan(0);
    expect(
      result.suggestions!.some((s) => s.startsWith('Diabetes Mellitu'))
    ).toBe(true);
  });

  it('should validate multiple terms', async () => {
    const results = await client.lookupTerms([
      'Machine Learning',
      'Not A Real Term',
    ]);

    expect(results).toHaveLength(2);
    expect(results[0]!.found).toBe(true);
    expect(results[1]!.found).toBe(false);
  });
});
