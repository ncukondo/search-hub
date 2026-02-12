import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validateQueryCommand,
  formatVocabValidationOutput,
  hasVocabErrors,
  detectSchemaLink,
} from './validate.js';
import * as fs from 'node:fs/promises';
import { createMockMeSHClient } from '../../../query/__test-helpers__/mock-mesh-client.js';

vi.mock('node:fs/promises');

const validYaml = `
name: test-query
description: A test query
query:
  - id: block-1
    field: title_abstract
    terms:
      keywords:
        - diabetes
        - insulin
    operator: OR
`;

const invalidYaml = `
name: 123
query:
  - id: block-1
    field: invalid_field
    terms: not_an_object
`;

const malformedYaml = `
name: test
query:
  - id: block-1
    field: title
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

  describe('auto vocab validation in validateQueryCommand', () => {
    const yamlWithMesh = `
name: test-query
query:
  - id: block-1
    field: title_abstract
    terms:
      keywords:
        - diabetes
      mesh:
        - "Diabetes Mellitus"
        - "Not A Real Term"
    operator: OR
`;

    it('should auto-validate vocab when MeSH terms exist and meshClient is provided', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(yamlWithMesh);

      const client = createMockMeSHClient(
        new Map([
          ['Diabetes Mellitus', { found: true }],
          ['Not A Real Term', { found: false, suggestions: ['Diabetes'] }],
        ])
      );

      const result = await validateQueryCommand('/path/to/query.yaml', {
        meshClient: client,
      });

      expect(result.success).toBe(true);
      expect(result.vocabResult).toBeDefined();
      expect(result.vocabResult!.valid).toHaveLength(1);
      expect(result.vocabResult!.invalid).toHaveLength(1);
    });

    it('should not include vocabResult for keywords-only queries', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(validYaml);

      const client = createMockMeSHClient(new Map());

      const result = await validateQueryCommand('/path/to/query.yaml', {
        meshClient: client,
      });

      expect(result.success).toBe(true);
      expect(result.vocabResult).toBeUndefined();
    });

    it('should skip vocab validation when noVocab option is set', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(yamlWithMesh);

      const client = createMockMeSHClient(
        new Map([['Diabetes Mellitus', { found: true }]])
      );

      const result = await validateQueryCommand('/path/to/query.yaml', {
        meshClient: client,
        noVocab: true,
      });

      expect(result.success).toBe(true);
      expect(result.vocabResult).toBeUndefined();
    });
  });

  describe('graceful degradation on API errors', () => {
    const yamlWithMesh = `
name: test-query
query:
  - id: block-1
    field: title_abstract
    terms:
      keywords:
        - diabetes
      mesh:
        - "Diabetes Mellitus"
        - "Unknown Term"
    operator: OR
`;

    it('should keep success=true when all API calls fail', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(yamlWithMesh);

      const client = {
        lookupTerm: vi.fn().mockRejectedValue(new Error('Network error')),
        lookupTerms: vi.fn(),
      } as unknown as import('../../../query/mesh-lookup.js').MeSHLookupClient;

      const result = await validateQueryCommand('/path/to/query.yaml', {
        meshClient: client,
      });

      expect(result.success).toBe(true);
      expect(result.vocabResult).toBeDefined();
      expect(result.vocabResult!.errors).toHaveLength(2);
      expect(result.vocabResult!.valid).toHaveLength(0);
      expect(result.vocabResult!.invalid).toHaveLength(0);
    });

    it('should handle partial API errors (some terms succeed, some fail)', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(yamlWithMesh);

      const client = {
        lookupTerm: vi.fn()
          .mockResolvedValueOnce({ term: 'Diabetes Mellitus', found: true })
          .mockRejectedValueOnce(new Error('Timeout')),
        lookupTerms: vi.fn(),
      } as unknown as import('../../../query/mesh-lookup.js').MeSHLookupClient;

      const result = await validateQueryCommand('/path/to/query.yaml', {
        meshClient: client,
      });

      expect(result.success).toBe(true);
      expect(result.vocabResult).toBeDefined();
      expect(result.vocabResult!.valid).toHaveLength(1);
      expect(result.vocabResult!.errors).toHaveLength(1);
    });

    it('should include warning text for API errors in vocab output', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(yamlWithMesh);

      const client = {
        lookupTerm: vi.fn()
          .mockResolvedValueOnce({ term: 'Diabetes Mellitus', found: true })
          .mockRejectedValueOnce(new Error('Network error')),
        lookupTerms: vi.fn(),
      } as unknown as import('../../../query/mesh-lookup.js').MeSHLookupClient;

      const result = await validateQueryCommand('/path/to/query.yaml', {
        meshClient: client,
      });

      const output = formatVocabValidationOutput(result.vocabResult!);
      expect(output).toContain('⚠');
      expect(output).toContain('Network error');
    });
  });

  describe('validateQueryCommand with meshClient (vocab validation)', () => {
    const yamlWithMesh = `
