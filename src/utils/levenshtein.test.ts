import { describe, it, expect } from 'vitest';
import { levenshteinDistance } from './levenshtein.js';

describe('levenshteinDistance', () => {
  it('should return 0 for two empty strings', () => {
    expect(levenshteinDistance('', '')).toBe(0);
  });

  it('should return length of non-empty string when other is empty', () => {
    expect(levenshteinDistance('abc', '')).toBe(3);
  });

  it('should return 3 for kitten vs sitting', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
  });

  it('should return 1 for single-char typo in multi-word term', () => {
    expect(levenshteinDistance('Artificial Inteligence', 'Artificial Intelligence')).toBe(1);
  });

  it('should return 0 for identical single-char strings', () => {
    expect(levenshteinDistance('a', 'a')).toBe(0);
  });
});
