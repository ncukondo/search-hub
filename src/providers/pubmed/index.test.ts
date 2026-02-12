/**
 * Tests for PubMed provider module exports.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  // Provider class
  PubMedProvider,
  // Types
  type PubMedArticle,
  type PubMedConfig,
  type ESearchResponse,
  type PubMedProviderState,
  // Functions
  translateQuery,
  parseESearchResponse,
  parseEFetchResponse,
  // Re-exports from base
  createProviderRegistry,
} from './index';
import type { QueryAST } from '../base/types';

/**
 * Helper to create a minimal QueryAST for testing.
 */
function createMockQueryAST(name = 'test-query'): QueryAST {
  return {
    name,
    blocks: [
      {
        id: 'block-1',
        field: 'title_abstract',
        operator: 'OR',
        terms: {
          keywords: ['test'],
        },
      },
    ],
    filters: {},
    providers: {},
  };
}

describe('PubMed Module Exports', () => {
  describe('PubMedProvider', () => {
    it('is exported and can be instantiated', () => {
      const config: PubMedConfig = { email: 'test@example.com' };
      const provider = new PubMedProvider(config);
      expect(provider).toBeInstanceOf(PubMedProvider);
      expect(provider.name).toBe('pubmed');
    });
  });

  describe('types', () => {
    it('PubMedArticle type is usable', () => {
      const article: PubMedArticle = {
        pmid: '12345678',
        source: 'pubmed',
        title: 'Test Article',
        authors: [{ family: 'Test' }],
        retrievedAt: new Date().toISOString(),
      };
      expect(article.pmid).toBe('12345678');
    });

    it('PubMedConfig type is usable', () => {
      const config: PubMedConfig = {
        email: 'test@example.com',
        apiKey: 'optional-key',
      };
      expect(config.email).toBe('test@example.com');
    });

    it('ESearchResponse type is usable', () => {
      const response: ESearchResponse = {
        count: 100,
        retmax: 20,
        retstart: 0,
        idlist: ['1', '2', '3'],
      };
      expect(response.count).toBe(100);
    });

    it('PubMedProviderState type is usable', () => {
      const state: PubMedProviderState = {
        retstart: 0,
        useHistory: true,
        webenv: 'MCID_123',
        querykey: '1',
      };
      expect(state.useHistory).toBe(true);
    });
  });

  describe('functions', () => {
    it('translateQuery is exported and works', () => {
      const ast = createMockQueryAST();
      const result = translateQuery(ast);
      expect(result.provider).toBe('pubmed');
      expect(result.native).toContain('test');
    });

    it('parseESearchResponse is exported and works', () => {
      const xml = `<?xml version="1.0" ?>
<eSearchResult>
  <Count>5</Count>
  <RetMax>20</RetMax>
  <RetStart>0</RetStart>
  <IdList>
    <Id>12345</Id>
  </IdList>
</eSearchResult>`;
      const result = parseESearchResponse(xml);
      expect(result.count).toBe(5);
    });

    it('parseEFetchResponse is exported and works', () => {
      const xml = `<?xml version="1.0" ?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation>
      <PMID>99999999</PMID>
      <Article>
        <Journal><Title>Test</Title></Journal>
        <ArticleTitle>Test Article</ArticleTitle>
        <AuthorList><Author><LastName>Test</LastName></Author></AuthorList>
      </Article>
    </MedlineCitation>
    <PubmedData>
      <ArticleIdList><ArticleId IdType="pubmed">99999999</ArticleId></ArticleIdList>
    </PubmedData>
  </PubmedArticle>
</PubmedArticleSet>`;
      const result = parseEFetchResponse(xml);
      expect(result.articles).toHaveLength(1);
    });
  });

  describe('registry integration', () => {
    let registry: ReturnType<typeof createProviderRegistry>;

    beforeEach(() => {
      registry = createProviderRegistry();
    });

    it('can register PubMedProvider in a registry', () => {
      registry.register('pubmed', (config) =>
        new PubMedProvider({ email: 'test@example.com', ...config })
      );

      expect(registry.has('pubmed')).toBe(true);
      expect(registry.list()).toContain('pubmed');
    });

    it('can get PubMedProvider instance from registry', () => {
      registry.register('pubmed', (config) =>
        new PubMedProvider({
          email: 'test@example.com',
          ...config,
        })
      );

      const provider = registry.get('pubmed');
      expect(provider.name).toBe('pubmed');
    });
  });
});
