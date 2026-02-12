import { describe, it, expect } from 'vitest';
import {
  parseIdentifierFile,
  checkCoverage,
  formatCheckResult,
  formatCheckResultJson,
  type ParsedIdentifier,
  type CheckResult,
} from './check.js';
import type { Article } from '../../providers/base/types.js';

describe('parseIdentifierFile', () => {
  it('parses DOIs starting with 10.', () => {
    const result = parseIdentifierFile('10.1001/jama.2023.12345\n10.1016/j.lancet.2022.01234');
    expect(result).toEqual([
      { type: 'doi', value: '10.1001/jama.2023.12345', raw: '10.1001/jama.2023.12345' },
      { type: 'doi', value: '10.1016/j.lancet.2022.01234', raw: '10.1016/j.lancet.2022.01234' },
    ]);
  });

  it('parses PMIDs (numeric only)', () => {
    const result = parseIdentifierFile('37654321\n36543210');
    expect(result).toEqual([
      { type: 'pmid', value: '37654321', raw: '37654321' },
      { type: 'pmid', value: '36543210', raw: '36543210' },
    ]);
  });

  it('parses prefixed DOIs (case-insensitive prefix)', () => {
    const result = parseIdentifierFile('DOI:10.1038/s41586-023-xxxxx\ndoi:10.1002/abc');
    expect(result).toEqual([
      { type: 'doi', value: '10.1038/s41586-023-xxxxx', raw: 'DOI:10.1038/s41586-023-xxxxx' },
      { type: 'doi', value: '10.1002/abc', raw: 'doi:10.1002/abc' },
    ]);
  });

  it('trims whitespace after prefix colon', () => {
    const result = parseIdentifierFile('DOI: 10.1038/abc\nPMID: 12345\narxiv: 2301.12345');
    expect(result).toEqual([
      { type: 'doi', value: '10.1038/abc', raw: 'DOI: 10.1038/abc' },
      { type: 'pmid', value: '12345', raw: 'PMID: 12345' },
      { type: 'arxiv', value: '2301.12345', raw: 'arxiv: 2301.12345' },
    ]);
  });

  it('parses prefixed PMIDs (case-insensitive prefix)', () => {
    const result = parseIdentifierFile('PMID:36543210\npmid:12345678');
    expect(result).toEqual([
      { type: 'pmid', value: '36543210', raw: 'PMID:36543210' },
      { type: 'pmid', value: '12345678', raw: 'pmid:12345678' },
    ]);
  });

  it('parses prefixed arXiv IDs (case-insensitive prefix)', () => {
    const result = parseIdentifierFile('arxiv:2301.12345\nARXIV:2305.67890');
    expect(result).toEqual([
      { type: 'arxiv', value: '2301.12345', raw: 'arxiv:2301.12345' },
      { type: 'arxiv', value: '2305.67890', raw: 'ARXIV:2305.67890' },
    ]);
  });

  it('skips comments and empty lines', () => {
    const input = `# This is a comment
10.1001/jama.2023.12345

# Another comment
37654321
`;
    const result = parseIdentifierFile(input);
    expect(result).toHaveLength(2);
    expect(result[0]!.type).toBe('doi');
    expect(result[1]!.type).toBe('pmid');
  });

  it('trims whitespace', () => {
    const result = parseIdentifierFile('  10.1001/jama.2023.12345  \n  37654321  ');
    expect(result).toEqual([
      { type: 'doi', value: '10.1001/jama.2023.12345', raw: '10.1001/jama.2023.12345' },
      { type: 'pmid', value: '37654321', raw: '37654321' },
    ]);
  });

  it('throws on unrecognizable lines with line number', () => {
    const input = `10.1001/jama.2023.12345
not-a-valid-id
37654321`;
    expect(() => parseIdentifierFile(input)).toThrow(/line 2/i);
    expect(() => parseIdentifierFile(input)).toThrow(/not-a-valid-id/);
  });

  it('handles mixed identifier types', () => {
    const input = `10.1001/jama.2023.12345
37654321
DOI:10.1038/s41586-023-xxxxx
PMID:36543210
arxiv:2301.12345`;
    const result = parseIdentifierFile(input);
    expect(result).toHaveLength(5);
    expect(result.map(r => r.type)).toEqual(['doi', 'pmid', 'doi', 'pmid', 'arxiv']);
  });

  it('returns empty array for empty input', () => {
    expect(parseIdentifierFile('')).toEqual([]);
    expect(parseIdentifierFile('# only comments\n\n')).toEqual([]);
  });
});

