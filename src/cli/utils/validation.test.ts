import { describe, it, expect } from 'vitest';
import { isValidProviderName, parseProviderNames, getValidProviders } from './validation';

describe('validation', () => {
  describe('isValidProviderName', () => {
    it('should return true for valid provider names', () => {
      expect(isValidProviderName('pubmed')).toBe(true);
      expect(isValidProviderName('eric')).toBe(true);
      expect(isValidProviderName('arxiv')).toBe(true);
      expect(isValidProviderName('scopus')).toBe(true);
    });

    it('should return false for invalid provider names', () => {
      expect(isValidProviderName('invalid')).toBe(false);
      expect(isValidProviderName('google')).toBe(false);
      expect(isValidProviderName('')).toBe(false);
      expect(isValidProviderName('PUBMED')).toBe(false); // case sensitive
    });
  });

  describe('parseProviderNames', () => {
    it('should parse single provider', () => {
      expect(parseProviderNames('pubmed')).toEqual(['pubmed']);
    });

    it('should parse multiple comma-separated providers', () => {
      expect(parseProviderNames('pubmed,eric,arxiv')).toEqual(['pubmed', 'eric', 'arxiv']);
    });

    it('should trim whitespace around provider names', () => {
      expect(parseProviderNames(' pubmed , eric ')).toEqual(['pubmed', 'eric']);
    });

    it('should convert to lowercase', () => {
      expect(parseProviderNames('PubMed,ERIC')).toEqual(['pubmed', 'eric']);
    });

    it('should throw error for invalid provider', () => {
      expect(() => parseProviderNames('invalid')).toThrow(
        'Invalid provider(s): invalid. Valid: pubmed, eric, arxiv, scopus',
      );
    });

    it('should list all invalid providers in error message', () => {
      expect(() => parseProviderNames('foo,bar,pubmed')).toThrow(
        'Invalid provider(s): foo, bar. Valid: pubmed, eric, arxiv, scopus',
      );
    });

    it('should handle mixed valid and invalid providers', () => {
      expect(() => parseProviderNames('pubmed,invalid,eric')).toThrow(
        'Invalid provider(s): invalid',
      );
    });
  });

  describe('getValidProviders', () => {
    it('should return all valid providers', () => {
      const providers = getValidProviders();
      expect(providers).toContain('pubmed');
      expect(providers).toContain('eric');
      expect(providers).toContain('arxiv');
      expect(providers).toContain('scopus');
      expect(providers).toHaveLength(4);
    });

    it('should return readonly array', () => {
      const providers = getValidProviders();
      // TypeScript would prevent modification, but verify it's an array
      expect(Array.isArray(providers)).toBe(true);
    });
  });
});
