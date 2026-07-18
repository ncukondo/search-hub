/**
 * PubMed Provider API Tests
 *
 * These tests call the actual PubMed API and should be run separately:
 *   npm run test:api
 *
 * Requirements:
 * - Network access to PubMed E-utilities
 * - Optional: SEARCH_HUB_PUBMED_API_KEY environment variable for higher rate limits (10 req/s vs 3 req/s)
 * - Optional: SEARCH_HUB_PUBMED_EMAIL environment variable (defaults to test@example.com)
 *
 * Note: These tests make real API calls and are subject to NCBI rate limits.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { PubMedProvider } from './provider';
import { PubMedClient } from './client';
import { RateLimiter } from '../base/rate-limiter';
import { translateQuery } from './translator';
import type { PubMedConfig } from './types';
import type { QueryAST, Article } from '../base/types';

const TEST_EMAIL = process.env['SEARCH_HUB_PUBMED_EMAIL'] ?? 'test@example.com';
const API_KEY = process.env['SEARCH_HUB_PUBMED_API_KEY'];

const skip = !API_KEY;

/**
 * Create provider config from environment.
 */
function createConfig(): PubMedConfig {
  const config: PubMedConfig = { email: TEST_EMAIL };
  if (API_KEY) {
    config.apiKey = API_KEY;
  }
  return config;
}

/**
 * Create a simple query AST for testing.
 */
function createTestQuery(keyword: string): QueryAST {
  return {
    name: 'test-query',
    blocks: [
      {
        id: 'block-1',
        field: 'title_abstract',
        operator: 'OR',
        terms: {
          keywords: [keyword],
        },
      },
    ],
    filters: {},
    providers: {},
  };
}

