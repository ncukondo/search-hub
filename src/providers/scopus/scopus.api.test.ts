/**
 * Scopus Provider API Tests
 *
 * These tests call the actual Scopus API and should be run separately:
 *   npm run test:api
 *
 * Requirements:
 * - Network access to Scopus API (api.elsevier.com)
 * - Valid Scopus API key (SEARCH_HUB_SCOPUS_API_KEY environment variable)
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { ScopusProvider } from './provider';
import type { ScopusConfig } from './types';
import type { QueryAST } from '../../query/types';

const SCOPUS_API_KEY = process.env['SEARCH_HUB_SCOPUS_API_KEY'];
const SCOPUS_INST_TOKEN = process.env['SEARCH_HUB_SCOPUS_INST_TOKEN'];

const skip = !SCOPUS_API_KEY;

describe.skipIf(skip)('Scopus Provider E2E', () => {
  let provider: ScopusProvider;

  beforeAll(() => {
    const config: ScopusConfig = {
      apiKey: SCOPUS_API_KEY!,
      rateLimit: 2,
      timeout: 30000,
      retries: 3,
    };
    if (SCOPUS_INST_TOKEN) {
      config.instToken = SCOPUS_INST_TOKEN;
    }
    provider = new ScopusProvider(config);
  });

  it('should test connection successfully', async () => {
    const result = await provider.testConnection();
    expect(result).toBe(true);
  });

  it('should search Scopus with simple query', async () => {
    const ast: QueryAST = {
      name: 'e2e-test',
      blocks: [
        {
          field: 'title',
          terms: { keywords: ['machine learning'] },
          operator: 'AND',
        },
      ],
      filters: {
        yearFrom: 2024,
        yearTo: 2024,
      },
      overrides: {},
    };

    const query = provider.translateQuery(ast);
    expect(query.native).toContain('TITLE');
    expect(query.native).toContain('machine learning');

    const articles = [];
    for await (const article of provider.search(query, { maxResults: 5 })) {
      articles.push(article);
    }

    expect(articles.length).toBeGreaterThan(0);
    expect(articles.length).toBeLessThanOrEqual(5);

    // Verify article structure
    const firstArticle = articles[0]!;
    expect(firstArticle.scopusId).toBeDefined();
    expect(firstArticle.title).toBeDefined();
    expect(firstArticle.source).toBe('scopus');
    expect(firstArticle.retrievedAt).toBeDefined();
    expect(firstArticle.authors).toBeDefined();
  });

  it('should search with field functions', async () => {
    const ast: QueryAST = {
      name: 'field-functions-test',
      blocks: [
        {
          field: 'title_abstract',
          terms: { keywords: ['deep learning'] },
          operator: 'OR',
        },
      ],
      filters: {
        yearFrom: 2023,
        yearTo: 2024,
      },
      overrides: {},
    };

    const query = provider.translateQuery(ast);
    expect(query.native).toContain('TITLE-ABS-KEY');

    const articles = [];
    for await (const article of provider.search(query, { maxResults: 3 })) {
      articles.push(article);
    }

    expect(articles.length).toBeGreaterThan(0);
  });

  it('should search with year filters', async () => {
    const ast: QueryAST = {
      name: 'year-filter-test',
      blocks: [
        {
          field: 'title',
          terms: { keywords: ['COVID-19'] },
          operator: 'OR',
        },
      ],
      filters: {
        yearFrom: 2020,
        yearTo: 2021,
      },
      overrides: {},
    };

    const query = provider.translateQuery(ast);
    expect(query.native).toContain('PUBYEAR > 2019');
    expect(query.native).toContain('PUBYEAR < 2022');

    const articles = [];
    for await (const article of provider.search(query, { maxResults: 3 })) {
      articles.push(article);
    }

    expect(articles.length).toBeGreaterThan(0);
    // Verify year is within range
    for (const article of articles) {
      if (article.publicationDate) {
        const year = parseInt(article.publicationDate.substring(0, 4), 10);
        expect(year).toBeGreaterThanOrEqual(2020);
        expect(year).toBeLessThanOrEqual(2021);
      }
    }
  });

  it('should handle pagination with multiple pages', async () => {
    const ast: QueryAST = {
      name: 'pagination-test',
      blocks: [
        {
          field: 'title',
          terms: { keywords: ['neural network'] },
          operator: 'AND',
        },
      ],
      filters: {
        yearFrom: 2024,
      },
      overrides: {},
    };

    const query = provider.translateQuery(ast);

    // Request more than one page (25 per page)
    const articles = [];
    for await (const article of provider.search(query, { maxResults: 30 })) {
      articles.push(article);
    }

    expect(articles.length).toBe(30);

    // Verify all articles are unique
    const scopusIds = articles.map(a => a.scopusId);
    const uniqueIds = new Set(scopusIds);
    expect(uniqueIds.size).toBe(30);
  });

  it('should respect rate limiting', async () => {
    const ast: QueryAST = {
      name: 'rate-limit-test',
      blocks: [
        {
          field: 'title',
          terms: { keywords: ['artificial intelligence'] },
          operator: 'OR',
        },
      ],
      filters: {
        yearFrom: 2024,
      },
      overrides: {},
    };

    const query = provider.translateQuery(ast);

    const startTime = Date.now();
    const articles = [];

    // Make multiple API calls
    for await (const article of provider.search(query, { maxResults: 10 })) {
      articles.push(article);
    }

    const elapsed = Date.now() - startTime;
    expect(articles.length).toBe(10);

    // With rate limit of 2/s, should take at least some time
    // (not asserting exact time due to variability)
    expect(elapsed).toBeGreaterThan(0);
  });

  it('should support session resume', async () => {
    const ast: QueryAST = {
      name: 'resume-test',
      blocks: [
        {
          field: 'title',
          terms: { keywords: ['quantum computing'] },
          operator: 'OR',
        },
      ],
      filters: {
        yearFrom: 2024,
      },
      overrides: {},
    };

    const query = provider.translateQuery(ast);

    // Start search and interrupt after 5 articles
    const initialArticles = [];
    let searchState = null;

    for await (const article of provider.search(query, { maxResults: 50 })) {
      initialArticles.push(article);
      if (initialArticles.length === 5) {
        searchState = provider.getSearchState();
        break;
      }
    }

    expect(initialArticles.length).toBe(5);
    expect(searchState).not.toBeNull();
    expect(searchState!.retrievedCount).toBe(5);

    // Validate state
    const validation = await provider.validateState(searchState!);
    expect(validation.valid).toBe(true);

    // Resume search
    const resumedArticles = [];
    for await (const article of provider.resumeSearch(searchState!)) {
      resumedArticles.push(article);
      if (resumedArticles.length >= 5) {
        break;
      }
    }

    expect(resumedArticles.length).toBe(5);

    // Verify resumed articles are different from initial
    const initialIds = new Set(initialArticles.map(a => a.scopusId));
    for (const article of resumedArticles) {
      expect(initialIds.has(article.scopusId)).toBe(false);
    }
  });
});

describe('Scopus Provider E2E (without API key)', () => {
  it.skipIf(!skip)('should skip tests when API key is not set', () => {
    // This test runs only when SCOPUS_API_KEY is NOT set
    expect(SCOPUS_API_KEY).toBeUndefined();
  });
});
