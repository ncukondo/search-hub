import { describe, it, expect } from 'vitest';
import type { Article } from '../base/types.js';
import type {
  ArxivPaper,
  ArxivSearchResponse,
  ArxivConfig,
  ArxivCategory,
  ArxivProviderState,
} from './types.js';

describe('ArxivPaper', () => {
  it('should be compatible with base Article type', () => {
    const paper: ArxivPaper = {
      arxivId: '2401.12345',
      title: 'Machine Learning for Diabetes Prediction',
      authors: [{ given: 'John', family: 'Smith' }],
      source: 'arxiv',
      retrievedAt: new Date().toISOString(),
      abstract: 'This paper presents...',
      publicationDate: '2024-01-15',
      categories: ['cs.AI', 'cs.LG'],
      primaryCategory: 'cs.AI',
      versions: [{ version: 'v1', submitted: '2024-01-15T00:00:00Z' }],
    };

    // ArxivPaper should be assignable to Article
    const article: Article = paper;
    expect(article.title).toBe(paper.title);
    expect(article.arxivId).toBe(paper.arxivId);
    expect(article.source).toBe('arxiv');
  });

  it('should have arXiv-specific fields', () => {
    const paper: ArxivPaper = {
      arxivId: '2401.12345',
      title: 'Test Paper',
      authors: [{ given: 'Jane', family: 'Doe' }],
      source: 'arxiv',
      retrievedAt: new Date().toISOString(),
      categories: ['physics.gen-ph'],
      primaryCategory: 'physics.gen-ph',
    };

    expect(paper.categories).toContain('physics.gen-ph');
    expect(paper.primaryCategory).toBe('physics.gen-ph');
  });

  it('should support optional DOI field', () => {
    const paper: ArxivPaper = {
      arxivId: '2401.12345',
      title: 'Test Paper',
      authors: [],
      source: 'arxiv',
      retrievedAt: new Date().toISOString(),
      categories: ['cs.AI'],
      primaryCategory: 'cs.AI',
      doi: '10.1234/example.2024',
    };

    expect(paper.doi).toBe('10.1234/example.2024');
  });
});

describe('ArxivSearchResponse', () => {
  it('should contain total results and entries', () => {
    const response: ArxivSearchResponse = {
      totalResults: 100,
      startIndex: 0,
      itemsPerPage: 10,
      entries: [],
    };

    expect(response.totalResults).toBe(100);
    expect(response.entries).toHaveLength(0);
  });
});

describe('ArxivConfig', () => {
  it('should have default configuration values', () => {
    const config: ArxivConfig = {
      baseUrl: 'http://export.arxiv.org/api/query',
      rateLimit: 0.33, // 1 request per 3 seconds
      timeout: 60000,
      retries: 3,
      maxResults: 10000,
    };

    expect(config.rateLimit).toBeCloseTo(0.33, 2);
    expect(config.timeout).toBe(60000);
  });
});

describe('ArxivCategory', () => {
  it('should represent arXiv category taxonomy', () => {
    const categories: ArxivCategory[] = ['cs.AI', 'cs.LG', 'physics.gen-ph', 'math.NA'];
    expect(categories).toContain('cs.AI');
  });
});

describe('ArxivProviderState', () => {
  it('should contain offset for pagination resume', () => {
    const state: ArxivProviderState = {
      offset: 100,
    };

    expect(state.offset).toBe(100);
  });
});
