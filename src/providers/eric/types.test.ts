/**
 * Tests for ERIC-specific types.
 */

import { describe, it, expect } from 'vitest';
import type { ERICDocument, ERICSearchResponse, ERICConfig } from './types';
import type { Article } from '../base/types';

describe('ERIC Types', () => {
  describe('ERICDocument', () => {
    it('should be compatible with base Article type', () => {
      const ericDoc: ERICDocument = {
        // Required Article fields
        title: 'Effects of Technology on Student Learning',
        authors: [
          { family: 'Smith', given: 'John' },
          { family: 'Doe', given: 'Jane' },
        ],
        source: 'eric',
        retrievedAt: new Date().toISOString(),

        // ERIC-specific identifier
        ericId: 'EJ123456',

        // Optional fields
        abstract: 'This study examines the impact of educational technology.',
        publicationDate: '2023',
        journal: 'Journal of Educational Technology',
      };

      // Should be assignable to Article
      const article: Article = ericDoc;
      expect(article.ericId).toBe('EJ123456');
      expect(article.title).toBe('Effects of Technology on Student Learning');
    });

    it('should support ERIC-specific fields', () => {
      const ericDoc: ERICDocument = {
        title: 'Special Education Research',
        authors: [{ family: 'Johnson', given: 'Mary' }],
        source: 'eric',
        retrievedAt: new Date().toISOString(),
        ericId: 'ED654321',

        // ERIC-specific optional fields
        descriptors: ['Special Education', 'Learning Disabilities', 'Teaching Methods'],
        peerReviewed: true,
        publicationType: 'Journal Articles',
      };

      expect(ericDoc.descriptors).toContain('Special Education');
      expect(ericDoc.peerReviewed).toBe(true);
      expect(ericDoc.publicationType).toBe('Journal Articles');
    });

    it('should handle ERIC ID formats (EJ and ED)', () => {
      // EJ = Journal article
      const journalDoc: ERICDocument = {
        title: 'Journal Article',
        authors: [],
        source: 'eric',
        retrievedAt: new Date().toISOString(),
        ericId: 'EJ123456',
      };
      expect(journalDoc.ericId.startsWith('EJ')).toBe(true);

      // ED = Document
      const docDoc: ERICDocument = {
        title: 'ERIC Document',
        authors: [],
        source: 'eric',
        retrievedAt: new Date().toISOString(),
        ericId: 'ED654321',
      };
      expect(docDoc.ericId.startsWith('ED')).toBe(true);
    });
  });

  describe('ERICSearchResponse', () => {
    it('should represent ERIC API response structure', () => {
      const response: ERICSearchResponse = {
        response: {
          numFound: 1234,
          start: 0,
          docs: [
            {
              id: 'EJ123456',
              title: 'Test Article',
              author: ['Smith, John'],
              description: 'Abstract text',
              publicationdateyear: 2023,
              source: 'Test Journal',
            },
          ],
        },
      };

      expect(response.response.numFound).toBe(1234);
      expect(response.response.docs).toHaveLength(1);
      const firstDoc = response.response.docs[0];
      expect(firstDoc).toBeDefined();
      expect(firstDoc!.id).toBe('EJ123456');
    });

    it('should handle optional fields in response', () => {
      const response: ERICSearchResponse = {
        response: {
          numFound: 1,
          start: 0,
          docs: [
            {
              id: 'EJ123456',
              title: 'Minimal Article',
              // All other fields optional
            },
          ],
        },
      };

      const doc = response.response.docs[0];
      expect(doc).toBeDefined();
      expect(doc!.author).toBeUndefined();
      expect(doc!.description).toBeUndefined();
    });
  });

  describe('ERICConfig', () => {
    it('should extend base provider config', () => {
      const config: ERICConfig = {
        // Base provider config
        rateLimit: 5,
        timeout: 30000,
        retries: 3,

        // ERIC-specific config
        maxResultsPerPage: 2000,
      };

      expect(config.rateLimit).toBe(5);
      expect(config.maxResultsPerPage).toBe(2000);
    });

    it('should have reasonable defaults implied', () => {
      // Minimal config should be valid
      const config: ERICConfig = {};
      expect(config).toBeDefined();
    });
  });
});