function makeArticle(overrides: Partial<Article> & { title: string }): Article {
  return {
    authors: [],
    source: 'pubmed',
    retrievedAt: '2024-01-15T00:00:00Z',
    ...overrides,
  };
}

describe('checkCoverage', () => {
  const articles: Article[] = [
    makeArticle({ doi: '10.1001/jama.2023.12345', pmid: '37654321', title: 'Article A', source: 'pubmed' }),
    makeArticle({ doi: '10.1038/s41586-023-xxxxx', title: 'Article B', source: 'pubmed' }),
    makeArticle({ doi: '10.1038/s41586-023-xxxxx', title: 'Article B (scopus)', source: 'scopus' }),
    makeArticle({ pmid: '11111111', title: 'Article C', source: 'pubmed' }),
  ];

  it('matches DOI case-insensitively', () => {
    const ids: ParsedIdentifier[] = [
      { type: 'doi', value: '10.1001/JAMA.2023.12345', raw: '10.1001/JAMA.2023.12345' },
    ];
    const result = checkCoverage(articles, ids);
    expect(result.found).toHaveLength(1);
    expect(result.found[0]!.query).toBe('10.1001/JAMA.2023.12345');
    expect(result.found[0]!.title).toBe('Article A');
  });

  it('matches PMID exactly', () => {
    const ids: ParsedIdentifier[] = [
      { type: 'pmid', value: '37654321', raw: 'PMID:37654321' },
    ];
    const result = checkCoverage(articles, ids);
    expect(result.found).toHaveLength(1);
    expect(result.found[0]!.title).toBe('Article A');
  });

  it('reports found articles with source databases', () => {
    const ids: ParsedIdentifier[] = [
      { type: 'doi', value: '10.1038/s41586-023-xxxxx', raw: '10.1038/s41586-023-xxxxx' },
    ];
    const result = checkCoverage(articles, ids);
    expect(result.found).toHaveLength(1);
    expect(result.found[0]!.sources).toEqual(['pubmed', 'scopus']);
  });

  it('reports missing identifiers', () => {
    const ids: ParsedIdentifier[] = [
      { type: 'doi', value: '10.9999/not-found', raw: '10.9999/not-found' },
      { type: 'pmid', value: '99999999', raw: '99999999' },
    ];
    const result = checkCoverage(articles, ids);
    expect(result.missing).toHaveLength(2);
    expect(result.found).toHaveLength(0);
  });

  it('calculates coverage percentage', () => {
    const ids: ParsedIdentifier[] = [
      { type: 'doi', value: '10.1001/jama.2023.12345', raw: '10.1001/jama.2023.12345' },
      { type: 'doi', value: '10.9999/not-found', raw: '10.9999/not-found' },
    ];
    const result = checkCoverage(articles, ids);
    expect(result.total).toBe(2);
    expect(result.foundCount).toBe(1);
    expect(result.missingCount).toBe(1);
    expect(result.coverage).toBeCloseTo(0.5);
  });

  it('handles articles with multiple identifiers (any match counts)', () => {
    // Article A has both DOI and PMID - searching by PMID should find it
    const ids: ParsedIdentifier[] = [
      { type: 'pmid', value: '37654321', raw: '37654321' },
    ];
    const result = checkCoverage(articles, ids);
    expect(result.found).toHaveLength(1);
    expect(result.found[0]!.title).toBe('Article A');
    expect(result.found[0]!.sources).toEqual(['pubmed']);
  });

  it('handles empty session (0% coverage)', () => {
    const ids: ParsedIdentifier[] = [
      { type: 'doi', value: '10.1001/jama.2023.12345', raw: '10.1001/jama.2023.12345' },
    ];
    const result = checkCoverage([], ids);
    expect(result.foundCount).toBe(0);
    expect(result.missingCount).toBe(1);
    expect(result.coverage).toBe(0);
  });

  it('handles empty identifier list', () => {
    const result = checkCoverage(articles, []);
    expect(result.total).toBe(0);
    expect(result.foundCount).toBe(0);
    expect(result.missingCount).toBe(0);
    expect(result.coverage).toBe(0);
  });

  it('deduplicates when same article matched via multiple input identifiers', () => {
    // Article A has DOI and PMID - if both are in input, should appear once in found
    const ids: ParsedIdentifier[] = [
      { type: 'doi', value: '10.1001/jama.2023.12345', raw: '10.1001/jama.2023.12345' },
      { type: 'pmid', value: '37654321', raw: 'PMID:37654321' },
    ];
    const result = checkCoverage(articles, ids);
    // Both identifiers are "found" but they match the same article
    expect(result.found).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.foundCount).toBe(2);
  });
});

