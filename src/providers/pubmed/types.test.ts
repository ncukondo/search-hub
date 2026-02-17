/**
 * Tests for PubMed-specific types.
 */

import { describe, it, expect } from 'vitest';
import type { Article } from '../base/types';
import type {
  PubMedArticle,
  ESearchResponse,
  EFetchResponse,
  PubMedConfig,
  PubMedProviderState,
  ELinkOptions,
  RelatedArticle,
  ELinkResponse,
} from './types';

describe('PubMed Types', () => {
  describe('PubMedArticle', () => {
    it('should be compatible with base Article type', () => {
      const pubmedArticle: PubMedArticle = {
        pmid: '12345678',
        title: 'Test Article',
        authors: [{ family: 'Smith', given: 'John' }],
        source: 'pubmed',
        retrievedAt: new Date().toISOString(),
        meshTerms: ['Diabetes Mellitus', 'Humans'],
        pubTypes: ['Journal Article', 'Research Support'],
      };

      // PubMedArticle should satisfy Article interface
      const article: Article = pubmedArticle;
      expect(article.pmid).toBe('12345678');
      expect(article.title).toBe('Test Article');
      expect(article.source).toBe('pubmed');
    });

    it('should support PubMed-specific fields', () => {
      const pubmedArticle: PubMedArticle = {
        pmid: '12345678',
        title: 'Test Article',
        authors: [{ family: 'Doe', given: 'Jane' }],
        source: 'pubmed',
        retrievedAt: new Date().toISOString(),
        meshTerms: ['Diabetes Mellitus, Type 2', 'Insulin Resistance'],
        pubTypes: ['Clinical Trial', 'Randomized Controlled Trial'],
        pmc: 'PMC1234567',
        nlmUniqueId: '0372351',
        journalIssn: '0140-6736',
      };

      expect(pubmedArticle.meshTerms).toContain('Diabetes Mellitus, Type 2');
      expect(pubmedArticle.pubTypes).toContain('Clinical Trial');
      expect(pubmedArticle.pmc).toBe('PMC1234567');
      expect(pubmedArticle.nlmUniqueId).toBe('0372351');
      expect(pubmedArticle.journalIssn).toBe('0140-6736');
    });

    it('should allow all optional fields to be undefined', () => {
      const minimalArticle: PubMedArticle = {
        pmid: '12345678',
        title: 'Test Article',
        authors: [],
        source: 'pubmed',
        retrievedAt: new Date().toISOString(),
      };

      expect(minimalArticle.meshTerms).toBeUndefined();
      expect(minimalArticle.pubTypes).toBeUndefined();
      expect(minimalArticle.abstract).toBeUndefined();
    });
  });

  describe('ESearchResponse', () => {
    it('should represent esearch API response', () => {
      const response: ESearchResponse = {
        count: 1234,
        retmax: 100,
        retstart: 0,
        idlist: ['12345678', '23456789', '34567890'],
        webenv: 'MCID_abc123',
        querykey: '1',
      };

      expect(response.count).toBe(1234);
      expect(response.retmax).toBe(100);
      expect(response.idlist).toHaveLength(3);
      expect(response.webenv).toBe('MCID_abc123');
      expect(response.querykey).toBe('1');
    });

    it('should allow webenv/querykey to be optional', () => {
      const response: ESearchResponse = {
        count: 10,
        retmax: 10,
        retstart: 0,
        idlist: ['12345678'],
      };

      expect(response.webenv).toBeUndefined();
      expect(response.querykey).toBeUndefined();
    });
  });

  describe('EFetchResponse', () => {
    it('should represent efetch API response', () => {
      const response: EFetchResponse = {
        articles: [
          {
            pmid: '12345678',
            title: 'Test Article',
            authors: [],
            source: 'pubmed',
            retrievedAt: new Date().toISOString(),
          },
        ],
      };

      expect(response.articles).toHaveLength(1);
      expect(response.articles[0]?.pmid).toBe('12345678');
    });
  });

  describe('PubMedConfig', () => {
    it('should define provider configuration', () => {
      const config: PubMedConfig = {
        apiKey: 'test-api-key',
        email: 'test@example.com',
        rateLimit: 10,
        timeout: 30000,
        retries: 3,
        maxResults: 10000,
      };

      expect(config.apiKey).toBe('test-api-key');
      expect(config.email).toBe('test@example.com');
      expect(config.rateLimit).toBe(10);
      expect(config.maxResults).toBe(10000);
    });

    it('should allow optional fields', () => {
      const minimalConfig: PubMedConfig = {
        email: 'required@example.com',
      };

      expect(minimalConfig.email).toBe('required@example.com');
      expect(minimalConfig.apiKey).toBeUndefined();
      expect(minimalConfig.rateLimit).toBeUndefined();
    });
  });

  describe('PubMedProviderState', () => {
    it('should hold PubMed-specific state for session resume', () => {
      const state: PubMedProviderState = {
        webenv: 'MCID_abc123',
        querykey: '1',
        retstart: 200,
        useHistory: true,
      };

      expect(state.webenv).toBe('MCID_abc123');
      expect(state.querykey).toBe('1');
      expect(state.retstart).toBe(200);
      expect(state.useHistory).toBe(true);
    });

    it('should allow optional webenv/querykey when not using history', () => {
      const state: PubMedProviderState = {
        retstart: 0,
        useHistory: false,
      };

      expect(state.webenv).toBeUndefined();
      expect(state.querykey).toBeUndefined();
      expect(state.useHistory).toBe(false);
    });
  });

  describe('ELinkOptions', () => {
    it('should define options for ELink API call', () => {
      const options: ELinkOptions = {
        ids: ['12345678', '23456789'],
        term: 'review[filter]+AND+2024[pdat]',
        maxResults: 50,
      };

      expect(options.ids).toEqual(['12345678', '23456789']);
      expect(options.term).toBe('review[filter]+AND+2024[pdat]');
      expect(options.maxResults).toBe(50);
    });

    it('should allow optional fields', () => {
      const options: ELinkOptions = {
        ids: ['12345678'],
      };

      expect(options.ids).toEqual(['12345678']);
      expect(options.term).toBeUndefined();
      expect(options.maxResults).toBeUndefined();
    });
  });

  describe('RelatedArticle', () => {
    it('should represent a related article with score', () => {
      const related: RelatedArticle = {
        id: '98765432',
        score: 85432100,
      };

      expect(related.id).toBe('98765432');
      expect(related.score).toBe(85432100);
    });
  });

  describe('ELinkResponse', () => {
    it('should represent ELink response for a seed ID', () => {
      const response: ELinkResponse = {
        seedId: '12345678',
        relatedIds: [
          { id: '98765432', score: 85432100 },
          { id: '87654321', score: 72100000 },
        ],
      };

      expect(response.seedId).toBe('12345678');
      expect(response.relatedIds).toHaveLength(2);
      expect(response.relatedIds[0]!.score).toBeGreaterThan(response.relatedIds[1]!.score);
    });

    it('should allow empty related IDs', () => {
      const response: ELinkResponse = {
        seedId: '12345678',
        relatedIds: [],
      };

      expect(response.relatedIds).toHaveLength(0);
    });
  });
});
