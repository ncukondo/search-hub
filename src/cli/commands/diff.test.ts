import { describe, it, expect } from 'vitest';
import { computeDiff, formatDiff, formatDiffJson, type DiffResult } from './diff.js';
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

// Sample diff result for formatting tests
const sampleDiff: DiffResult = {
  session1Count: 5,
  session2Count: 4,
  added: [
    makeArticle({ doi: '10.1234/new1', title: 'Newly Added Article', source: 'pubmed', publicationDate: '2026-01-15' }),
    makeArticle({ doi: '10.1234/new2', title: 'Another New Article', source: 'eric', publicationDate: '2025-06-01' }),
  ],
  removed: [
    makeArticle({ doi: '10.1234/old1', title: 'Removed Article One', source: 'pubmed', publicationDate: '2024-03-20' }),
    makeArticle({ doi: '10.1234/old2', title: 'Removed Article Two', source: 'arxiv', publicationDate: '2023-11-05' }),
    makeArticle({ doi: '10.1234/old3', title: 'Removed Article Three', source: 'scopus' }),
  ],
  common: [
    makeArticle({ doi: '10.1234/c1', title: 'Common Article One', source: 'pubmed', publicationDate: '2024-06-01' }),
    makeArticle({ doi: '10.1234/c2', title: 'Common Article Two', source: 'eric', publicationDate: '2025-01-10' }),
  ],
};

describe('formatDiff', () => {
  it('should include header with session IDs', () => {
    const output = formatDiff(sampleDiff, 'session-v1', 'session-v2');

    expect(output).toContain('session-v1');
    expect(output).toContain('session-v2');
  });

  it('should show article counts in summary', () => {
    const output = formatDiff(sampleDiff, 'v1', 'v2');

    expect(output).toContain('5 articles');
    expect(output).toContain('4 articles');
    expect(output).toContain('Common:');
    expect(output).toContain('Added:');
    expect(output).toContain('Removed:');
  });

  it('should list added articles with + prefix', () => {
    const output = formatDiff(sampleDiff, 'v1', 'v2');

    expect(output).toContain('+ ');
    expect(output).toContain('Newly Added Article');
    expect(output).toContain('Another New Article');
  });

  it('should list removed articles with - prefix', () => {
    const output = formatDiff(sampleDiff, 'v1', 'v2');

    expect(output).toContain('- ');
    expect(output).toContain('Removed Article One');
  });

  it('should include year when available', () => {
    const output = formatDiff(sampleDiff, 'v1', 'v2');

    expect(output).toContain('[2026]');
    expect(output).toContain('[2025]');
  });

  it('should handle empty diff', () => {
    const emptyDiff: DiffResult = {
      session1Count: 0,
      session2Count: 0,
      added: [],
      removed: [],
      common: [],
    };

    const output = formatDiff(emptyDiff, 'v1', 'v2');

    expect(output).toContain('0 articles');
  });

  it('should handle no added articles', () => {
    const diff: DiffResult = {
      ...sampleDiff,
      added: [],
      session2Count: 2,
    };

    const output = formatDiff(diff, 'v1', 'v2');

    expect(output).not.toMatch(/Added \(\+\d+\):/);
  });

  it('should handle no removed articles', () => {
    const diff: DiffResult = {
      ...sampleDiff,
      removed: [],
      session1Count: 2,
    };

    const output = formatDiff(diff, 'v1', 'v2');

    expect(output).not.toMatch(/Removed \(-\d+\):/);
  });
});

describe('formatDiff with --show filter', () => {
  it('should show only added articles when show=added', () => {
    const output = formatDiff(sampleDiff, 'v1', 'v2', 'added');

    expect(output).toContain('Newly Added Article');
    expect(output).not.toContain('Removed Article One');
    expect(output).not.toContain('Common Article One');
  });

  it('should show only removed articles when show=removed', () => {
    const output = formatDiff(sampleDiff, 'v1', 'v2', 'removed');

    expect(output).toContain('Removed Article One');
    expect(output).not.toContain('Newly Added Article');
    expect(output).not.toContain('Common Article One');
  });

  it('should show only common articles when show=common', () => {
    const output = formatDiff(sampleDiff, 'v1', 'v2', 'common');

    expect(output).toContain('Common Article One');
    expect(output).not.toContain('Newly Added Article');
    expect(output).not.toContain('Removed Article One');
  });

  it('should show all sections when no filter', () => {
    const output = formatDiff(sampleDiff, 'v1', 'v2');

    expect(output).toContain('Newly Added Article');
    expect(output).toContain('Removed Article One');
    // Common articles appear in the summary count
    expect(output).toContain('2 articles');
  });
});

describe('formatDiffJson', () => {
  it('should return valid JSON', () => {
    const output = formatDiffJson(sampleDiff, 'v1', 'v2');
    const parsed = JSON.parse(output);

    expect(parsed).toBeDefined();
  });

  it('should include session IDs', () => {
    const output = formatDiffJson(sampleDiff, 'v1', 'v2');
    const parsed = JSON.parse(output);

    expect(parsed.session1).toBe('v1');
    expect(parsed.session2).toBe('v2');
  });

  it('should include summary counts', () => {
    const output = formatDiffJson(sampleDiff, 'v1', 'v2');
    const parsed = JSON.parse(output);

    expect(parsed.summary.session1Count).toBe(5);
    expect(parsed.summary.session2Count).toBe(4);
    expect(parsed.summary.commonCount).toBe(2);
    expect(parsed.summary.addedCount).toBe(2);
    expect(parsed.summary.removedCount).toBe(3);
  });

  it('should include article arrays', () => {
    const output = formatDiffJson(sampleDiff, 'v1', 'v2');
    const parsed = JSON.parse(output);

    expect(parsed.added).toHaveLength(2);
    expect(parsed.removed).toHaveLength(3);
    expect(parsed.common).toHaveLength(2);
  });

  it('should respect show filter', () => {
    const output = formatDiffJson(sampleDiff, 'v1', 'v2', 'added');
    const parsed = JSON.parse(output);

    expect(parsed.added).toHaveLength(2);
    expect(parsed.removed).toBeUndefined();
    expect(parsed.common).toBeUndefined();
  });
});
