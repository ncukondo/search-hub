/**
 * Tests for CSL-JSON conversion module.
 */

import { describe, it, expect } from 'vitest';
import type { Article } from '../providers/base/types.js';
import {
  generateCslId,
  parseDateParts,
  articleToCslJson,
  articlesToCslJson,
} from './csl-json.js';

// Helper to create test articles
function createArticle(overrides: Partial<Article> = {}): Article {
  return {
    title: 'Test Article',
    authors: [{ family: 'Smith', given: 'John' }],
    source: 'pubmed',
    retrievedAt: '2024-01-15T10:00:00.000Z',
    ...overrides,
  };
}

describe('generateCslId', () => {
  it('should generate id from first author family name and year', () => {
    const article = createArticle({
      authors: [{ family: 'Smith', given: 'John' }],
      publicationDate: '2024-01-15',
    });
    expect(generateCslId(article)).toBe('smith-2024');
  });

  it('should lowercase the family name', () => {
    const article = createArticle({
      authors: [{ family: 'TANAKA', given: 'Taro' }],
      publicationDate: '2023-06-01',
    });
    expect(generateCslId(article)).toBe('tanaka-2023');
  });

  it('should use "anon" when there are no authors', () => {
    const article = createArticle({
      authors: [],
      publicationDate: '2024-01-15',
    });
    expect(generateCslId(article)).toBe('anon-2024');
  });

  it('should use "nd" when there is no publication date', () => {
    const article = createArticle({
      authors: [{ family: 'Smith', given: 'John' }],
    });
    expect(generateCslId(article)).toBe('smith-nd');
  });

  it('should handle year-only date', () => {
    const article = createArticle({
      authors: [{ family: 'Jones', given: 'Jane' }],
      publicationDate: '2023',
    });
    expect(generateCslId(article)).toBe('jones-2023');
  });

  it('should handle year-month date', () => {
    const article = createArticle({
      authors: [{ family: 'Chen', given: 'Wei' }],
      publicationDate: '2024-03',
    });
    expect(generateCslId(article)).toBe('chen-2024');
  });

  it('should use only the first author for ID generation', () => {
    const article = createArticle({
      authors: [
        { family: 'Smith', given: 'John' },
        { family: 'Jones', given: 'Jane' },
      ],
      publicationDate: '2024-01-15',
    });
    expect(generateCslId(article)).toBe('smith-2024');
  });

  it('should handle no authors and no date', () => {
    const article = createArticle({
      authors: [],
    });
    expect(generateCslId(article)).toBe('anon-nd');
  });
});

describe('parseDateParts', () => {
  it('should parse full date "2024-01-15" to [[2024,1,15]]', () => {
    expect(parseDateParts('2024-01-15')).toEqual([[2024, 1, 15]]);
  });

  it('should parse year-month "2024-01" to [[2024,1]]', () => {
    expect(parseDateParts('2024-01')).toEqual([[2024, 1]]);
  });

  it('should parse year-only "2024" to [[2024]]', () => {
    expect(parseDateParts('2024')).toEqual([[2024]]);
  });

  it('should return undefined for undefined input', () => {
    expect(parseDateParts(undefined)).toBeUndefined();
  });

  it('should return undefined for empty string', () => {
    expect(parseDateParts('')).toBeUndefined();
  });

  it('should handle date with leading zeros correctly', () => {
    expect(parseDateParts('2024-03-05')).toEqual([[2024, 3, 5]]);
  });
});

describe('articleToCslJson', () => {
  it('should map a fully populated article to CSL-JSON', () => {
    const article = createArticle({
      title: 'Machine Learning in Healthcare',
      authors: [
        { family: 'Smith', given: 'John' },
        { family: 'Jones', given: 'Jane' },
      ],
      doi: '10.1234/ml-health',
      pmid: '12345678',
      abstract: 'This is the abstract.',
      publicationDate: '2024-01-15',
      journal: 'Nature Medicine',
      volume: '30',
      issue: '1',
      pages: '100-110',
    });

    const csl = articleToCslJson(article, 'smith-2024');

    expect(csl.id).toBe('smith-2024');
    expect(csl.type).toBe('article-journal');
    expect(csl.title).toBe('Machine Learning in Healthcare');
    expect(csl.author).toEqual([
      { family: 'Smith', given: 'John' },
      { family: 'Jones', given: 'Jane' },
    ]);
    expect(csl.DOI).toBe('10.1234/ml-health');
    expect(csl.PMID).toBe('12345678');
    expect(csl.abstract).toBe('This is the abstract.');
    expect(csl.issued).toEqual({ 'date-parts': [[2024, 1, 15]] });
    expect(csl['container-title']).toBe('Nature Medicine');
    expect(csl.volume).toBe('30');
    expect(csl.issue).toBe('1');
    expect(csl.page).toBe('100-110');
  });

  it('should produce valid CSL-JSON for a minimal article (only title)', () => {
    const article = createArticle({
      title: 'Minimal Article',
      authors: [],
    });

    const csl = articleToCslJson(article, 'anon-nd');

    expect(csl.id).toBe('anon-nd');
    expect(csl.type).toBe('article-journal');
    expect(csl.title).toBe('Minimal Article');
    expect(csl.author).toEqual([]);
    // Optional fields should not be present
    expect(csl.DOI).toBeUndefined();
    expect(csl.PMID).toBeUndefined();
    expect(csl.abstract).toBeUndefined();
    expect(csl.issued).toBeUndefined();
    expect(csl['container-title']).toBeUndefined();
    expect(csl.volume).toBeUndefined();
    expect(csl.issue).toBeUndefined();
    expect(csl.page).toBeUndefined();
  });
});

describe('articlesToCslJson', () => {
  it('should convert multiple articles to CSL-JSON array', () => {
    const articles = [
      createArticle({
        authors: [{ family: 'Smith', given: 'John' }],
        publicationDate: '2024-01-15',
        title: 'Article One',
      }),
      createArticle({
        authors: [{ family: 'Jones', given: 'Jane' }],
        publicationDate: '2023-06-01',
        title: 'Article Two',
      }),
    ];

    const result = articlesToCslJson(articles);

    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('smith-2024');
    expect(result[1]!.id).toBe('jones-2023');
  });

  it('should resolve duplicate IDs with suffix (a, b, ...)', () => {
    const articles = [
      createArticle({
        authors: [{ family: 'Smith', given: 'John' }],
        publicationDate: '2024-01-15',
        title: 'First Smith Article',
      }),
      createArticle({
        authors: [{ family: 'Smith', given: 'Jane' }],
        publicationDate: '2024-06-01',
        title: 'Second Smith Article',
      }),
      createArticle({
        authors: [{ family: 'Smith', given: 'Bob' }],
        publicationDate: '2024-12-01',
        title: 'Third Smith Article',
      }),
    ];

    const result = articlesToCslJson(articles);

    expect(result).toHaveLength(3);
    expect(result[0]!.id).toBe('smith-2024');
    expect(result[1]!.id).toBe('smith-2024a');
    expect(result[2]!.id).toBe('smith-2024b');
  });

  it('should handle empty article array', () => {
    const result = articlesToCslJson([]);
    expect(result).toEqual([]);
  });
});
