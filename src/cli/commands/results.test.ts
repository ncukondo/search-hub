/**
 * Tests for the results command - listing articles from a session.
 */
import { describe, it, expect } from 'vitest';
import type { Article } from '../../providers/base/types.js';
import {
  formatResultsList,
  formatResultsJson,
  parseResultsOptions,
  validateResultsInput,
  type ResultsCommandOptions,
} from './results.js';

function createTestArticle(
  overrides: Partial<Article> = {},
  omit?: ('journal' | 'doi' | 'publicationDate')[]
): Article {
  const base: Article = {
    title: 'Test Article Title',
    authors: [{ family: 'Smith', given: 'John' }],
    source: 'pubmed',
    retrievedAt: '2025-01-15T10:00:00Z',
    doi: '10.1000/test.001',
    publicationDate: '2025-01-01',
    journal: 'Test Journal',
    ...overrides,
  };

  if (omit) {
    for (const key of omit) {
      delete base[key];
    }
  }

  return base;
}

describe('formatResultsList', () => {
  it('formats a single article with default fields', () => {
    const articles = [createTestArticle()];
    const output = formatResultsList(articles, {
      sessionId: 'test-session',
      sessionName: 'test',
      total: 1,
    });

    expect(output).toContain('Results: test (test-session)');
    expect(output).toContain('Showing 1-1 of 1 article');
    expect(output).toContain('[2025]');
    expect(output).toContain('Test Article Title');
    expect(output).toContain('Test Journal');
    expect(output).toContain('DOI: 10.1000/test.001');
  });

  it('formats multiple articles with numbering', () => {
    const articles = [
      createTestArticle({ title: 'First Article', publicationDate: '2025-01-01' }),
      createTestArticle({ title: 'Second Article', publicationDate: '2024-06-15' }),
      createTestArticle({ title: 'Third Article', publicationDate: '2024-01-01' }),
    ];
    const output = formatResultsList(articles, {
      sessionId: 'test-session',
      sessionName: 'test',
      total: 3,
    });

    expect(output).toContain('Showing 1-3 of 3 articles');
    expect(output).toContain('1.');
    expect(output).toContain('First Article');
    expect(output).toContain('2.');
    expect(output).toContain('Second Article');
    expect(output).toContain('3.');
    expect(output).toContain('Third Article');
  });

  it('truncates long titles', () => {
    const longTitle = 'A'.repeat(100);
    const articles = [createTestArticle({ title: longTitle })];
    const output = formatResultsList(articles, {
      sessionId: 'test-session',
      sessionName: 'test',
      total: 1,
    });

    // Title should be truncated with ellipsis
    expect(output).toContain('...');
    expect(output).not.toContain(longTitle);
  });

  it('shows pagination info for offset results', () => {
    const articles = [createTestArticle()];
    const output = formatResultsList(articles, {
      sessionId: 'test-session',
      sessionName: 'test',
      total: 50,
      offset: 20,
    });

    expect(output).toContain('Showing 21-21 of 50 articles');
  });

  it('shows pagination info for limited results', () => {
    const articles = [
      createTestArticle({ title: 'Article 1' }),
      createTestArticle({ title: 'Article 2' }),
    ];
    const output = formatResultsList(articles, {
      sessionId: 'test-session',
      sessionName: 'test',
      total: 100,
      offset: 10,
    });

    expect(output).toContain('Showing 11-12 of 100 articles');
  });

  it('handles missing journal gracefully', () => {
    const articles = [createTestArticle({}, ['journal'])];
    const output = formatResultsList(articles, {
      sessionId: 'test-session',
      sessionName: 'test',
      total: 1,
    });

    expect(output).not.toContain('undefined');
  });

  it('handles missing DOI gracefully', () => {
    const articles = [createTestArticle({}, ['doi'])];
    const output = formatResultsList(articles, {
      sessionId: 'test-session',
      sessionName: 'test',
      total: 1,
    });

    expect(output).not.toContain('DOI:');
  });

  it('handles missing year gracefully', () => {
    const articles = [createTestArticle({}, ['publicationDate'])];
    const output = formatResultsList(articles, {
      sessionId: 'test-session',
      sessionName: 'test',
      total: 1,
    });

    expect(output).toContain('[----]');
  });

  it('uses correct numbering with offset', () => {
    const articles = [
      createTestArticle({ title: 'Article at position 21' }),
    ];
    const output = formatResultsList(articles, {
      sessionId: 'test-session',
      sessionName: 'test',
      total: 50,
      offset: 20,
    });

    // First article in results should be numbered 21
    expect(output).toContain('21.');
  });

  it('returns empty results message when no articles', () => {
    const output = formatResultsList([], {
      sessionId: 'test-session',
      sessionName: 'test',
      total: 0,
    });

    expect(output).toContain('Results: test (test-session)');
    expect(output).toContain('No articles found');
  });

  it('handles filtered results count', () => {
    const articles = [createTestArticle()];
    const output = formatResultsList(articles, {
      sessionId: 'test-session',
      sessionName: 'test',
      total: 1,
      filteredFrom: 10,
    });

    expect(output).toContain('filtered from 10');
  });
});

