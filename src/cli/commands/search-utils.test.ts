/**
 * Tests for search-utils.ts
 */
import { describe, it, expect } from 'vitest';
import { buildFailureErrorMessage, formatVerboseProviderDetails } from './search-utils.js';

describe('search-utils', () => {
  describe('buildFailureErrorMessage', () => {
    it('should include suggested actions after error details', () => {
      const results = {
        pubmed: { hits: 0, retrieved: 0, error: 'Network timeout' },
      };

      const message = buildFailureErrorMessage(results);

      expect(message).toContain('All providers failed');
      expect(message).toContain('pubmed');
      expect(message).toContain('Network timeout');
      expect(message).toContain('Suggested actions:');
      expect(message).toContain('--dry-run');
      expect(message).toContain('search-hub config');
      expect(message).toContain('--db');
    });

    it('should include suggested actions for multiple provider failures', () => {
      const results = {
        pubmed: { hits: 0, retrieved: 0, error: 'Timeout' },
        eric: { hits: 0, retrieved: 0, error: 'Service unavailable' },
      };

      const message = buildFailureErrorMessage(results);

      expect(message).toContain('pubmed');
      expect(message).toContain('eric');
      expect(message).toContain('Suggested actions:');
    });

    it('should return generic message when no error details', () => {
      const results = {
        pubmed: { hits: 0, retrieved: 0 },
      };

      const message = buildFailureErrorMessage(results);

      expect(message).toContain('All providers failed');
      expect(message).toContain('Suggested actions:');
    });
  });

  describe('formatVerboseProviderDetails', () => {
    it('should format failed provider details', () => {
      const results = {
        pubmed: { hits: 0, retrieved: 0, error: 'API unavailable' },
      };

      const output = formatVerboseProviderDetails(results);

      expect(output).toContain('Per-provider details');
      expect(output).toContain('pubmed');
      expect(output).toContain('FAILED');
      expect(output).toContain('API unavailable');
    });

    it('should format successful provider details', () => {
      const results = {
        pubmed: { hits: 10, retrieved: 10 },
      };

      const output = formatVerboseProviderDetails(results);

      expect(output).toContain('pubmed');
      expect(output).toContain('10 results');
    });

    it('should include warnings when present', () => {
      const results = {
        pubmed: { hits: 5, retrieved: 5, warnings: ['Rate limit approaching'] },
      };

      const output = formatVerboseProviderDetails(results);

      expect(output).toContain('warning');
      expect(output).toContain('Rate limit approaching');
    });
  });
});
