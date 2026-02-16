/**
 * Tests for PubMed HTTP client.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PubMedClient } from './client';
import { RateLimiter } from '../base/rate-limiter.js';
import type { PubMedConfig } from './types';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('PubMedClient', () => {
  const baseConfig: PubMedConfig = {
    email: 'test@example.com',
  };

  let testRateLimiter: RateLimiter;

  beforeEach(() => {
    testRateLimiter = new RateLimiter({ tokensPerSecond: 10, burstSize: 10 });
    vi.useFakeTimers();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('creates client with required config', () => {
      const client = new PubMedClient(baseConfig, testRateLimiter);
      expect(client).toBeInstanceOf(PubMedClient);
    });

    it('creates client with API key', () => {
      const client = new PubMedClient({ ...baseConfig, apiKey: 'test-api-key' }, testRateLimiter);
      expect(client).toBeInstanceOf(PubMedClient);
    });
  });

  describe('esearch API call construction', () => {
    it('includes required parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () =>
          Promise.resolve(`<?xml version="1.0" ?>
<eSearchResult>
  <Count>0</Count>
  <RetMax>20</RetMax>
  <RetStart>0</RetStart>
  <IdList></IdList>
</eSearchResult>`),
      });

      const client = new PubMedClient(baseConfig, testRateLimiter);
      await client.search('diabetes');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url] = mockFetch.mock.calls[0] as [string];
      expect(url).toContain('esearch.fcgi');
      expect(url).toContain('db=pubmed');
      expect(url).toContain('term=diabetes');
      expect(url).toContain('email=test%40example.com');
    });

    it('includes API key when configured', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () =>
          Promise.resolve(`<?xml version="1.0" ?>
<eSearchResult>
  <Count>0</Count>
  <RetMax>20</RetMax>
  <RetStart>0</RetStart>
  <IdList></IdList>
</eSearchResult>`),
      });

      const client = new PubMedClient({ ...baseConfig, apiKey: 'my-api-key' }, testRateLimiter);
      await client.search('test');

      const [url] = mockFetch.mock.calls[0] as [string];
      expect(url).toContain('api_key=my-api-key');
    });

    it('includes pagination parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () =>
          Promise.resolve(`<?xml version="1.0" ?>
<eSearchResult>
  <Count>100</Count>
  <RetMax>50</RetMax>
  <RetStart>20</RetStart>
  <IdList></IdList>
</eSearchResult>`),
      });

      const client = new PubMedClient(baseConfig, testRateLimiter);
      await client.search('test', { retstart: 20, retmax: 50 });

      const [url] = mockFetch.mock.calls[0] as [string];
      expect(url).toContain('retstart=20');
      expect(url).toContain('retmax=50');
    });

    it('includes usehistory parameter when requested', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () =>
          Promise.resolve(`<?xml version="1.0" ?>
<eSearchResult>
  <Count>10000</Count>
  <RetMax>20</RetMax>
  <RetStart>0</RetStart>
  <IdList><Id>1</Id></IdList>
  <WebEnv>MCID_abc123</WebEnv>
  <QueryKey>1</QueryKey>
</eSearchResult>`),
      });

      const client = new PubMedClient(baseConfig, testRateLimiter);
      await client.search('large result', { useHistory: true });

      const [url] = mockFetch.mock.calls[0] as [string];
      expect(url).toContain('usehistory=y');
    });

    it('parses esearch response correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () =>
          Promise.resolve(`<?xml version="1.0" ?>
<eSearchResult>
  <Count>3</Count>
  <RetMax>20</RetMax>
  <RetStart>0</RetStart>
  <IdList>
    <Id>12345678</Id>
    <Id>23456789</Id>
    <Id>34567890</Id>
  </IdList>
</eSearchResult>`),
      });

      const client = new PubMedClient(baseConfig, testRateLimiter);
      const result = await client.search('diabetes');

      expect(result.count).toBe(3);
      expect(result.idlist).toEqual(['12345678', '23456789', '34567890']);
    });
  });

  describe('efetch API call construction', () => {
    it('includes required parameters for fetching PMIDs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () =>
          Promise.resolve(`<?xml version="1.0" ?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation>
      <PMID>12345678</PMID>
      <Article><ArticleTitle>Test</ArticleTitle><AuthorList><Author><LastName>Test</LastName></Author></AuthorList></Article>
    </MedlineCitation>
    <PubmedData><ArticleIdList><ArticleId IdType="pubmed">12345678</ArticleId></ArticleIdList></PubmedData>
  </PubmedArticle>
</PubmedArticleSet>`),
      });

      const client = new PubMedClient(baseConfig, testRateLimiter);
      await client.fetch(['12345678']);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url] = mockFetch.mock.calls[0] as [string];
      expect(url).toContain('efetch.fcgi');
      expect(url).toContain('db=pubmed');
      expect(url).toContain('id=12345678');
      expect(url).toContain('rettype=xml');
      expect(url).toContain('retmode=xml');
      expect(url).toContain('email=test%40example.com');
    });

    it('includes multiple PMIDs as comma-separated list', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () =>
          Promise.resolve(`<?xml version="1.0" ?>
<PubmedArticleSet></PubmedArticleSet>`),
      });

      const client = new PubMedClient(baseConfig, testRateLimiter);
      await client.fetch(['11111111', '22222222', '33333333']);

      const [url] = mockFetch.mock.calls[0] as [string];
      expect(url).toContain('id=11111111%2C22222222%2C33333333');
    });

    it('includes API key when configured', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () =>
          Promise.resolve(`<?xml version="1.0" ?>
<PubmedArticleSet></PubmedArticleSet>`),
      });

      const client = new PubMedClient({ ...baseConfig, apiKey: 'fetch-api-key' }, testRateLimiter);
      await client.fetch(['12345678']);

      const [url] = mockFetch.mock.calls[0] as [string];
      expect(url).toContain('api_key=fetch-api-key');
    });

    it('uses webenv and querykey for history-based fetch', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () =>
          Promise.resolve(`<?xml version="1.0" ?>
<PubmedArticleSet></PubmedArticleSet>`),
      });

      const client = new PubMedClient(baseConfig, testRateLimiter);
      await client.fetchFromHistory({
        webenv: 'MCID_abc123',
        querykey: '1',
        retstart: 0,
        retmax: 100,
      });

      const [url] = mockFetch.mock.calls[0] as [string];
      expect(url).toContain('WebEnv=MCID_abc123');
      expect(url).toContain('query_key=1');
      expect(url).toContain('retstart=0');
      expect(url).toContain('retmax=100');
    });

    it('parses efetch response correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () =>
          Promise.resolve(`<?xml version="1.0" ?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation>
      <PMID Version="1">12345678</PMID>
      <Article>
        <Journal><Title>Test Journal</Title></Journal>
        <ArticleTitle>Test Article Title</ArticleTitle>
        <AuthorList><Author><LastName>Smith</LastName><ForeName>John</ForeName></Author></AuthorList>
      </Article>
    </MedlineCitation>
    <PubmedData><ArticleIdList><ArticleId IdType="pubmed">12345678</ArticleId></ArticleIdList></PubmedData>
  </PubmedArticle>
</PubmedArticleSet>`),
      });

      const client = new PubMedClient(baseConfig, testRateLimiter);
      const articles = await client.fetch(['12345678']);

      expect(articles).toHaveLength(1);
      expect(articles[0]!.pmid).toBe('12345678');
      expect(articles[0]!.title).toBe('Test Article Title');
      expect(articles[0]!.authors[0]!.family).toBe('Smith');
    });
  });

  describe('error handling', () => {
    it('throws on HTTP 400 Bad Request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve('Invalid query'),
      });

      const client = new PubMedClient(baseConfig, testRateLimiter);
      await expect(client.search('invalid[[')).rejects.toMatchObject({
        code: 'PARSE_ERROR',
        provider: 'pubmed',
      });
    });

    it('throws rate limit error on HTTP 429', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: {
          get: (name: string) => (name === 'Retry-After' ? '5' : null),
        },
        text: () => Promise.resolve('Rate limited'),
      });

      const client = new PubMedClient(baseConfig, testRateLimiter);
      await expect(client.search('test')).rejects.toMatchObject({
        code: 'RATE_LIMIT_EXCEEDED',
        provider: 'pubmed',
        retryable: true,
      });
    });
    it('includes retryAfter on 429 with Retry-After header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: {
          get: (name: string) => (name === 'Retry-After' ? '5' : null),
        },
        text: () => Promise.resolve('Rate limited'),
      });

      const client = new PubMedClient(baseConfig, testRateLimiter);
      await expect(client.search('test')).rejects.toMatchObject({
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: 5000,
      });
    });


    it('throws server error on HTTP 5xx with retry', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: () => Promise.resolve('Server error'),
      });

      const client = new PubMedClient(baseConfig, testRateLimiter);
      await expect(client.search('test')).rejects.toMatchObject({
        code: 'SERVER_ERROR',
        provider: 'pubmed',
        retryable: true,
      });
    });

    it('throws network error on fetch failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      const client = new PubMedClient(baseConfig, testRateLimiter);
      await expect(client.search('test')).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
        provider: 'pubmed',
        retryable: true,
      });
    });
  });

  describe('findRelated (elink API)', () => {
    it('constructs correct ELink URL with required parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () =>
          Promise.resolve(`<?xml version="1.0" ?>
<eLinkResult>
  <LinkSet>
    <DbFrom>pubmed</DbFrom>
    <IdList><Id>12345678</Id></IdList>
    <LinkSetDb>
      <DbTo>pubmed</DbTo>
      <LinkName>pubmed_pubmed</LinkName>
      <Link><Id>99999999</Id><Score>90000000</Score></Link>
    </LinkSetDb>
  </LinkSet>
</eLinkResult>`),
      });

      const client = new PubMedClient(baseConfig, testRateLimiter);
      await client.findRelated({ ids: ['12345678'] });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url] = mockFetch.mock.calls[0] as [string];
      expect(url).toContain('elink.fcgi');
      expect(url).toContain('dbfrom=pubmed');
      expect(url).toContain('db=pubmed');
      expect(url).toContain('id=12345678');
      expect(url).toContain('cmd=neighbor_score');
      expect(url).toContain('retmode=xml');
      expect(url).toContain('email=test%40example.com');
    });

    it('includes API key when configured', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () =>
          Promise.resolve(`<?xml version="1.0" ?>
<eLinkResult>
  <LinkSet>
    <DbFrom>pubmed</DbFrom>
    <IdList><Id>12345678</Id></IdList>
  </LinkSet>
</eLinkResult>`),
      });

      const client = new PubMedClient({ ...baseConfig, apiKey: 'elink-key' }, testRateLimiter);
      await client.findRelated({ ids: ['12345678'] });

      const [url] = mockFetch.mock.calls[0] as [string];
      expect(url).toContain('api_key=elink-key');
    });

    it('includes multiple IDs as separate id params', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () =>
          Promise.resolve(`<?xml version="1.0" ?>
<eLinkResult>
  <LinkSet>
    <DbFrom>pubmed</DbFrom>
    <IdList><Id>11111111</Id></IdList>
  </LinkSet>
  <LinkSet>
    <DbFrom>pubmed</DbFrom>
    <IdList><Id>22222222</Id></IdList>
  </LinkSet>
</eLinkResult>`),
      });

      const client = new PubMedClient(baseConfig, testRateLimiter);
      await client.findRelated({ ids: ['11111111', '22222222'] });

      const [url] = mockFetch.mock.calls[0] as [string];
      // ELink uses separate id params for each PMID
      expect(url).toContain('id=11111111');
      expect(url).toContain('id=22222222');
    });

    it('includes term filter when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () =>
          Promise.resolve(`<?xml version="1.0" ?>
<eLinkResult>
  <LinkSet>
    <DbFrom>pubmed</DbFrom>
    <IdList><Id>12345678</Id></IdList>
  </LinkSet>
</eLinkResult>`),
      });

      const client = new PubMedClient(baseConfig, testRateLimiter);
      await client.findRelated({ ids: ['12345678'], term: 'review[filter]' });

      const [url] = mockFetch.mock.calls[0] as [string];
      expect(url).toContain('term=review');
    });

    it('truncates results to maxResults by score', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () =>
          Promise.resolve(`<?xml version="1.0" ?>
<eLinkResult>
  <LinkSet>
    <DbFrom>pubmed</DbFrom>
    <IdList><Id>12345678</Id></IdList>
    <LinkSetDb>
      <DbTo>pubmed</DbTo>
      <LinkName>pubmed_pubmed</LinkName>
      <Link><Id>11111111</Id><Score>90000000</Score></Link>
      <Link><Id>22222222</Id><Score>80000000</Score></Link>
      <Link><Id>33333333</Id><Score>70000000</Score></Link>
      <Link><Id>44444444</Id><Score>60000000</Score></Link>
      <Link><Id>55555555</Id><Score>50000000</Score></Link>
    </LinkSetDb>
  </LinkSet>
</eLinkResult>`),
      });

      const client = new PubMedClient(baseConfig, testRateLimiter);
      const result = await client.findRelated({ ids: ['12345678'], maxResults: 3 });

      expect(result).toHaveLength(1);
      expect(result[0]!.relatedIds).toHaveLength(3);
      expect(result[0]!.relatedIds[0]!.id).toBe('11111111');
      expect(result[0]!.relatedIds[2]!.id).toBe('33333333');
    });

    it('parses response correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () =>
          Promise.resolve(`<?xml version="1.0" ?>
<eLinkResult>
  <LinkSet>
    <DbFrom>pubmed</DbFrom>
    <IdList><Id>12345678</Id></IdList>
    <LinkSetDb>
      <DbTo>pubmed</DbTo>
      <LinkName>pubmed_pubmed</LinkName>
      <Link><Id>99999999</Id><Score>85432100</Score></Link>
      <Link><Id>88888888</Id><Score>72100000</Score></Link>
    </LinkSetDb>
  </LinkSet>
</eLinkResult>`),
      });

      const client = new PubMedClient(baseConfig, testRateLimiter);
      const result = await client.findRelated({ ids: ['12345678'] });

      expect(result).toHaveLength(1);
      expect(result[0]!.seedId).toBe('12345678');
      expect(result[0]!.relatedIds).toHaveLength(2);
      expect(result[0]!.relatedIds[0]).toEqual({ id: '99999999', score: 85432100 });
    });

    it('uses error handling for HTTP errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: {
          get: (name: string) => (name === 'Retry-After' ? '5' : null),
        },
        text: () => Promise.resolve('Rate limited'),
      });

      const client = new PubMedClient(baseConfig, testRateLimiter);
      await expect(client.findRelated({ ids: ['12345678'] })).rejects.toMatchObject({
        code: 'RATE_LIMIT_EXCEEDED',
        provider: 'pubmed',
      });
    });
  });

  describe('rate limiting integration', () => {
    it('respects rate limiter for sequential requests', async () => {
      // Mock successful responses
      mockFetch.mockResolvedValue({
        ok: true,
        text: () =>
          Promise.resolve(`<?xml version="1.0" ?>
<eSearchResult>
  <Count>0</Count>
  <RetMax>20</RetMax>
  <RetStart>0</RetStart>
  <IdList></IdList>
</eSearchResult>`),
      });

      const client = new PubMedClient(baseConfig, testRateLimiter);

      // Make first request
      await client.search('query1');

      // Make second request immediately - should be rate limited
      const secondPromise = client.search('query2');

      // Advance timer to allow rate limiter
      await vi.advanceTimersByTimeAsync(400);

      await secondPromise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
