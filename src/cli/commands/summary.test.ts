import { describe, it, expect } from 'vitest';
import { computeSummary } from './summary.js';
import type { Article } from '../../providers/base/types.js';

const makeArticle = (overrides: Partial<Article> & Pick<Article, 'title' | 'source'>): Article => ({
  authors: [{ family: 'Test', given: 'Author' }],
  retrievedAt: '2024-01-15T10:00:00Z',
  ...overrides,
});

const sampleArticles: Article[] = [
  makeArticle({
    doi: '10.1234/a1',
    pmid: '11111',
    title: 'AI in Medical Education',
    source: 'pubmed',
    publicationDate: '2024-03-15',
    journal: 'BMC medical education',
  }),
  makeArticle({
    doi: '10.1234/a2',
    pmid: '22222',
    title: 'Machine Learning Review',
    source: 'pubmed',
    publicationDate: '2024-06-01',
    journal: 'BMC medical education',
  }),
  makeArticle({
    doi: '10.1234/a3',
    title: 'ERIC Study on Teaching',
    source: 'eric',
    publicationDate: '2023-11-20',
    journal: 'Academic medicine',
    ericId: 'ED000001',
  }),
  makeArticle({
    arxivId: '2405.12345',
    title: 'Deep Learning Methods',
    source: 'arxiv',
    publicationDate: '2024-05-01',
    journal: 'arXiv preprint',
  }),
  makeArticle({
    doi: '10.1234/a5',
    pmid: '55555',
    title: 'Clinical AI Applications',
    source: 'pubmed',
    publicationDate: '2025-01-10',
    journal: 'JMIR medical education',
  }),
  makeArticle({
    title: 'No Date Article',
    source: 'pubmed',
    pmid: '66666',
  }),
  makeArticle({
    title: 'No IDs Article',
    source: 'pubmed',
  }),
];

describe('computeSummary', () => {
  it('should count year distribution from publicationDate', () => {
    const summary = computeSummary(sampleArticles, sampleArticles, {
      sessionId: 'test-session',
      sessionName: 'Test Session',
    });

    expect(summary.yearDistribution).toEqual({
      '2023': 1,
      '2024': 3,
      '2025': 1,
      unknown: 2,
    });
  });

  it('should group missing/invalid dates under "unknown"', () => {
    const articles = [
      makeArticle({ title: 'No date', source: 'pubmed' }),
      makeArticle({ title: 'Empty date', source: 'pubmed', publicationDate: '' }),
      makeArticle({ title: 'Invalid date', source: 'pubmed', publicationDate: 'not-a-date' }),
      makeArticle({ title: 'Valid date', source: 'pubmed', publicationDate: '2024-01-01' }),
    ];

    const summary = computeSummary(articles, articles, {
      sessionId: 'test',
      sessionName: 'Test',
    });

    expect(summary.yearDistribution['unknown']).toBe(3);
    expect(summary.yearDistribution['2024']).toBe(1);
  });

  it('should count database breakdown by source', () => {
    const summary = computeSummary(sampleArticles, sampleArticles, {
      sessionId: 'test-session',
      sessionName: 'Test Session',
    });

    expect(summary.databaseBreakdown).toEqual({
      pubmed: 5,
      eric: 1,
      arxiv: 1,
    });
  });

  it('should return top journals sorted by count descending', () => {
    const summary = computeSummary(sampleArticles, sampleArticles, {
      sessionId: 'test-session',
      sessionName: 'Test Session',
    });

    expect(summary.topJournals[0]).toEqual({
      name: 'BMC medical education',
      count: 2,
    });
    // Remaining journals have count 1, sorted alphabetically for same count
    const names = summary.topJournals.map((j) => j.name);
    expect(names).toContain('Academic medicine');
    expect(names).toContain('JMIR medical education');
    expect(names).toContain('arXiv preprint');
  });

  it('should limit top journals to topN parameter', () => {
    const summary = computeSummary(sampleArticles, sampleArticles, {
      sessionId: 'test-session',
      sessionName: 'Test Session',
      topN: 2,
    });

    expect(summary.topJournals).toHaveLength(2);
    expect(summary.topJournals[0]!.name).toBe('BMC medical education');
  });

  it('should count identifier coverage', () => {
    const summary = computeSummary(sampleArticles, sampleArticles, {
      sessionId: 'test-session',
      sessionName: 'Test Session',
    });

    // Articles with DOI: a1, a2, a3, a5 = 4
    expect(summary.identifierCoverage.withDoi).toBe(4);
    // Articles with PMID: a1, a2, a5, no-date = 4
    expect(summary.identifierCoverage.withPmid).toBe(4);
    // Articles with no DOI and no PMID: arxiv (only arxivId), no-ids = 2
    expect(summary.identifierCoverage.noDoiOrPmid).toBe(2);
  });

  it('should compute total vs unique article counts', () => {
    const allArticles = [...sampleArticles, sampleArticles[0]!]; // Add a duplicate
    const uniqueArticles = sampleArticles;

    const summary = computeSummary(allArticles, uniqueArticles, {
      sessionId: 'test-session',
      sessionName: 'Test Session',
    });

    expect(summary.totalArticles).toBe(8);
    expect(summary.uniqueArticles).toBe(7);
  });

  it('should set session metadata correctly', () => {
    const summary = computeSummary(sampleArticles, sampleArticles, {
      sessionId: '20260202_test_a1b2c3',
      sessionName: 'test',
    });

    expect(summary.sessionId).toBe('20260202_test_a1b2c3');
    expect(summary.sessionName).toBe('test');
  });

  it('should handle empty article arrays', () => {
    const summary = computeSummary([], [], {
      sessionId: 'empty-session',
      sessionName: 'Empty',
    });

    expect(summary.totalArticles).toBe(0);
    expect(summary.uniqueArticles).toBe(0);
    expect(summary.yearDistribution).toEqual({});
    expect(summary.databaseBreakdown).toEqual({});
    expect(summary.topJournals).toEqual([]);
    expect(summary.identifierCoverage.withDoi).toBe(0);
    expect(summary.identifierCoverage.withPmid).toBe(0);
    expect(summary.identifierCoverage.noDoiOrPmid).toBe(0);
  });

  it('should exclude articles without journal from topJournals', () => {
    const articles = [
      makeArticle({ title: 'No journal', source: 'pubmed', doi: '10.1/x' }),
      makeArticle({ title: 'Has journal', source: 'pubmed', doi: '10.1/y', journal: 'Nature' }),
    ];

    const summary = computeSummary(articles, articles, {
      sessionId: 'test',
      sessionName: 'Test',
    });

    expect(summary.topJournals).toEqual([{ name: 'Nature', count: 1 }]);
  });
});