describe('formatCheckResult', () => {
  const baseResult: CheckResult = {
    total: 3,
    foundCount: 2,
    missingCount: 1,
    coverage: 2 / 3,
    found: [
      { query: '10.1038/s41586-023-xxxxx', type: 'doi', sources: ['pubmed', 'scopus'], title: 'Multi-source Article' },
      { query: '10.1001/jama.2023.12345', type: 'doi', sources: ['pubmed'], title: 'Single-source Article' },
    ],
    missing: [
      { query: '10.9999/not-found', type: 'doi' },
    ],
  };

  it('shows coverage summary with found/total and percentage', () => {
    const output = formatCheckResult(baseResult, { sessionId: 'test_session', source: 'refs.txt' });
    expect(output).toContain('Found: 2/3 (66.7%)');
  });

  it('shows session and source info', () => {
    const output = formatCheckResult(baseResult, { sessionId: 'test_session', source: 'refs.txt' });
    expect(output).toContain('Coverage: test_session');
    expect(output).toContain('Source: refs.txt (3 identifiers)');
  });

  it('lists missing identifiers', () => {
    const output = formatCheckResult(baseResult, { sessionId: 'test_session', source: 'refs.txt' });
    expect(output).toContain('Missing (1):');
    expect(output).toContain('10.9999/not-found');
  });

  it('lists found identifiers with source databases', () => {
    const output = formatCheckResult(baseResult, { sessionId: 'test_session', source: 'refs.txt' });
    expect(output).toContain('Found (2):');
    expect(output).toContain('10.1038/s41586-023-xxxxx → Multi-source Article (pubmed, scopus)');
    expect(output).toContain('10.1001/jama.2023.12345 → Single-source Article (pubmed)');
  });

  it('--missing-only shows only missing', () => {
    const output = formatCheckResult(baseResult, { sessionId: 'test_session', source: 'refs.txt', missingOnly: true });
    expect(output).toContain('Missing (1):');
    expect(output).toContain('10.9999/not-found');
    expect(output).not.toContain('Found (2):');
  });
});

describe('formatCheckResultJson', () => {
  const baseResult: CheckResult = {
    total: 2,
    foundCount: 1,
    missingCount: 1,
    coverage: 0.5,
    found: [
      { query: '10.1038/s41586-023-xxxxx', type: 'doi', sources: ['pubmed', 'scopus'], title: 'Test Article' },
    ],
    missing: [
      { query: '10.9999/not-found', type: 'doi' },
    ],
  };

  it('returns valid JSON with correct structure', () => {
    const json = formatCheckResultJson(baseResult, { sessionId: 'test_session', source: 'refs.txt' });
    const parsed = JSON.parse(json);
    expect(parsed.session).toBe('test_session');
    expect(parsed.source).toBe('refs.txt');
    expect(parsed.total).toBe(2);
    expect(parsed.found).toBe(1);
    expect(parsed.missing).toBe(1);
    expect(parsed.coverage).toBe(0.5);
    expect(parsed.details.found).toHaveLength(1);
    expect(parsed.details.missing).toHaveLength(1);
  });

  it('includes correct detail fields', () => {
    const json = formatCheckResultJson(baseResult, { sessionId: 'test_session', source: 'refs.txt' });
    const parsed = JSON.parse(json);
    expect(parsed.details.found[0]).toEqual({
      query: '10.1038/s41586-023-xxxxx',
      type: 'doi',
      sources: ['pubmed', 'scopus'],
      title: 'Test Article',
    });
    expect(parsed.details.missing[0]).toEqual({
      query: '10.9999/not-found',
      type: 'doi',
    });
  });
});
