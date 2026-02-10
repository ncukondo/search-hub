import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validateQueryCommand,
  validateVocabCommand,
  formatVocabValidationOutput,
  hasVocabErrors,
} from './validate.js';
import * as fs from 'node:fs/promises';
import { createMockMeSHClient } from '../../../query/__test-helpers__/mock-mesh-client.js';

vi.mock('node:fs/promises');

const validYaml = `
name: test-query
description: A test query
query:
  - field: title_abstract
    terms:
      keywords:
        - diabetes
        - insulin
    operator: OR
`;

const invalidYaml = `
name: 123
query:
  - field: invalid_field
    terms: not_an_object
`;

const malformedYaml = `
name: test
query:
  - field: title
  terms:  # wrong indentation
`;

describe('query validate command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('validateQueryCommand', () => {
    it('should return success for valid query file', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(validYaml);

      const result = await validateQueryCommand('/path/to/query.yaml');

      expect(result.success).toBe(true);
      expect(result.errors).toBeUndefined();
      expect(result.queryName).toBe('test-query');
    });

    it('should return errors for invalid query structure', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(invalidYaml);

      const result = await validateQueryCommand('/path/to/invalid.yaml');

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('should return error for malformed YAML', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(malformedYaml);

      const result = await validateQueryCommand('/path/to/malformed.yaml');

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should return error when file does not exist', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(
        new Error('ENOENT: no such file or directory')
      );

      const result = await validateQueryCommand('/path/to/nonexistent.yaml');

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('no such file');
    });

    it('should include query name in result for valid queries', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(validYaml);

      const result = await validateQueryCommand('/path/to/query.yaml');

      expect(result.queryName).toBe('test-query');
    });

    it('should include block count in result for valid queries', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(validYaml);

      const result = await validateQueryCommand('/path/to/query.yaml');

      expect(result.blockCount).toBe(1);
    });
  });

  describe('validateVocabCommand', () => {
    const yamlWithMesh = `
name: test-query
query:
  - field: title_abstract
    terms:
      keywords:
        - diabetes
      mesh:
        - "Diabetes Mellitus"
        - "Not A Real Term"
    operator: OR
`;

    it('should validate MeSH terms when vocab flag is set', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(yamlWithMesh);

      const client = createMockMeSHClient(
        new Map([
          ['Diabetes Mellitus', { found: true }],
          ['Not A Real Term', { found: false, suggestions: ['Diabetes'] }],
        ])
      );

      const result = await validateVocabCommand('/path/to/query.yaml', client);

      expect(result.success).toBe(true);
      expect(result.vocabResult).toBeDefined();
      expect(result.vocabResult!.valid).toHaveLength(1);
      expect(result.vocabResult!.invalid).toHaveLength(1);
    });

    it('should return file read errors without attempting vocab validation', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(
        new Error('ENOENT: no such file')
      );

      const client = createMockMeSHClient(new Map());

      const result = await validateVocabCommand('/nonexistent.yaml', client);

      expect(result.success).toBe(false);
      expect(result.vocabResult).toBeUndefined();
    });

    it('should return schema errors without attempting vocab validation', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(invalidYaml);

      const client = createMockMeSHClient(new Map());

      const result = await validateVocabCommand('/invalid.yaml', client);

      expect(result.success).toBe(false);
      expect(result.vocabResult).toBeUndefined();
    });

    it('should return empty vocab result when no controlled vocab terms', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(validYaml);

      const client = createMockMeSHClient(new Map());

      const result = await validateVocabCommand('/path/to/query.yaml', client);

      expect(result.success).toBe(true);
      expect(result.vocabResult).toBeDefined();
      expect(result.vocabResult!.valid).toHaveLength(0);
      expect(result.vocabResult!.invalid).toHaveLength(0);
    });
  });

  describe('hasVocabErrors', () => {
    it('should return true when there are invalid vocab terms', () => {
      const result = {
        success: true,
        vocabResult: {
          valid: [{ term: 'Diabetes Mellitus', vocabulary: 'mesh' as const, found: true }],
          invalid: [{ term: 'Not A Term', vocabulary: 'mesh' as const, found: false }],
        },
      };
      expect(hasVocabErrors(result)).toBe(true);
    });

    it('should return false when all vocab terms are valid', () => {
      const result = {
        success: true,
        vocabResult: {
          valid: [{ term: 'Diabetes Mellitus', vocabulary: 'mesh' as const, found: true }],
          invalid: [],
        },
      };
      expect(hasVocabErrors(result)).toBe(false);
    });

    it('should return false when no vocabResult', () => {
      const result = { success: true };
      expect(hasVocabErrors(result)).toBe(false);
    });

    it('should return false when vocabResult has no terms', () => {
      const result = {
        success: true,
        vocabResult: { valid: [], invalid: [] },
      };
      expect(hasVocabErrors(result)).toBe(false);
    });
  });

  describe('formatVocabValidationOutput', () => {
    it('should format valid terms with checkmark', () => {
      const output = formatVocabValidationOutput({
        valid: [{ term: 'Diabetes Mellitus', vocabulary: 'mesh', found: true }],
        invalid: [],
      });

      expect(output).toContain('✓');
      expect(output).toContain('Diabetes Mellitus');
    });

    it('should format invalid terms with cross and suggestions', () => {
      const output = formatVocabValidationOutput({
        valid: [],
        invalid: [
          {
            term: 'Not A Term',
            vocabulary: 'mesh',
            found: false,
            suggestions: ['Diabetes Mellitus'],
          },
        ],
      });

      expect(output).toContain('✗');
      expect(output).toContain('Not A Term');
      expect(output).toContain('Diabetes Mellitus');
    });

    it('should format invalid terms without suggestions', () => {
      const output = formatVocabValidationOutput({
        valid: [],
        invalid: [
          { term: 'Xyz', vocabulary: 'mesh', found: false },
        ],
      });

      expect(output).toContain('✗');
      expect(output).toContain('Xyz');
      expect(output).not.toContain('Did you mean');
    });

    it('should return empty string when no controlled vocab terms', () => {
      const output = formatVocabValidationOutput({
        valid: [],
        invalid: [],
      });

      expect(output).toBe('');
    });
  });
});
