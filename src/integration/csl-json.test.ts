/**
 * Tests for CSL-JSON conversion module.
 */

import { describe, it, expect } from 'vitest';
import type { Article } from '../providers/base/types.js';
import { generateCslId, parseDateParts } from './csl-json.js';

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
