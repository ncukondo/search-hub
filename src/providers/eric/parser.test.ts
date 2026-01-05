/**
 * Tests for ERIC JSON response parser.
 */

import { describe, it, expect } from 'vitest';
import { parseSearchResponse, parseDocument } from './parser';
import type { ERICRawDocument, ERICSearchResponse } from './types';

describe('ERIC Response Parser', () => {
  describe('parseSearchResponse', () => {
    it('should parse valid search response', () => {
      const response: ERICSearchResponse = {
        response: {
          numFound: 100,
          start: 0,
          docs: [
            {
              id: 'EJ123456',
              title: 'Test Article',
              author: ['Smith, John'],
              description: 'Test abstract',
              publicationdateyear: 2023,
              source: 'Test Journal',
            },
          ],
        },
      };

      const result = parseSearchResponse(response);
      expect(result.totalResults).toBe(100);
      expect(result.start).toBe(0);
      expect(result.documents).toHaveLength(1);
    });

    it('should parse numFound and start fields', () => {
      const response: ERICSearchResponse = {
        response: {
          numFound: 1234,
          start: 50,
          docs: [],
        },
      };

      const result = parseSearchResponse(response);
      expect(result.totalResults).toBe(1234);
      expect(result.start).toBe(50);
    });

    it('should parse multiple documents', () => {
      const response: ERICSearchResponse = {
        response: {
          numFound: 2,
          start: 0,
          docs: [
            { id: 'EJ111111', title: 'Article 1' },
            { id: 'EJ222222', title: 'Article 2' },
          ],
        },
      };

      const result = parseSearchResponse(response);
      expect(result.documents).toHaveLength(2);
      expect(result.documents[0]!.ericId).toBe('EJ111111');
      expect(result.documents[1]!.ericId).toBe('EJ222222');
    });

    it('should handle empty docs array', () => {
      const response: ERICSearchResponse = {
        response: {
          numFound: 0,
          start: 0,
          docs: [],
        },
      };

      const result = parseSearchResponse(response);
      expect(result.totalResults).toBe(0);
      expect(result.documents).toHaveLength(0);
    });
  });

  describe('parseDocument', () => {
    it('should extract all document fields', () => {
      const doc: ERICRawDocument = {
        id: 'EJ123456',
        title: 'Effects of Technology on Student Learning',
        author: ['Smith, John', 'Doe, Jane'],
        description: 'This study examines the impact of educational technology.',
        publicationdateyear: 2023,
        source: 'Journal of Educational Technology',
        url: 'https://example.com/article',
        publicationtype: 'Journal Articles',
        peerreviewed: true,
        issn: '1234-5678',
      };

      const result = parseDocument(doc);

      expect(result.ericId).toBe('EJ123456');
      expect(result.title).toBe('Effects of Technology on Student Learning');
      expect(result.abstract).toBe('This study examines the impact of educational technology.');
      expect(result.publicationDate).toBe('2023');
      expect(result.journal).toBe('Journal of Educational Technology');
      expect(result.source).toBe('eric');
      expect(result.peerReviewed).toBe(true);
      expect(result.publicationType).toBe('Journal Articles');
      expect(result.issn).toBe('1234-5678');
    });

    it('should handle missing optional fields', () => {
      const doc: ERICRawDocument = {
        id: 'ED654321',
        title: 'Minimal Document',
      };

      const result = parseDocument(doc);

      expect(result.ericId).toBe('ED654321');
      expect(result.title).toBe('Minimal Document');
      expect(result.authors).toEqual([]);
      expect(result.abstract).toBeUndefined();
      expect(result.publicationDate).toBeUndefined();
      expect(result.journal).toBeUndefined();
    });

    it('should parse author array in "Last, First" format', () => {
      const doc: ERICRawDocument = {
        id: 'EJ123456',
        title: 'Test',
        author: ['Smith, John', 'Doe, Jane Marie', 'Johnson, Robert'],
      };

      const result = parseDocument(doc);

      expect(result.authors).toHaveLength(3);
      expect(result.authors[0]).toEqual({ family: 'Smith', given: 'John' });
      expect(result.authors[1]).toEqual({ family: 'Doe', given: 'Jane Marie' });
      expect(result.authors[2]).toEqual({ family: 'Johnson', given: 'Robert' });
    });

    it('should handle author with no first name', () => {
      const doc: ERICRawDocument = {
        id: 'EJ123456',
        title: 'Test',
        author: ['Smith'],
      };

      const result = parseDocument(doc);

      expect(result.authors).toHaveLength(1);
      expect(result.authors[0]).toEqual({ family: 'Smith' });
    });

    it('should handle empty author array', () => {
      const doc: ERICRawDocument = {
        id: 'EJ123456',
        title: 'Test',
        author: [],
      };

      const result = parseDocument(doc);
      expect(result.authors).toEqual([]);
    });

    it('should extract publication year as string', () => {
      const doc: ERICRawDocument = {
        id: 'EJ123456',
        title: 'Test',
        publicationdateyear: 2023,
      };

      const result = parseDocument(doc);
      expect(result.publicationDate).toBe('2023');
    });

    it('should extract source/journal', () => {
      const doc: ERICRawDocument = {
        id: 'EJ123456',
        title: 'Test',
        source: 'Journal of Educational Research',
      };

      const result = parseDocument(doc);
      expect(result.journal).toBe('Journal of Educational Research');
    });

    it('should set retrievedAt timestamp', () => {
      const doc: ERICRawDocument = {
        id: 'EJ123456',
        title: 'Test',
      };

      const before = new Date().toISOString();
      const result = parseDocument(doc);
      const after = new Date().toISOString();

      expect(result.retrievedAt).toBeDefined();
      expect(result.retrievedAt >= before).toBe(true);
      expect(result.retrievedAt <= after).toBe(true);
    });

    it('should handle subject/descriptors', () => {
      const doc: ERICRawDocument = {
        id: 'EJ123456',
        title: 'Test',
        subject: ['Special Education', 'Learning Disabilities'],
      };

      const result = parseDocument(doc);
      expect(result.descriptors).toEqual(['Special Education', 'Learning Disabilities']);
    });

    it('should store raw response', () => {
      const doc: ERICRawDocument = {
        id: 'EJ123456',
        title: 'Test',
      };

      const result = parseDocument(doc);
      expect(result.rawResponse).toEqual(doc);
    });
  });

  describe('Edge Cases', () => {
    it('should handle malformed author names gracefully', () => {
      const doc: ERICRawDocument = {
        id: 'EJ123456',
        title: 'Test',
        author: ['', 'Smith, John', '  '],
      };

      const result = parseDocument(doc);
      // Should skip empty names
      expect(result.authors.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle author with multiple commas', () => {
      const doc: ERICRawDocument = {
        id: 'EJ123456',
        title: 'Test',
        author: ['Smith, Jr., John'],
      };

      const result = parseDocument(doc);
      // Should handle complex name formats
      expect(result.authors).toHaveLength(1);
      expect(result.authors[0]!.family).toBeDefined();
    });
  });
});
