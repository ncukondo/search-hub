/**
 * Tests for the query filter module - tokenizer and matcher.
 */
import { describe, it, expect } from 'vitest';
import type { Article } from '../../providers/base/types.js';
import { tokenizeQuery, matchArticle, filterByQuery } from './query-filter.js';

// ─── Tokenizer tests ────────────────────────────────────────────────────────

describe('tokenizeQuery', () => {
  it('tokenizes free text word', () => {
    expect(tokenizeQuery('diabetes')).toEqual([
      { type: 'text', value: 'diabetes' },
    ]);
  });

  it('tokenizes quoted free text phrase', () => {
    expect(tokenizeQuery('"deep learning"')).toEqual([
      { type: 'text', value: 'deep learning' },
    ]);
  });

  it('tokenizes field:value term', () => {
    expect(tokenizeQuery('author:smith')).toEqual([
      { type: 'field', field: 'author', value: 'smith' },
    ]);
  });

  it('tokenizes field with quoted value', () => {
    expect(tokenizeQuery('title:"deep learning"')).toEqual([
      { type: 'field', field: 'title', value: 'deep learning' },
    ]);
  });

  it('tokenizes year range', () => {
    expect(tokenizeQuery('year:2020-2024')).toEqual([
      { type: 'field', field: 'year', value: '2020-2024' },
    ]);
  });

  it('tokenizes multiple terms', () => {
    expect(tokenizeQuery('author:smith year:2023')).toEqual([
      { type: 'field', field: 'author', value: 'smith' },
      { type: 'field', field: 'year', value: '2023' },
    ]);
  });

  it('tokenizes mixed free text and field terms', () => {
    expect(tokenizeQuery('diabetes author:tanaka year:2020-2024')).toEqual([
      { type: 'text', value: 'diabetes' },
      { type: 'field', field: 'author', value: 'tanaka' },
      { type: 'field', field: 'year', value: '2020-2024' },
    ]);
  });

  it('returns empty array for empty string', () => {
    expect(tokenizeQuery('')).toEqual([]);
  });

  it('returns empty array for whitespace-only string', () => {
    expect(tokenizeQuery('   ')).toEqual([]);
  });

  it('handles unclosed quotes by treating as regular text', () => {
    const tokens = tokenizeQuery('"unclosed');
    expect(tokens).toEqual([
      { type: 'text', value: 'unclosed' },
    ]);
  });

  it('handles unclosed quotes in field value', () => {
    const tokens = tokenizeQuery('title:"unclosed');
    expect(tokens).toEqual([
      { type: 'field', field: 'title', value: 'unclosed' },
    ]);
  });

  it('tokenizes all supported field names', () => {
    const fields = ['title', 'abstract', 'author', 'journal', 'year', 'doi', 'pmid', 'arxiv', 'scopus', 'eric', 'source'];
    for (const field of fields) {
      const tokens = tokenizeQuery(`${field}:test`);
      expect(tokens).toEqual([
        { type: 'field', field, value: 'test' },
      ]);
    }
  });

  it('treats unknown field prefix as free text', () => {
    expect(tokenizeQuery('unknown:value')).toEqual([
      { type: 'text', value: 'unknown:value' },
    ]);
  });
});

// ─── Matcher tests ──────────────────────────────────────────────────────────

function createTestArticle(
  overrides: Partial<Article> = {},
  omit?: ('abstract' | 'journal' | 'doi' | 'pmid' | 'publicationDate')[],
): Article {
  const base: Article = {
    title: 'Deep Learning for Diabetes Prediction',
    authors: [
      { family: 'Tanaka', given: 'Yuki' },
      { family: 'Smith', given: 'John' },
    ],
    source: 'pubmed',
    retrievedAt: '2025-01-15T10:00:00Z',
    doi: '10.1001/jama.2023.12345',
    pmid: '12345678',
    publicationDate: '2023-06-15',
    journal: 'The Lancet Digital Health',
    abstract: 'A randomized controlled trial of deep learning models for diabetes prediction.',
    ...overrides,
  };

  if (omit) {
    for (const key of omit) {
      delete base[key];
    }
  }

  return base;
}

