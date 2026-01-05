import { describe, it, expect } from 'vitest';
import type {
  ProviderName,
  Author,
  Article,
  TranslatedQuery,
  SearchOptions,
  Provider,
  ProviderError,
  RateLimitError,
  AuthError,
} from './types';
import {
  createProviderError,
  isProviderError,
  isRateLimitError,
  isAuthError,
} from './types';

describe('Provider Types', () => {
  describe('ProviderName', () => {
    it('accepts valid provider names', () => {
      const validNames: ProviderName[] = [
        'pubmed',
        'eric',
        'arxiv',
        'scopus',
        'wos',
        'embase',
      ];
      expect(validNames).toHaveLength(6);
    });
  });

  describe('Author', () => {
    it('accepts author with required fields', () => {
      const author: Author = {
        family: 'Smith',
      };
      expect(author.family).toBe('Smith');
    });

    it('accepts author with all optional fields', () => {
      const author: Author = {
        family: 'Smith',
        given: 'John',
        affiliation: 'University of Testing',
        orcid: '0000-0002-1234-5678',
      };
      expect(author.given).toBe('John');
      expect(author.affiliation).toBe('University of Testing');
      expect(author.orcid).toBe('0000-0002-1234-5678');
    });
  });

  describe('Article', () => {
    it('requires at least one identifier', () => {
      const articleWithDoi: Article = {
        doi: '10.1234/test',
        title: 'Test Article',
        authors: [{ family: 'Test' }],
        source: 'pubmed',
        retrievedAt: '2024-01-01T00:00:00Z',
      };
      expect(articleWithDoi.doi).toBe('10.1234/test');
    });

    it('accepts article with pmid identifier', () => {
      const article: Article = {
        pmid: '12345678',
        title: 'Test Article',
        authors: [{ family: 'Test' }],
        source: 'pubmed',
        retrievedAt: '2024-01-01T00:00:00Z',
      };
      expect(article.pmid).toBe('12345678');
    });

    it('accepts article with all optional fields', () => {
      const article: Article = {
        doi: '10.1234/test',
        pmid: '12345678',
        arxivId: 'arxiv:2401.00001',
        scopusId: 'SCOPUS_ID_123',
        ericId: 'ED123456',
        title: 'Test Article',
        authors: [{ family: 'Test', given: 'Author' }],
        source: 'pubmed',
        retrievedAt: '2024-01-01T00:00:00Z',
        abstract: 'Test abstract',
        publicationDate: '2024-01-01',
        journal: 'Test Journal',
        volume: '1',
        issue: '1',
        pages: '1-10',
        rawResponse: { raw: 'data' },
      };
      expect(article.abstract).toBe('Test abstract');
      expect(article.journal).toBe('Test Journal');
    });
  });

  describe('TranslatedQuery', () => {
    it('contains native query string and AST reference', () => {
      const query: TranslatedQuery = {
        native: '(covid[Title/Abstract]) AND (vaccine[MeSH Terms])',
        originalAst: { type: 'and', children: [] },
        provider: 'pubmed',
      };
      expect(query.native).toContain('covid');
      expect(query.provider).toBe('pubmed');
    });
  });

  describe('SearchOptions', () => {
    it('accepts all optional search options', () => {
      const options: SearchOptions = {
        maxResults: 1000,
        pageSize: 100,
        dateRange: {
          start: '2020-01-01',
          end: '2024-01-01',
        },
        signal: new AbortController().signal,
      };
      expect(options.maxResults).toBe(1000);
      expect(options.pageSize).toBe(100);
    });

    it('accepts empty options', () => {
      const options: SearchOptions = {};
      expect(options).toEqual({});
    });
  });

  describe('Provider interface', () => {
    it('defines required methods', () => {
      // Type-level test: ensure Provider has required methods
      type ProviderMethods = keyof Provider;
      const requiredMethods: ProviderMethods[] = [
        'name',
        'search',
        'translateQuery',
        'testConnection',
      ];
      expect(requiredMethods).toHaveLength(4);
    });
  });

  describe('Error types', () => {
    it('ProviderError has correct structure', () => {
      const error: ProviderError = {
        code: 'NETWORK_ERROR',
        message: 'Connection failed',
        provider: 'pubmed',
        retryable: true,
      };
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.retryable).toBe(true);
    });

    it('RateLimitError extends ProviderError', () => {
      const error: RateLimitError = {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests',
        provider: 'pubmed',
        retryable: true,
        retryAfter: 60000,
      };
      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.retryAfter).toBe(60000);
    });

    it('AuthError extends ProviderError', () => {
      const error: AuthError = {
        code: 'API_KEY_INVALID',
        message: 'Invalid API key',
        provider: 'scopus',
        retryable: false,
      };
      expect(error.code).toBe('API_KEY_INVALID');
      expect(error.retryable).toBe(false);
    });
  });

  describe('Helper functions', () => {
    describe('createProviderError', () => {
      it('creates error with defaults', () => {
        const error = createProviderError(
          'NETWORK_ERROR',
          'Connection failed',
          'pubmed'
        );
        expect(error.code).toBe('NETWORK_ERROR');
        expect(error.message).toBe('Connection failed');
        expect(error.provider).toBe('pubmed');
        expect(error.retryable).toBe(false);
      });

      it('creates error with options', () => {
        const cause = new Error('Original error');
        const error = createProviderError(
          'SERVER_ERROR',
          'Server unavailable',
          'eric',
          { retryable: true, cause }
        );
        expect(error.retryable).toBe(true);
        expect(error.cause).toBe(cause);
      });
    });

    describe('isProviderError', () => {
      it('returns true for valid provider error', () => {
        const error = createProviderError(
          'NETWORK_ERROR',
          'Test',
          'pubmed',
          { retryable: true }
        );
        expect(isProviderError(error)).toBe(true);
      });

      it('returns false for null', () => {
        expect(isProviderError(null)).toBe(false);
      });

      it('returns false for undefined', () => {
        expect(isProviderError(undefined)).toBe(false);
      });

      it('returns false for plain Error', () => {
        expect(isProviderError(new Error('test'))).toBe(false);
      });

      it('returns false for object missing required fields', () => {
        expect(isProviderError({ code: 'TEST' })).toBe(false);
        expect(isProviderError({ code: 'TEST', message: 'msg' })).toBe(false);
      });
    });

    describe('isRateLimitError', () => {
      it('returns true for rate limit error', () => {
        const error: RateLimitError = {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests',
          provider: 'pubmed',
          retryable: true,
          retryAfter: 60000,
        };
        expect(isRateLimitError(error)).toBe(true);
      });

      it('returns false for other provider errors', () => {
        const error = createProviderError(
          'NETWORK_ERROR',
          'Test',
          'pubmed'
        );
        expect(isRateLimitError(error)).toBe(false);
      });
    });

    describe('isAuthError', () => {
      it('returns true for API_KEY_MISSING', () => {
        const error: AuthError = {
          code: 'API_KEY_MISSING',
          message: 'API key required',
          provider: 'scopus',
          retryable: false,
        };
        expect(isAuthError(error)).toBe(true);
      });

      it('returns true for API_KEY_INVALID', () => {
        const error: AuthError = {
          code: 'API_KEY_INVALID',
          message: 'Invalid API key',
          provider: 'scopus',
          retryable: false,
        };
        expect(isAuthError(error)).toBe(true);
      });

      it('returns false for other provider errors', () => {
        const error = createProviderError(
          'NETWORK_ERROR',
          'Test',
          'pubmed'
        );
        expect(isAuthError(error)).toBe(false);
      });
    });
  });
});