name: test-query
query:
  - id: block-1
    field: title_abstract
    terms:
      keywords:
        - diabetes
      mesh:
        - "Diabetes Mellitus"
        - "Not A Real Term"
    operator: OR
`;

    it('should validate MeSH terms when meshClient is provided', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(yamlWithMesh);

      const client = createMockMeSHClient(
        new Map([
          ['Diabetes Mellitus', { found: true }],
          ['Not A Real Term', { found: false, suggestions: ['Diabetes'] }],
        ])
      );

      const result = await validateQueryCommand('/path/to/query.yaml', { meshClient: client });

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

      const result = await validateQueryCommand('/nonexistent.yaml', { meshClient: client });

      expect(result.success).toBe(false);
      expect(result.vocabResult).toBeUndefined();
    });

    it('should return schema errors without attempting vocab validation', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(invalidYaml);

      const client = createMockMeSHClient(new Map());

      const result = await validateQueryCommand('/invalid.yaml', { meshClient: client });

      expect(result.success).toBe(false);
      expect(result.vocabResult).toBeUndefined();
    });

    it('should not include vocabResult when no controlled vocab terms', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(validYaml);

      const client = createMockMeSHClient(new Map());

      const result = await validateQueryCommand('/path/to/query.yaml', { meshClient: client });

      expect(result.success).toBe(true);
      expect(result.vocabResult).toBeUndefined();
    });
  });

  describe('hasVocabErrors', () => {
    it('should return true when there are invalid vocab terms', () => {
      const result = {
        success: true,
        vocabResult: {
          valid: [{ term: 'Diabetes Mellitus', vocabulary: 'mesh' as const, found: true }],
          invalid: [{ term: 'Not A Term', vocabulary: 'mesh' as const, found: false }],
          errors: [],
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
          errors: [],
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
        vocabResult: { valid: [], invalid: [], errors: [] },
      };
      expect(hasVocabErrors(result)).toBe(false);
    });
  });

  describe('detectSchemaLink', () => {
    it('should return true when $schema link is present', async () => {
      const yamlWithSchema =
        '# yaml-language-server: $schema=./query.schema.json\n' + validYaml;
      vi.mocked(fs.readFile).mockResolvedValue(yamlWithSchema);
      const result = await detectSchemaLink('/path/to/query.yaml');
      expect(result).toBe(true);
    });

    it('should return false when $schema link is absent', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(validYaml);
      const result = await detectSchemaLink('/path/to/query.yaml');
      expect(result).toBe(false);
    });

    it('should detect schema link within first 5 lines', async () => {
      const yamlWithSchemaLine3 =
        '# comment 1\n# comment 2\n# yaml-language-server: $schema=./query.schema.json\n' +
        validYaml;
      vi.mocked(fs.readFile).mockResolvedValue(yamlWithSchemaLine3);
      const result = await detectSchemaLink('/path/to/query.yaml');
      expect(result).toBe(true);
    });

    it('should return false if file read fails', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
      const result = await detectSchemaLink('/nonexistent.yaml');
      expect(result).toBe(false);
    });
  });

  describe('validateQueryCommand with count validators', () => {
    const yamlWithEric = `
