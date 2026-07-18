/**
 * ERIC Provider API Tests
 *
 * These tests call the actual ERIC API and should be run separately:
 *   npm run test:api
 *
 * Requirements:
 * - Network access to ERIC API (api.ies.ed.gov)
 * - ERIC API requires no authentication
 */
import { describe, it, expect } from 'vitest';
import { ERICProvider } from './provider';
import type { QueryAST } from '../../query/types';

describe('ERIC Provider E2E', () => {
  const provider = new ERICProvider({
    rateLimit: 2, // Be respectful to API
  });

  it('should test connection successfully', async () => {
    const result = await provider.testConnection();
    expect(result).toEqual({ ok: true });
  });

  it('should search ERIC with simple query', async () => {
    const ast: QueryAST = {
      name: 'e2e-test',
      blocks: [
        {
          id: 'block-1',
          field: 'title',
          terms: { keywords: ['education'] },
          operator: 'OR',
        },
      ],
      filters: {
        yearFrom: 2020,
        yearTo: 2024,
      },
      providers: {},
    };

    const query = provider.translateQuery(ast);
    expect(query.native).toContain('title:education');
    expect(query.native).toContain('publicationdateyear:[2020 TO 2024]');

    // Search with max 5 results
    const articles: unknown[] = [];
    for await (const article of provider.search(query, { maxResults: 5 })) {
      articles.push(article);
    }

    expect(articles.length).toBeGreaterThan(0);
    expect(articles.length).toBeLessThanOrEqual(5);
  });

  it('should search with field prefixes', async () => {
    const ast: QueryAST = {
      name: 'e2e-test',
      blocks: [
        {
          id: 'block-1',
          field: 'title_abstract',
          terms: { keywords: ['special education'] },
          operator: 'OR',
        },
      ],
      filters: {},
      providers: {},
    };

    const query = provider.translateQuery(ast);
    expect(query.native).toContain('title:');
    expect(query.native).toContain('description:');

    const articles: unknown[] = [];
    for await (const article of provider.search(query, { maxResults: 3 })) {
      articles.push(article);
    }

    expect(articles.length).toBeGreaterThan(0);
  });

  it('should return properly formatted articles', async () => {
    const ast: QueryAST = {
      name: 'e2e-test',
      blocks: [
        {
          id: 'block-1',
          field: 'title',
          terms: { keywords: ['technology'] },
          operator: 'OR',
        },
      ],
      filters: {
        yearFrom: 2023,
      },
      providers: {},
    };

    const query = provider.translateQuery(ast);

    const articles: unknown[] = [];
    for await (const article of provider.search(query, { maxResults: 2 })) {
      articles.push(article);
    }

    expect(articles.length).toBeGreaterThan(0);

    const article = articles[0] as {
      ericId?: string;
      title?: string;
      source?: string;
      retrievedAt?: string;
    };
    // Check required fields
    expect(article.ericId).toBeDefined();
    expect(typeof article.ericId).toBe('string');
    expect(article.ericId!.match(/^E[JD]\d+$/)).toBeTruthy();

    expect(article.title).toBeDefined();
    expect(typeof article.title).toBe('string');

    expect(article.source).toBe('eric');
    expect(article.retrievedAt).toBeDefined();
  });

  it('should handle pagination with multiple pages', async () => {
    const ast: QueryAST = {
      name: 'e2e-test',
      blocks: [
        {
          id: 'block-1',
          field: 'all',
          terms: { keywords: ['learning'] },
          operator: 'OR',
        },
      ],
      filters: {
        yearFrom: 2023,
        yearTo: 2024,
      },
      providers: {},
    };

    const query = provider.translateQuery(ast);

    // Use small page size to force pagination
    const articles: unknown[] = [];
    for await (const article of provider.search(query, { maxResults: 15, pageSize: 5 })) {
      articles.push(article);
    }

    // Should get multiple pages of results (up to 15)
    expect(articles.length).toBeGreaterThan(0);
  });

  it('should return helpful error for unfielded phrase queries', async () => {
    // ERIC API doesn't support phrase queries without field specification
    // This test verifies we get a user-friendly error message
    const directQuery = {
      native: '"generative AI"',
      provider: 'eric' as const,
    };

    try {
      const articles: unknown[] = [];
      for await (const article of provider.search(directQuery, { maxResults: 1 })) {
        articles.push(article);
      }
      // If we reach here, the query unexpectedly succeeded
      // This could happen if ERIC API changes behavior
      expect.fail('Expected phrase query to fail');
    } catch (error: unknown) {
      const e = error as { code?: string; message?: string };
      expect(e.code).toBe('QUERY_ERROR');
      expect(e.message).toContain(
        'ERIC does not support phrase queries without field specification',
      );
      expect(e.message).toContain('title:"your phrase"');
    }
  });

  it('should support session resume from saved offset', async () => {
    const ast: QueryAST = {
      name: 'e2e-test',
      blocks: [
        {
          id: 'block-1',
          field: 'title',
          terms: { keywords: ['mathematics'] },
          operator: 'OR',
        },
      ],
      filters: {
        yearFrom: 2023,
      },
      providers: {},
    };

    const query = provider.translateQuery(ast);

    // First search - get 3 results
    const firstBatch: unknown[] = [];
    for await (const article of provider.search(query, { maxResults: 3 })) {
      firstBatch.push(article);
    }
    expect(firstBatch.length).toBe(3);

    // Get state after search
    const state = provider.getSearchState();
    expect(state).not.toBeNull();
    expect(state!.retrievedCount).toBe(3);

    // Validate state
    const validation = await provider.validateState(state!);
    expect(validation.valid).toBe(true);

    // Resume search - get more results
    const secondBatch: unknown[] = [];
    for await (const article of provider.resumeSearch(state!)) {
      secondBatch.push(article);
      if (secondBatch.length >= 3) break; // Limit for test speed
    }

    expect(secondBatch.length).toBeGreaterThan(0);

    // Verify no duplicates between batches
    const firstIds = new Set(firstBatch.map((a) => (a as { ericId: string }).ericId));
    for (const article of secondBatch) {
      const id = (article as { ericId: string }).ericId;
      expect(firstIds.has(id)).toBe(false);
    }
  });
});
