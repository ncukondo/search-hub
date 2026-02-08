import { describe, it, expect } from 'vitest';
import type { Article } from '../../providers/base/types.js';
import { mergeArticles, type MergeResult } from './merge.js';

const makeArticle = (overrides: Partial<Article> & Pick<Article, 'title' | 'source'>): Article => ({
  authors: [{ family: 'Test', given: 'Author' }],
  retrievedAt: '2024-01-15T10:00:00Z',
  ...overrides,
});

describe('mergeArticles', () => {
  it('should merge articles from multiple sessions', () => {
    const sessionArticles: Map<string, Article[]> = new Map([
      ['session-a', [
        makeArticle({ doi: '10.1234/a1', title: 'Article A1', source: 'pubmed' }),
      ]],
      ['session-b', [
        makeArticle({ doi: '10.1234/b1', title: 'Article B1', source: 'pubmed' }),
      ]],
    ]);

    const result = mergeArticles(sessionArticles);

    expect(result.articles).toHaveLength(2);
    expect(result.totalBefore).toBe(2);
    expect(result.totalAfter).toBe(2);
    expect(result.duplicatesRemoved).toBe(0);
  });

  it('should deduplicate articles by DOI (case-insensitive)', () => {
    const sessionArticles: Map<string, Article[]> = new Map([
      ['session-a', [
        makeArticle({ doi: '10.1234/SAME', title: 'Article Same', source: 'pubmed' }),
      ]],
      ['session-b', [
        makeArticle({ doi: '10.1234/same', title: 'Article Same (copy)', source: 'scopus' }),
      ]],
    ]);

    const result = mergeArticles(sessionArticles);

    expect(result.articles).toHaveLength(1);
    expect(result.totalBefore).toBe(2);
    expect(result.totalAfter).toBe(1);
    expect(result.duplicatesRemoved).toBe(1);
  });

  it('should deduplicate articles by PMID', () => {
    const sessionArticles: Map<string, Article[]> = new Map([
      ['session-a', [
        makeArticle({ pmid: '12345678', title: 'Article A', source: 'pubmed' }),
      ]],
      ['session-b', [
        makeArticle({ pmid: '12345678', title: 'Article A (other)', source: 'pubmed' }),
      ]],
    ]);

    const result = mergeArticles(sessionArticles);

    expect(result.articles).toHaveLength(1);
    expect(result.duplicatesRemoved).toBe(1);
  });

  it('should keep richer metadata when deduplicating', () => {
    const sessionArticles: Map<string, Article[]> = new Map([
      ['session-a', [
        makeArticle({
          doi: '10.1234/a1',
          title: 'Sparse Article',
          source: 'pubmed',
        }),
      ]],
      ['session-b', [
        makeArticle({
          doi: '10.1234/a1',
          title: 'Rich Article',
          source: 'scopus',
          abstract: 'This article has an abstract',
          journal: 'Test Journal',
          volume: '1',
        }),
      ]],
    ]);

    const result = mergeArticles(sessionArticles);

    expect(result.articles).toHaveLength(1);
    expect(result.articles[0]!.abstract).toBe('This article has an abstract');
    expect(result.articles[0]!.journal).toBe('Test Journal');
  });

  it('should keep articles without identifiers', () => {
    const sessionArticles: Map<string, Article[]> = new Map([
      ['session-a', [
        makeArticle({ title: 'No ID Article A', source: 'pubmed' }),
      ]],
      ['session-b', [
        makeArticle({ title: 'No ID Article B', source: 'scopus' }),
      ]],
    ]);

    const result = mergeArticles(sessionArticles);

    expect(result.articles).toHaveLength(2);
    expect(result.duplicatesRemoved).toBe(0);
  });

  it('should group merged articles by provider', () => {
    const sessionArticles: Map<string, Article[]> = new Map([
      ['session-a', [
        makeArticle({ doi: '10.1234/a1', title: 'PubMed Article', source: 'pubmed' }),
        makeArticle({ doi: '10.1234/a2', title: 'Scopus Article', source: 'scopus' }),
      ]],
      ['session-b', [
        makeArticle({ doi: '10.1234/b1', title: 'Another PubMed', source: 'pubmed' }),
      ]],
    ]);

    const result = mergeArticles(sessionArticles);

    expect(result.byProvider.get('pubmed')).toHaveLength(2);
    expect(result.byProvider.get('scopus')).toHaveLength(1);
  });

  it('should handle three or more sessions', () => {
    const sessionArticles: Map<string, Article[]> = new Map([
      ['session-a', [
        makeArticle({ doi: '10.1234/a1', title: 'Article A', source: 'pubmed' }),
      ]],
      ['session-b', [
        makeArticle({ doi: '10.1234/b1', title: 'Article B', source: 'pubmed' }),
        makeArticle({ doi: '10.1234/a1', title: 'Article A dup', source: 'pubmed' }),
      ]],
      ['session-c', [
        makeArticle({ doi: '10.1234/c1', title: 'Article C', source: 'pubmed' }),
        makeArticle({ doi: '10.1234/b1', title: 'Article B dup', source: 'pubmed' }),
      ]],
    ]);

    const result = mergeArticles(sessionArticles);

    expect(result.articles).toHaveLength(3);
    expect(result.totalBefore).toBe(5);
    expect(result.duplicatesRemoved).toBe(2);
  });

  it('should track per-session stats', () => {
    const sessionArticles: Map<string, Article[]> = new Map([
      ['session-a', [
        makeArticle({ doi: '10.1234/a1', title: 'Article A', source: 'pubmed' }),
        makeArticle({ doi: '10.1234/a2', title: 'Article A2', source: 'pubmed' }),
      ]],
      ['session-b', [
        makeArticle({ doi: '10.1234/a1', title: 'Article A dup', source: 'pubmed' }),
        makeArticle({ doi: '10.1234/b1', title: 'Article B', source: 'pubmed' }),
      ]],
    ]);

    const result = mergeArticles(sessionArticles);

    expect(result.perSession.get('session-a')).toBe(2);
    expect(result.perSession.get('session-b')).toBe(2);
  });
});
