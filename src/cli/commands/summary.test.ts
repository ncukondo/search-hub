import { describe, it, expect } from 'vitest';
import { computeSummary, formatSummary, formatSummaryJson } from './summary.js';
import type { SessionSummary } from './summary.js';
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

const makeSummary = (overrides?: Partial<SessionSummary>): SessionSummary => ({
  sessionId: '20260202_test_a1b2c3',
  sessionName: 'test',
  totalArticles: 100,
  uniqueArticles: 90,
  yearDistribution: {
    '2023': 10,
    '2024': 50,
    '2025': 25,
    unknown: 5,
  },
  databaseBreakdown: {
    pubmed: 70,
    eric: 15,
    arxiv: 5,
  },
  topJournals: [
    { name: 'BMC medical education', count: 20 },
    { name: 'JMIR medical education', count: 15 },
    { name: 'Academic medicine', count: 10 },
  ],
  identifierCoverage: {
    withDoi: 80,
    withPmid: 70,
    noDoiOrPmid: 5,
  },
  ...overrides,
});

describe('formatSummary', () => {
  it('should include session header with id and article counts', () => {
    const output = formatSummary(makeSummary());

    expect(output).toContain('Session: test (20260202_test_a1b2c3)');
    expect(output).toContain('Total: 100 articles (90 unique after deduplication)');
  });

  it('should include year distribution with bar chart', () => {
    const output = formatSummary(makeSummary());

    expect(output).toContain('Year distribution:');
    // Should contain year entries
    expect(output).toContain('2023');
    expect(output).toContain('2024');
    expect(output).toContain('2025');
    // Bars should be present (unicode block chars)
    expect(output).toMatch(/█/);
  });

  it('should sort year distribution chronologically with unknown last', () => {
    const output = formatSummary(makeSummary());
    const lines = output.split('\n');

    const yearLines = lines.filter((l) => /^\s+(20\d{2}|unknown):/.test(l));
    const years = yearLines.map((l) => l.trim().split(':')[0]!.trim());

    expect(years).toEqual(['2023', '2024', '2025', 'unknown']);
  });

  it('should scale bar chart proportionally (longest bar = max width)', () => {
    const summary = makeSummary({
      yearDistribution: { '2024': 100, '2025': 50 },
    });
    const output = formatSummary(summary);
    const lines = output.split('\n');

    const barLines = lines.filter((l) => /^\s+20\d{2}:/.test(l));
    // Count bars for each year
    const barCounts = barLines.map((l) => (l.match(/█/g) ?? []).length);

    // 2024 should have more bars than 2025 and the ratio should be ~2:1
    expect(barCounts[0]).toBeGreaterThan(barCounts[1]!);
    // The larger bar should be at or near max width (32)
    expect(barCounts[0]).toBe(32);
    expect(barCounts[1]).toBe(16);
  });

  it('should right-align numbers for readability', () => {
    const summary = makeSummary({
      yearDistribution: { '2023': 5, '2024': 100 },
    });
    const output = formatSummary(summary);
    const lines = output.split('\n');

    const yearLines = lines.filter((l) => /^\s+20\d{2}:/.test(l));
    // Both lines should have same format width
    // "  5" and "100" should be right-aligned to same column
    // Find where the bar starts (█ or end of number+space)
    const barPositions = yearLines.map((l) => l.indexOf('█'));
    // The bar (or space before bar) should start at the same column
    expect(barPositions[0]).toBe(barPositions[1]);
  });

  it('should include database breakdown with percentages', () => {
    const output = formatSummary(makeSummary());

    expect(output).toContain('Database breakdown:');
    expect(output).toMatch(/pubmed\s*:\s+70\s+\(77\.8%\)/);
    expect(output).toMatch(/eric\s*:\s+15\s+\(16\.7%\)/);
    expect(output).toMatch(/arxiv\s*:\s+5\s+\(5\.6%\)/);
  });

  it('should include top journals section', () => {
    const output = formatSummary(makeSummary());

    expect(output).toContain('Top journals (by article count):');
    expect(output).toContain('BMC medical education');
    expect(output).toContain('JMIR medical education');
    expect(output).toContain('Academic medicine');
  });

  it('should include identifier coverage with percentages', () => {
    const output = formatSummary(makeSummary());

    expect(output).toContain('Identifier coverage:');
    expect(output).toMatch(/With DOI\s*:\s+80\s+\(88\.9%\)/);
    expect(output).toMatch(/With PMID\s*:\s+70\s+\(77\.8%\)/);
    expect(output).toMatch(/No DOI\/PMID\s*:\s+5\s+\(5\.6%\)/);
  });

  it('should handle zero unique articles gracefully', () => {
    const summary = makeSummary({
      totalArticles: 0,
      uniqueArticles: 0,
      yearDistribution: {},
      databaseBreakdown: {},
      topJournals: [],
      identifierCoverage: { withDoi: 0, withPmid: 0, noDoiOrPmid: 0 },
    });
    const output = formatSummary(summary);

    expect(output).toContain('Total: 0 articles (0 unique after deduplication)');
    // Should not crash
    expect(output).toContain('Year distribution:');
  });
});

describe('formatSummaryJson', () => {
  it('should produce valid JSON matching SessionSummary structure', () => {
    const summary = makeSummary();
    const output = formatSummaryJson(summary);

    const parsed = JSON.parse(output) as SessionSummary;
    expect(parsed.sessionId).toBe(summary.sessionId);
    expect(parsed.sessionName).toBe(summary.sessionName);
    expect(parsed.totalArticles).toBe(summary.totalArticles);
    expect(parsed.uniqueArticles).toBe(summary.uniqueArticles);
    expect(parsed.yearDistribution).toEqual(summary.yearDistribution);
    expect(parsed.databaseBreakdown).toEqual(summary.databaseBreakdown);
    expect(parsed.topJournals).toEqual(summary.topJournals);
    expect(parsed.identifierCoverage).toEqual(summary.identifierCoverage);
  });

  it('should produce pretty-printed JSON', () => {
    const summary = makeSummary();
    const output = formatSummaryJson(summary);

    // Pretty-printed JSON has newlines
    expect(output).toContain('\n');
    // Indented with 2 spaces
    expect(output).toContain('  "sessionId"');
  });
});
