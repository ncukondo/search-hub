/**
 * Scopus-specific types test
 */
import { describe, it, expect } from 'vitest';
import type { ScopusDocument, ScopusSearchResponse, ScopusConfig, ScopusAuthor } from './types';
import type { Article } from '../base/types';

describe('Scopus Types', () => {
  describe('ScopusDocument', () => {
    it('should be compatible with Article type', () => {
      const scopusDoc: ScopusDocument = {
        title: 'Machine Learning for Healthcare',
        authors: [{ family: 'Smith', given: 'John', authid: '12345678' }],
        source: 'scopus',
        retrievedAt: new Date().toISOString(),
        scopusId: 'SCOPUS_ID:85123456789',
        abstract: 'An abstract about machine learning in healthcare.',
        publicationDate: '2024-01-15',
        journal: 'Journal of Medical AI',
        doi: '10.1234/jmai.2024.001',
        citedByCount: 42,
      };

      // Should be assignable to Article
      const article: Article = scopusDoc;
      expect(article.title).toBe('Machine Learning for Healthcare');
      expect(article.source).toBe('scopus');
      expect(article.scopusId).toBe('SCOPUS_ID:85123456789');
    });

    it('should support Scopus-specific fields', () => {
      const scopusDoc: ScopusDocument = {
        title: 'Test Article',
        authors: [{ family: 'Doe', given: 'Jane' }],
        source: 'scopus',
        retrievedAt: new Date().toISOString(),
        scopusId: 'SCOPUS_ID:12345678',
        citedByCount: 100,
        eid: '2-s2.0-85123456789',
        sourceType: 'journal',
      };

      expect(scopusDoc.citedByCount).toBe(100);
      expect(scopusDoc.eid).toBe('2-s2.0-85123456789');
      expect(scopusDoc.sourceType).toBe('journal');
    });
  });

  describe('ScopusAuthor', () => {
    it('should extend base Author with authid', () => {
      const author: ScopusAuthor = {
        family: 'Smith',
        given: 'John',
        authid: '12345678',
        affiliation: 'MIT',
      };

      expect(author.authid).toBe('12345678');
      expect(author.family).toBe('Smith');
    });
  });

  describe('ScopusSearchResponse', () => {
    it('should represent API response structure', () => {
      const response: ScopusSearchResponse = {
        totalResults: 1234,
        startIndex: 0,
        itemsPerPage: 25,
        entries: [
          {
            'dc:identifier': 'SCOPUS_ID:85123456789',
            'dc:title': 'Test Article',
            'dc:creator': 'Smith J.',
            'prism:coverDate': '2024-01-15',
          },
        ],
      };

      expect(response.totalResults).toBe(1234);
      expect(response.entries).toHaveLength(1);
    });
  });

  describe('ScopusConfig', () => {
    it('should require api_key', () => {
      const config: ScopusConfig = {
        apiKey: 'test-api-key',
        rateLimit: 2,
        timeout: 30000,
        retries: 3,
      };

      expect(config.apiKey).toBe('test-api-key');
    });

    it('should support optional institutional token', () => {
      const config: ScopusConfig = {
        apiKey: 'test-api-key',
        instToken: 'institutional-token',
      };

      expect(config.instToken).toBe('institutional-token');
    });
  });
});