describe('formatResultsJson', () => {
  it('outputs valid JSON array of articles', () => {
    const articles = [
      createTestArticle({ title: 'Article 1' }),
      createTestArticle({ title: 'Article 2' }),
    ];
    const output = formatResultsJson(articles);

    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].title).toBe('Article 1');
    expect(parsed[1].title).toBe('Article 2');
  });

  it('includes year field from publicationDate', () => {
    const articles = [createTestArticle({ publicationDate: '2025-03-15' })];
    const output = formatResultsJson(articles);

    const parsed = JSON.parse(output);
    expect(parsed[0].year).toBe(2025);
  });

  it('sets year to null when publicationDate is missing', () => {
    const articles = [createTestArticle({}, ['publicationDate'])];
    const output = formatResultsJson(articles);

    const parsed = JSON.parse(output);
    expect(parsed[0].year).toBeNull();
  });

  it('returns empty array for no articles', () => {
    const output = formatResultsJson([]);

    const parsed = JSON.parse(output);
    expect(parsed).toEqual([]);
  });
});

describe('parseResultsOptions', () => {
  it('parses session ID with no options', () => {
    const result = parseResultsOptions('my-session', {});

    expect(result.sessionId).toBe('my-session');
    expect(result.limit).toBeUndefined();
    expect(result.offset).toBeUndefined();
    expect(result.json).toBe(false);
    expect(result.fields).toBeUndefined();
  });

  it('parses limit and offset options', () => {
    const result = parseResultsOptions('my-session', {
      limit: '20',
      offset: '40',
    });

    expect(result.limit).toBe(20);
    expect(result.offset).toBe(40);
  });

  it('parses json flag', () => {
    const result = parseResultsOptions('my-session', { json: true });

    expect(result.json).toBe(true);
  });

  it('parses fields option', () => {
    const result = parseResultsOptions('my-session', {
      fields: 'title,year,journal,doi',
    });

    expect(result.fields).toEqual(['title', 'year', 'journal', 'doi']);
  });

  it('parses db option', () => {
    const result = parseResultsOptions('my-session', { db: 'pubmed,scopus' });

    expect(result.providers).toEqual(['pubmed', 'scopus']);
  });

  it('parses filter-year option for range', () => {
    const result = parseResultsOptions('my-session', { filterYear: '2023-2025' });

    expect(result.filter?.yearFrom).toBe(2023);
    expect(result.filter?.yearTo).toBe(2025);
  });

  it('parses filter-year option for single year', () => {
    const result = parseResultsOptions('my-session', { filterYear: '2024' });

    expect(result.filter?.yearFrom).toBe(2024);
    expect(result.filter?.yearTo).toBe(2024);
  });

  it('parses filter-title option', () => {
    const result = parseResultsOptions('my-session', { filterTitle: 'diabetes,AI' });

    expect(result.filter?.titleKeywords).toEqual(['diabetes', 'AI']);
  });

  it('parses filter-abstract option', () => {
    const result = parseResultsOptions('my-session', { filterAbstract: 'machine learning' });

    expect(result.filter?.abstractKeywords).toEqual(['machine learning']);
  });
});

describe('validateResultsInput', () => {
  it('validates valid input', () => {
    const options: ResultsCommandOptions = {
      sessionId: 'my-session',
      json: false,
    };

    const result = validateResultsInput(options);

    expect(result.valid).toBe(true);
  });

  it('rejects empty session ID', () => {
    const options: ResultsCommandOptions = {
      sessionId: '',
      json: false,
    };

    const result = validateResultsInput(options);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('session ID');
  });

  it('rejects whitespace-only session ID', () => {
    const options: ResultsCommandOptions = {
      sessionId: '   ',
      json: false,
    };

    const result = validateResultsInput(options);

    expect(result.valid).toBe(false);
  });

  it('rejects negative limit', () => {
    const options: ResultsCommandOptions = {
      sessionId: 'my-session',
      json: false,
      limit: -5,
    };

    const result = validateResultsInput(options);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('limit');
  });

  it('rejects negative offset', () => {
    const options: ResultsCommandOptions = {
      sessionId: 'my-session',
      json: false,
      offset: -10,
    };

    const result = validateResultsInput(options);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('offset');
  });
});