describe('matchArticle', () => {
  const article = createTestArticle();

  it('matches free text against title', () => {
    const tokens = tokenizeQuery('diabetes');
    expect(matchArticle(article, tokens)).toBe(true);
  });

  it('matches free text against abstract', () => {
    const tokens = tokenizeQuery('randomized');
    expect(matchArticle(article, tokens)).toBe(true);
  });

  it('does not match free text not in title or abstract', () => {
    const tokens = tokenizeQuery('nonexistent');
    expect(matchArticle(article, tokens)).toBe(false);
  });

  it('matches title: field against title only', () => {
    const tokens = tokenizeQuery('title:diabetes');
    expect(matchArticle(article, tokens)).toBe(true);
  });

  it('does not match title: when term is only in abstract', () => {
    const tokens = tokenizeQuery('title:randomized');
    expect(matchArticle(article, tokens)).toBe(false);
  });

  it('matches abstract: field against abstract only', () => {
    const tokens = tokenizeQuery('abstract:randomized');
    expect(matchArticle(article, tokens)).toBe(true);
  });

  it('does not match abstract: when term is only in title', () => {
    const tokens = tokenizeQuery('abstract:prediction');
    // "prediction" is in both title and abstract
    expect(matchArticle(article, tokens)).toBe(true);

    const tokens2 = tokenizeQuery('abstract:"deep learning for"');
    // "deep learning for" is in title but not abstract exactly
    expect(matchArticle(article, tokens2)).toBe(false);
  });

  it('matches author: against family name', () => {
    const tokens = tokenizeQuery('author:tanaka');
    expect(matchArticle(article, tokens)).toBe(true);
  });

  it('matches author: against given name', () => {
    const tokens = tokenizeQuery('author:yuki');
    expect(matchArticle(article, tokens)).toBe(true);
  });

  it('does not match author: when name not present', () => {
    const tokens = tokenizeQuery('author:johnson');
    expect(matchArticle(article, tokens)).toBe(false);
  });

  it('matches journal: as substring', () => {
    const tokens = tokenizeQuery('journal:lancet');
    expect(matchArticle(article, tokens)).toBe(true);
  });

  it('matches year: exact', () => {
    const tokens = tokenizeQuery('year:2023');
    expect(matchArticle(article, tokens)).toBe(true);
  });

  it('does not match year: when different', () => {
    const tokens = tokenizeQuery('year:2024');
    expect(matchArticle(article, tokens)).toBe(false);
  });

  it('matches year: range', () => {
    const tokens = tokenizeQuery('year:2020-2024');
    expect(matchArticle(article, tokens)).toBe(true);
  });

  it('does not match year: range when outside', () => {
    const tokens = tokenizeQuery('year:2024-2025');
    expect(matchArticle(article, tokens)).toBe(false);
  });

  it('matches doi: case-insensitive exact match', () => {
    const tokens = tokenizeQuery('doi:10.1001/JAMA.2023.12345');
    expect(matchArticle(article, tokens)).toBe(true);
  });

  it('does not match doi: partial', () => {
    const tokens = tokenizeQuery('doi:10.1001');
    expect(matchArticle(article, tokens)).toBe(false);
  });

  it('matches pmid: exact match', () => {
    const tokens = tokenizeQuery('pmid:12345678');
    expect(matchArticle(article, tokens)).toBe(true);
  });

  it('matches source: exact match', () => {
    const tokens = tokenizeQuery('source:pubmed');
    expect(matchArticle(article, tokens)).toBe(true);
  });

  it('does not match source: when different', () => {
    const tokens = tokenizeQuery('source:eric');
    expect(matchArticle(article, tokens)).toBe(false);
  });

  // AND logic between different fields
  it('applies AND logic between different fields', () => {
    const tokens = tokenizeQuery('author:smith year:2023');
    expect(matchArticle(article, tokens)).toBe(true);

    const tokens2 = tokenizeQuery('author:smith year:2024');
    expect(matchArticle(article, tokens2)).toBe(false);
  });

  // OR logic for same field repeated
  it('applies OR logic for repeated same field', () => {
    const tokens = tokenizeQuery('title:diabetes title:obesity');
    expect(matchArticle(article, tokens)).toBe(true); // diabetes matches

    const tokens2 = tokenizeQuery('title:nonexistent1 title:nonexistent2');
    expect(matchArticle(article, tokens2)).toBe(false);
  });

  // Case-insensitive matching
  it('matches case-insensitively', () => {
    const tokens = tokenizeQuery('title:DIABETES');
    expect(matchArticle(article, tokens)).toBe(true);
  });

  // Missing fields don't crash
  it('handles missing abstract gracefully', () => {
    const noAbstract = createTestArticle({}, ['abstract']);
    const tokens = tokenizeQuery('abstract:something');
    expect(matchArticle(noAbstract, tokens)).toBe(false);
  });

  it('handles missing journal gracefully', () => {
    const noJournal = createTestArticle({}, ['journal']);
    const tokens = tokenizeQuery('journal:something');
    expect(matchArticle(noJournal, tokens)).toBe(false);
  });

  it('handles missing publicationDate gracefully', () => {
    const noDate = createTestArticle({}, ['publicationDate']);
    const tokens = tokenizeQuery('year:2023');
    expect(matchArticle(noDate, tokens)).toBe(false);
  });

  it('handles article with no doi for doi: query', () => {
    const noDoi = createTestArticle({}, ['doi']);
    const tokens = tokenizeQuery('doi:10.1001/xxx');
    expect(matchArticle(noDoi, tokens)).toBe(false);
  });

  // OR logic for free text across same-type tokens
  it('applies OR for multiple free text terms', () => {
    const tokens = tokenizeQuery('diabetes nonexistent');
    // Different text tokens: text is a special "field" so multiple text terms use OR
    // Actually per spec: "Same field repeated: OR logic" — free text matches title OR abstract
    // Multiple free text terms: they are all "text" type, so OR within same "field"
    expect(matchArticle(article, tokens)).toBe(true);
  });
});

// ─── filterByQuery tests ────────────────────────────────────────────────────

describe('filterByQuery', () => {
  const articles = [
    createTestArticle({ title: 'Alpha Study on Diabetes', pmid: '111' }),
    createTestArticle({ title: 'Beta Study on Obesity', pmid: '222', abstract: 'An obesity research paper.' }),
    createTestArticle({ title: 'Gamma Study on Heart Disease', pmid: '333', source: 'eric' }),
  ];

  it('returns all articles for empty query', () => {
    expect(filterByQuery(articles, '')).toEqual(articles);
  });

  it('filters by free text', () => {
    const result = filterByQuery(articles, 'obesity');
    expect(result).toHaveLength(1);
    expect(result[0]!.pmid).toBe('222');
  });

  it('filters by field query', () => {
    const result = filterByQuery(articles, 'source:eric');
    expect(result).toHaveLength(1);
    expect(result[0]!.pmid).toBe('333');
  });

  it('filters by combined query', () => {
    const result = filterByQuery(articles, 'diabetes source:pubmed');
    expect(result).toHaveLength(1);
    expect(result[0]!.pmid).toBe('111');
  });
});
