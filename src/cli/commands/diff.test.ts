import { describe, it, expect } from 'vitest';
import { computeDiff } from './diff.js';
import type { Article } from '../../providers/base/types.js';

const makeArticle = (overrides: Partial<Article> & Pick<Article, 'title' | 'source'>): Article => ({
  authors: [{ family: 'Test', given: 'Author' }],
  retrievedAt: '2024-01-15T10:00:00Z',
  ...overrides,
});

describe('computeDiff', () => {
  it('should identify added articles (in session2 but not session1)', () => {
    const session1: Article[] = [
      makeArticle({ doi: '10.1234/a1', title: 'Article A', source: 'pubmed' }),
    ];
    const session2: Article[] = [
      makeArticle({ doi: '10.1234/a1', title: 'Article A', source: 'pubmed' }),
      makeArticle({ doi: '10.1234/a2', title: 'Article B', source: 'pubmed' }),
    ];

    const result = computeDiff(session1, session2);

    expect(result.added).toHaveLength(1);
    expect(result.added[0]!.doi).toBe('10.1234/a2');
    expect(result.removed).toHaveLength(0);
    expect(result.common).toHaveLength(1);
  });

  it('should identify removed articles (in session1 but not session2)', () => {
    const session1: Article[] = [
      makeArticle({ doi: '10.1234/a1', title: 'Article A', source: 'pubmed' }),
      makeArticle({ doi: '10.1234/a2', title: 'Article B', source: 'pubmed' }),
    ];
    const session2: Article[] = [
      makeArticle({ doi: '10.1234/a1', title: 'Article A', source: 'pubmed' }),
    ];

    const result = computeDiff(session1, session2);

    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(1);
    expect(result.removed[0]!.doi).toBe('10.1234/a2');
    expect(result.common).toHaveLength(1);
  });

  it('should identify common articles', () => {
    const session1: Article[] = [
      makeArticle({ doi: '10.1234/a1', title: 'Article A', source: 'pubmed' }),
      makeArticle({ doi: '10.1234/a2', title: 'Article B', source: 'eric' }),
    ];
    const session2: Article[] = [
      makeArticle({ doi: '10.1234/a1', title: 'Article A', source: 'pubmed' }),
      makeArticle({ doi: '10.1234/a2', title: 'Article B', source: 'eric' }),
    ];

    const result = computeDiff(session1, session2);

    expect(result.common).toHaveLength(2);
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
  });

  it('should match by DOI (case-insensitive)', () => {
    const session1: Article[] = [
      makeArticle({ doi: '10.1234/ABC', title: 'Article A', source: 'pubmed' }),
    ];
    const session2: Article[] = [
      makeArticle({ doi: '10.1234/abc', title: 'Article A', source: 'scopus' }),
    ];

    const result = computeDiff(session1, session2);

    expect(result.common).toHaveLength(1);
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
  });

  it('should match by PMID', () => {
    const session1: Article[] = [
      makeArticle({ pmid: '12345678', title: 'Article A', source: 'pubmed' }),
    ];
    const session2: Article[] = [
      makeArticle({ pmid: '12345678', title: 'Article A v2', source: 'pubmed' }),
    ];

    const result = computeDiff(session1, session2);

    expect(result.common).toHaveLength(1);
  });

  it('should match by arXiv ID', () => {
    const session1: Article[] = [
      makeArticle({ arxivId: '2401.12345', title: 'Article A', source: 'arxiv' }),
    ];
    const session2: Article[] = [
      makeArticle({ arxivId: '2401.12345', title: 'Article A', source: 'arxiv' }),
    ];

    const result = computeDiff(session1, session2);

    expect(result.common).toHaveLength(1);
  });

  it('should match by Scopus ID', () => {
    const session1: Article[] = [
      makeArticle({ scopusId: 'SCOPUS-001', title: 'Article A', source: 'scopus' }),
    ];
    const session2: Article[] = [
      makeArticle({ scopusId: 'SCOPUS-001', title: 'Article A', source: 'scopus' }),
    ];

    const result = computeDiff(session1, session2);

    expect(result.common).toHaveLength(1);
  });

  it('should match by ERIC ID', () => {
    const session1: Article[] = [
      makeArticle({ ericId: 'ED123456', title: 'Article A', source: 'eric' }),
    ];
    const session2: Article[] = [
      makeArticle({ ericId: 'ED123456', title: 'Article A', source: 'eric' }),
    ];

    const result = computeDiff(session1, session2);

    expect(result.common).toHaveLength(1);
  });

  it('should match if articles share any identifier', () => {
    const session1: Article[] = [
      makeArticle({ doi: '10.1234/a1', pmid: '11111', title: 'Article A', source: 'pubmed' }),
    ];
    const session2: Article[] = [
      makeArticle({ pmid: '11111', title: 'Article A', source: 'scopus' }),
    ];

    const result = computeDiff(session1, session2);

    expect(result.common).toHaveLength(1);
  });

  it('should handle empty session1', () => {
    const session1: Article[] = [];
    const session2: Article[] = [
      makeArticle({ doi: '10.1234/a1', title: 'Article A', source: 'pubmed' }),
    ];

    const result = computeDiff(session1, session2);

    expect(result.added).toHaveLength(1);
    expect(result.removed).toHaveLength(0);
    expect(result.common).toHaveLength(0);
  });

  it('should handle empty session2', () => {
    const session1: Article[] = [
      makeArticle({ doi: '10.1234/a1', title: 'Article A', source: 'pubmed' }),
    ];
    const session2: Article[] = [];

    const result = computeDiff(session1, session2);

    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(1);
    expect(result.common).toHaveLength(0);
  });

  it('should handle both sessions empty', () => {
    const result = computeDiff([], []);

    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
    expect(result.common).toHaveLength(0);
  });

  it('should handle full overlap', () => {
    const articles: Article[] = [
      makeArticle({ doi: '10.1234/a1', title: 'Article A', source: 'pubmed' }),
      makeArticle({ doi: '10.1234/a2', title: 'Article B', source: 'pubmed' }),
    ];

    const result = computeDiff(articles, articles);

    expect(result.common).toHaveLength(2);
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
  });

  it('should handle no overlap', () => {
    const session1: Article[] = [
      makeArticle({ doi: '10.1234/a1', title: 'Article A', source: 'pubmed' }),
    ];
    const session2: Article[] = [
      makeArticle({ doi: '10.1234/a2', title: 'Article B', source: 'pubmed' }),
    ];

    const result = computeDiff(session1, session2);

    expect(result.common).toHaveLength(0);
    expect(result.added).toHaveLength(1);
    expect(result.removed).toHaveLength(1);
  });

  it('should handle articles without identifiers', () => {
    const session1: Article[] = [
      makeArticle({ title: 'No ID Article', source: 'pubmed' }),
    ];
    const session2: Article[] = [
      makeArticle({ title: 'No ID Article', source: 'pubmed' }),
    ];

    const result = computeDiff(session1, session2);

    // Articles without IDs cannot be matched, so they appear as removed + added
    expect(result.removed).toHaveLength(1);
    expect(result.added).toHaveLength(1);
    expect(result.common).toHaveLength(0);
  });

  it('should return correct session1Count and session2Count', () => {
    const session1: Article[] = [
      makeArticle({ doi: '10.1234/a1', title: 'Article A', source: 'pubmed' }),
      makeArticle({ doi: '10.1234/a2', title: 'Article B', source: 'pubmed' }),
      makeArticle({ doi: '10.1234/a3', title: 'Article C', source: 'pubmed' }),
    ];
    const session2: Article[] = [
      makeArticle({ doi: '10.1234/a2', title: 'Article B', source: 'pubmed' }),
      makeArticle({ doi: '10.1234/a4', title: 'Article D', source: 'pubmed' }),
    ];

    const result = computeDiff(session1, session2);

    expect(result.session1Count).toBe(3);
    expect(result.session2Count).toBe(2);
    expect(result.common).toHaveLength(1);
    expect(result.added).toHaveLength(1);
    expect(result.removed).toHaveLength(2);
  });
});
