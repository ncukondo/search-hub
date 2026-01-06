/**
 * Scopus Response Parser Tests
 */
import { describe, it, expect } from 'vitest';
import { parseSearchResponse, parseDocument } from './parser';
import type { ScopusRawEntry } from './types';

describe('Scopus Response Parser', () => {
  describe('parseSearchResponse', () => {
    it('should parse search-results structure', () => {
      const json = {
        'search-results': {
          'opensearch:totalResults': '1234',
          'opensearch:startIndex': '0',
          'opensearch:itemsPerPage': '25',
          entry: [
            {
              'dc:identifier': 'SCOPUS_ID:85123456789',
              'dc:title': 'Test Article',
            },
          ],
        },
      };

      const result = parseSearchResponse(json);
      expect(result.totalResults).toBe(1234);
      expect(result.startIndex).toBe(0);
      expect(result.itemsPerPage).toBe(25);
      expect(result.entries).toHaveLength(1);
    });

    it('should extract opensearch:totalResults', () => {
      const json = {
        'search-results': {
          'opensearch:totalResults': '5000',
          'opensearch:startIndex': '100',
          'opensearch:itemsPerPage': '25',
          entry: [],
        },
      };

      const result = parseSearchResponse(json);
      expect(result.totalResults).toBe(5000);
    });

    it('should extract entry array', () => {
      const json = {
        'search-results': {
          'opensearch:totalResults': '2',
          'opensearch:startIndex': '0',
          'opensearch:itemsPerPage': '25',
          entry: [
            { 'dc:identifier': 'SCOPUS_ID:1' },
            { 'dc:identifier': 'SCOPUS_ID:2' },
          ],
        },
      };

      const result = parseSearchResponse(json);
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0]!['dc:identifier']).toBe('SCOPUS_ID:1');
    });

    it('should handle empty entry array', () => {
      const json = {
        'search-results': {
          'opensearch:totalResults': '0',
          'opensearch:startIndex': '0',
          'opensearch:itemsPerPage': '25',
          entry: [],
        },
      };

      const result = parseSearchResponse(json);
      expect(result.entries).toHaveLength(0);
    });

    it('should handle missing entry array', () => {
      const json = {
        'search-results': {
          'opensearch:totalResults': '0',
          'opensearch:startIndex': '0',
          'opensearch:itemsPerPage': '25',
        },
      };

      const result = parseSearchResponse(json);
      expect(result.entries).toHaveLength(0);
    });
  });

  describe('parseDocument', () => {
    it('should extract document fields', () => {
      const entry: ScopusRawEntry = {
        'dc:identifier': 'SCOPUS_ID:85123456789',
        'dc:title': 'Machine Learning in Healthcare',
        'dc:creator': 'Smith J.',
        'dc:description': 'An abstract about ML in healthcare.',
        'prism:doi': '10.1234/ml.2024.001',
        'prism:coverDate': '2024-01-15',
        'prism:publicationName': 'Journal of Medical AI',
        'prism:volume': '10',
        'prism:issueIdentifier': '2',
        'prism:pageRange': '100-115',
        'citedby-count': '42',
        eid: '2-s2.0-85123456789',
        subtypeDescription: 'Article',
      };

      const result = parseDocument(entry);
      expect(result.scopusId).toBe('SCOPUS_ID:85123456789');
      expect(result.title).toBe('Machine Learning in Healthcare');
      expect(result.abstract).toBe('An abstract about ML in healthcare.');
      expect(result.doi).toBe('10.1234/ml.2024.001');
      expect(result.publicationDate).toBe('2024-01-15');
      expect(result.journal).toBe('Journal of Medical AI');
      expect(result.volume).toBe('10');
      expect(result.issue).toBe('2');
      expect(result.pages).toBe('100-115');
      expect(result.citedByCount).toBe(42);
      expect(result.eid).toBe('2-s2.0-85123456789');
      expect(result.sourceType).toBe('Article');
    });

    it('should handle missing optional fields', () => {
      const entry: ScopusRawEntry = {
        'dc:identifier': 'SCOPUS_ID:12345678',
        'dc:title': 'Minimal Article',
      };

      const result = parseDocument(entry);
      expect(result.scopusId).toBe('SCOPUS_ID:12345678');
      expect(result.title).toBe('Minimal Article');
      expect(result.abstract).toBeUndefined();
      expect(result.doi).toBeUndefined();
      expect(result.journal).toBeUndefined();
      expect(result.citedByCount).toBeUndefined();
    });

    it('should parse author array', () => {
      const entry: ScopusRawEntry = {
        'dc:identifier': 'SCOPUS_ID:12345678',
        'dc:title': 'Test Article',
        author: [
          { authname: 'Smith, John', authid: '123456' },
          { authname: 'Doe, Jane', authid: '789012' },
        ],
      };

      const result = parseDocument(entry);
      expect(result.authors).toHaveLength(2);
      expect(result.authors[0]!.family).toBe('Smith');
      expect(result.authors[0]!.given).toBe('John');
      expect(result.authors[0]!.authid).toBe('123456');
      expect(result.authors[1]!.family).toBe('Doe');
      expect(result.authors[1]!.given).toBe('Jane');
    });

    it('should handle author with only last name', () => {
      const entry: ScopusRawEntry = {
        'dc:identifier': 'SCOPUS_ID:12345678',
        'dc:title': 'Test Article',
        author: [{ authname: 'Smith', authid: '123456' }],
      };

      const result = parseDocument(entry);
      expect(result.authors[0]!.family).toBe('Smith');
      expect(result.authors[0]!.given).toBeUndefined();
    });

    it('should fallback to dc:creator when author array is missing', () => {
      const entry: ScopusRawEntry = {
        'dc:identifier': 'SCOPUS_ID:12345678',
        'dc:title': 'Test Article',
        'dc:creator': 'Smith J.',
      };

      const result = parseDocument(entry);
      expect(result.authors).toHaveLength(1);
      expect(result.authors[0]!.family).toBe('Smith J.');
    });

    it('should parse date from prism:coverDate', () => {
      const entry: ScopusRawEntry = {
        'dc:identifier': 'SCOPUS_ID:12345678',
        'dc:title': 'Test Article',
        'prism:coverDate': '2024-06-15',
      };

      const result = parseDocument(entry);
      expect(result.publicationDate).toBe('2024-06-15');
    });

    it('should extract citation count', () => {
      const entry: ScopusRawEntry = {
        'dc:identifier': 'SCOPUS_ID:12345678',
        'dc:title': 'Test Article',
        'citedby-count': '150',
      };

      const result = parseDocument(entry);
      expect(result.citedByCount).toBe(150);
    });

    it('should set source and retrievedAt', () => {
      const entry: ScopusRawEntry = {
        'dc:identifier': 'SCOPUS_ID:12345678',
        'dc:title': 'Test Article',
      };

      const result = parseDocument(entry);
      expect(result.source).toBe('scopus');
      expect(result.retrievedAt).toBeDefined();
      // Check if retrievedAt is a valid ISO string
      expect(() => new Date(result.retrievedAt)).not.toThrow();
    });
  });

  describe('Zod validation', () => {
    it('should return empty response for completely invalid JSON', () => {
      const result = parseSearchResponse('not json');
      expect(result.totalResults).toBe(0);
      expect(result.entries).toHaveLength(0);
    });

    it('should return empty response for missing search-results', () => {
      const json = { wrongKey: 'value' };
      const result = parseSearchResponse(json);
      expect(result.totalResults).toBe(0);
      expect(result.entries).toHaveLength(0);
    });

    it('should return empty response for null input', () => {
      const result = parseSearchResponse(null);
      expect(result.totalResults).toBe(0);
      expect(result.entries).toHaveLength(0);
    });

    it('should return empty response for undefined input', () => {
      const result = parseSearchResponse(undefined);
      expect(result.totalResults).toBe(0);
      expect(result.entries).toHaveLength(0);
    });

    it('should handle array input gracefully', () => {
      const result = parseSearchResponse([1, 2, 3]);
      expect(result.totalResults).toBe(0);
      expect(result.entries).toHaveLength(0);
    });

    it('should handle partial valid structure', () => {
      const json = {
        'search-results': {
          'opensearch:totalResults': '10',
          // missing other fields
        },
      };
      const result = parseSearchResponse(json);
      expect(result.totalResults).toBe(10);
      expect(result.entries).toHaveLength(0);
    });

    it('should handle entry with unexpected extra fields', () => {
      const json = {
        'search-results': {
          'opensearch:totalResults': '1',
          'opensearch:startIndex': '0',
          'opensearch:itemsPerPage': '25',
          entry: [
            {
              'dc:identifier': 'SCOPUS_ID:12345',
              'dc:title': 'Test',
              unexpectedField: 'should be ignored',
            },
          ],
        },
      };
      const result = parseSearchResponse(json);
      expect(result.totalResults).toBe(1);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]!['dc:identifier']).toBe('SCOPUS_ID:12345');
    });
  });
});