describe.skipIf(skip)('PubMed Provider E2E', () => {
  let provider: PubMedProvider;

  beforeAll(() => {
    provider = new PubMedProvider(createConfig());
  });

  describe('search functionality', () => {
    it('should search PubMed with simple query', async () => {
      const ast = createTestQuery('diabetes');
      const query = translateQuery(ast);

      const articles: Article[] = [];
      for await (const article of provider.search(query, { maxResults: 5 })) {
        articles.push(article);
      }

      expect(articles.length).toBeGreaterThan(0);
      expect(articles.length).toBeLessThanOrEqual(5);
      expect(articles[0]).toHaveProperty('title');
      expect(articles[0]).toHaveProperty('pmid');
    }, 30000);

    it('should search with field qualifiers', async () => {
      const ast: QueryAST = {
        name: 'field-query',
        blocks: [
          {
            id: 'block-1',
            field: 'title',
            operator: 'OR',
            terms: {
              keywords: ['insulin resistance'],
            },
          },
        ],
        filters: {},
        providers: {},
      };
      const query = translateQuery(ast);

      const articles: Article[] = [];
      for await (const article of provider.search(query, { maxResults: 3 })) {
        articles.push(article);
      }

      expect(articles.length).toBeGreaterThan(0);
      // Title search should have relevant titles
      expect(
        articles.some(
          (a) =>
            a.title.toLowerCase().includes('insulin') ||
            a.title.toLowerCase().includes('resistance'),
        ),
      ).toBe(true);
    }, 30000);

    it('should handle empty results gracefully', async () => {
      const ast = createTestQuery('xyznonexistentquery12345');
      const query = translateQuery(ast);

      const articles: Article[] = [];
      for await (const article of provider.search(query)) {
        articles.push(article);
      }

      expect(articles).toHaveLength(0);
    }, 30000);
  });

  describe('pagination', () => {
    it('should paginate through multiple pages', async () => {
      const ast = createTestQuery('cancer');
      const query = translateQuery(ast);

      const articles: Article[] = [];
      for await (const article of provider.search(query, { maxResults: 25, pageSize: 10 })) {
        articles.push(article);
      }

      // Should have fetched 25 articles across multiple pages
      expect(articles).toHaveLength(25);
    }, 60000);
  });

  describe('testConnection', () => {
    it('should verify API connectivity', async () => {
      const result = await provider.testConnection();
      expect(result).toBe(true);
    }, 30000);
  });

  describe('article details', () => {
    it('should fetch article with full details', async () => {
      const ast = createTestQuery('COVID-19 vaccine');
      const query = translateQuery(ast);

      const articles: Article[] = [];
      for await (const article of provider.search(query, { maxResults: 1 })) {
        articles.push(article);
      }

      expect(articles).toHaveLength(1);
      const article = articles[0]!;

      // Required fields
      expect(article.pmid).toBeDefined();
      expect(article.title).toBeDefined();
      expect(article.source).toBe('pubmed');
      expect(article.retrievedAt).toBeDefined();

      // Authors should be parsed
      expect(article.authors).toBeDefined();
      expect(article.authors.length).toBeGreaterThan(0);
    }, 30000);
  });

  describe('ELink related articles', () => {
    it('should find related articles for a known PMID', async () => {
      const config = createConfig();
      const rateLimiter = new RateLimiter({
        tokensPerSecond: config.apiKey ? 10 : 3,
        burstSize: 1,
      });
      const client = new PubMedClient(config, rateLimiter);

      // PMID 25418537 = a well-cited systematic review
      const result = await client.findRelated({ ids: ['25418537'], maxResults: 10 });

      expect(result).toHaveLength(1);
      expect(result[0]!.seedId).toBe('25418537');
      expect(result[0]!.relatedIds.length).toBeGreaterThan(0);
      expect(result[0]!.relatedIds.length).toBeLessThanOrEqual(10);

      // Scores should be sorted descending
      for (let i = 1; i < result[0]!.relatedIds.length; i++) {
        expect(result[0]!.relatedIds[i]!.score).toBeLessThanOrEqual(
          result[0]!.relatedIds[i - 1]!.score,
        );
      }

      // Each related article should have valid id and score
      for (const related of result[0]!.relatedIds) {
        expect(related.id).toMatch(/^\d+$/);
        expect(related.score).toBeGreaterThan(0);
      }
    }, 30000);

    it('should merge and deduplicate across multiple seeds', async () => {
      const config = createConfig();
      const rateLimiter = new RateLimiter({
        tokensPerSecond: config.apiKey ? 10 : 3,
        burstSize: 1,
      });
      const client = new PubMedClient(config, rateLimiter);

      const seeds = ['25418537', '26978785'];
      const result = await client.findRelatedMerged({ ids: seeds, maxResults: 20 });

      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeLessThanOrEqual(20);

      // Seeds should be excluded
      const ids = result.map((r) => r.id);
      expect(ids).not.toContain('25418537');
      expect(ids).not.toContain('26978785');

      // No duplicates
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);

      // Sorted by score descending
      for (let i = 1; i < result.length; i++) {
        expect(result[i]!.score).toBeLessThanOrEqual(result[i - 1]!.score);
      }
    }, 30000);
  });

  describe('session resume', () => {
    it('should track search state during iteration', async () => {
      const ast = createTestQuery('hypertension');
      const query = translateQuery(ast);

      // Start search and consume a few articles
      let count = 0;
      for await (const _ of provider.search(query, { maxResults: 5 })) {
        count++;
        if (count >= 3) break;
      }

      // State should be populated
      const state = provider.getSearchState();
      expect(state).not.toBeNull();
      expect(state!.provider).toBe('pubmed');
      expect(state!.retrievedCount).toBe(3);
    }, 30000);

    it('should validate offset-based state', async () => {
      const ast = createTestQuery('aspirin');

      // Create a state without webenv (offset-based)
      const state = {
        provider: 'pubmed' as const,
        query: translateQuery(ast),
        totalResults: 100,
        retrievedCount: 50,
        lastUpdated: new Date(),
      };

      const result = await provider.validateState(state);
      expect(result.valid).toBe(true);
    }, 30000);
  });
});