name: test-query
query:
  - id: block-1
    field: title_abstract
    terms:
      keywords:
        - education
      eric:
        - "Medical Education"
        - "Medcial Education"
    operator: OR
`;

    const yamlWithEmtree = `
name: test-query
query:
  - id: block-1
    field: title_abstract
    terms:
      keywords:
        - diabetes
      emtree:
        - "diabetes mellitus"
        - "diabetis mellitus"
    operator: OR
`;

    const yamlWithMixed = `
name: test-query
query:
  - id: block-1
    field: title_abstract
    terms:
      keywords:
        - diabetes
      mesh:
        - "Diabetes Mellitus"
      eric:
        - "Medical Education"
      emtree:
        - "diabetes mellitus"
    operator: OR
`;

    it('should validate ERIC descriptors via count validators', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(yamlWithEric);

      const meshClient = createMockMeSHClient(new Map());
      const ericValidator = {
        vocabulary: 'eric' as const,
        countTerm: vi.fn(async (term: string) => {
          return term === 'Medical Education' ? 42 : 0;
        }),
      };

      const result = await validateQueryCommand('/path/to/query.yaml', {
        meshClient,
        countValidators: [ericValidator],
      });

      expect(result.vocabResult).toBeDefined();
      expect(result.vocabResult!.valid).toHaveLength(1);
      expect(result.vocabResult!.invalid).toHaveLength(1);
      expect(result.vocabResult!.valid[0]!.term).toBe('Medical Education');
      expect(result.vocabResult!.invalid[0]!.term).toBe('Medcial Education');
    });

    it('should validate Emtree terms via count validators', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(yamlWithEmtree);

      const meshClient = createMockMeSHClient(new Map());
      const emtreeValidator = {
        vocabulary: 'emtree' as const,
        countTerm: vi.fn(async (term: string) => {
          return term === 'diabetes mellitus' ? 100 : 0;
        }),
      };

      const result = await validateQueryCommand('/path/to/query.yaml', {
        meshClient,
        countValidators: [emtreeValidator],
      });

      expect(result.vocabResult).toBeDefined();
      expect(result.vocabResult!.valid).toHaveLength(1);
      expect(result.vocabResult!.invalid).toHaveLength(1);
    });

    it('should validate mixed vocabulary types together', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(yamlWithMixed);

      const meshClient = createMockMeSHClient(
        new Map([['Diabetes Mellitus', { found: true }]])
      );
      const ericValidator = {
        vocabulary: 'eric' as const,
        countTerm: vi.fn(async () => 50),
      };
      const emtreeValidator = {
        vocabulary: 'emtree' as const,
        countTerm: vi.fn(async () => 100),
      };

      const result = await validateQueryCommand('/path/to/query.yaml', {
        meshClient,
        countValidators: [ericValidator, emtreeValidator],
      });

      expect(result.vocabResult).toBeDefined();
      expect(result.vocabResult!.valid).toHaveLength(3);
    });

    it('should skip vocab validation with --no-vocab even with count validators', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(yamlWithEric);

      const meshClient = createMockMeSHClient(new Map());
      const ericValidator = {
        vocabulary: 'eric' as const,
        countTerm: vi.fn(async () => 42),
      };

      const result = await validateQueryCommand('/path/to/query.yaml', {
        meshClient,
        noVocab: true,
        countValidators: [ericValidator],
      });

      expect(result.vocabResult).toBeUndefined();
      expect(ericValidator.countTerm).not.toHaveBeenCalled();
    });
  });

  describe('formatVocabValidationOutput', () => {
    it('should format valid terms with checkmark', () => {
      const output = formatVocabValidationOutput({
        valid: [{ term: 'Diabetes Mellitus', vocabulary: 'mesh', found: true }],
        invalid: [],
        errors: [],
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
        errors: [],
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
        errors: [],
      });

      expect(output).toContain('✗');
      expect(output).toContain('Xyz');
      expect(output).not.toContain('Did you mean');
    });

    it('should return empty string when no controlled vocab terms', () => {
      const output = formatVocabValidationOutput({
        valid: [],
        invalid: [],
        errors: [],
      });

      expect(output).toBe('');
    });
  });
});
