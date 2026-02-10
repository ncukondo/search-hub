/**
 * E2E Tests for `search-hub query validate` command
 *
 * Tests query file validation functionality.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import {
  setupE2EContext,
  type E2EContext,
  createQueryFile,
  createRawQueryFile,
  queryFixtures,
  invalidQueryFixtures,
} from '../../e2e-helpers.js';
import {
  validateQueryCommand,
  validateVocabCommand,
  formatValidateResult,
  formatVocabValidationOutput,
} from './validate.js';
import { createMockMeSHClient } from '../../../query/__test-helpers__/mock-mesh-client.js';

describe('search-hub query validate E2E', () => {
  let ctx: E2EContext;

  beforeEach(async () => {
    ctx = await setupE2EContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  describe('validate - valid query file passes', () => {
    it('should validate simple query file', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);

      const result = await validateQueryCommand(queryPath);

      expect(result.success).toBe(true);
      expect(result.queryName).toBe('simple-test');
      expect(result.blockCount).toBe(1);
    });

    it('should validate multi-block query file', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.multiBlock);

      const result = await validateQueryCommand(queryPath);

      expect(result.success).toBe(true);
      expect(result.queryName).toBe('multi-block-test');
      expect(result.blockCount).toBe(2);
    });

    it('should validate query with MeSH terms', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.withMesh);

      const result = await validateQueryCommand(queryPath);

      expect(result.success).toBe(true);
      expect(result.queryName).toBe('mesh-test');
    });

    it('should validate query with filters', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: filter-test
query:
  - field: title_abstract
    terms:
      keywords:
        - test
    operator: AND
filters:
  year_from: 2020
  year_to: 2024
  languages:
    - en
    - de
`
      );

      const result = await validateQueryCommand(queryPath);

      expect(result.success).toBe(true);
      expect(result.queryName).toBe('filter-test');
    });
  });

  describe('validate - invalid query file shows errors', () => {
    it('should fail for missing name field', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        invalidQueryFixtures.missingName
      );

      const result = await validateQueryCommand(queryPath);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
      // Should mention "name" is required
      const errorText = result.errors!.join(' ');
      expect(errorText.toLowerCase()).toMatch(/name|required/i);
    });

    it('should fail for invalid field type', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        invalidQueryFixtures.invalidField
      );

      const result = await validateQueryCommand(queryPath);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should fail for empty keywords', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        invalidQueryFixtures.emptyKeywords
      );

      const result = await validateQueryCommand(queryPath);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should fail for malformed YAML', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        invalidQueryFixtures.malformedYaml
      );

      const result = await validateQueryCommand(queryPath);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should fail for completely empty file', async () => {
      const queryPath = await createRawQueryFile(ctx.tempDir, '');

      const result = await validateQueryCommand(queryPath);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should fail for invalid year range', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: invalid-year-test
query:
  - field: title_abstract
    terms:
      keywords:
        - test
    operator: AND
filters:
  year_from: "invalid"
`
      );

      const result = await validateQueryCommand(queryPath);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });

  describe('validate - missing file shows error', () => {
    it('should fail for non-existent file', async () => {
      const nonExistentPath = join(ctx.tempDir, 'nonexistent.yaml');

      const result = await validateQueryCommand(nonExistentPath);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
      // Should mention file not found or similar
      const errorText = result.errors!.join(' ').toLowerCase();
      expect(errorText).toMatch(/no such file|enoent|not found/i);
    });
  });

  describe('validate - helpful error messages', () => {
    it('should provide path in error for invalid field', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: test
query:
  - field: invalid_field_type
    terms:
      keywords:
        - test
    operator: AND
`
      );

      const result = await validateQueryCommand(queryPath);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      // Error should indicate which field has the problem
      const errorText = result.errors!.join('\n');
      expect(errorText).toMatch(/field|invalid/i);
    });

    it('should provide path for nested validation errors', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: test
query:
  - field: title_abstract
    terms:
      keywords: "not an array"
    operator: AND
`
      );

      const result = await validateQueryCommand(queryPath);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should show operator error', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: test
query:
  - field: title_abstract
    terms:
      keywords:
        - test
    operator: INVALID
`
      );

      const result = await validateQueryCommand(queryPath);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });

  describe('formatValidateResult', () => {
    it('should format success result correctly', () => {
      const result = {
        success: true,
        queryName: 'test-query',
        blockCount: 3,
      };

      const output = formatValidateResult(result, '/path/to/query.yaml');

      expect(output).toContain('✓ Valid query file');
      expect(output).toContain('/path/to/query.yaml');
      expect(output).toContain('Name: test-query');
      expect(output).toContain('Blocks: 3');
    });

    it('should format failure result correctly', () => {
      const result = {
        success: false,
        errors: ['Missing name field', 'Invalid operator'],
      };

      const output = formatValidateResult(result, '/path/to/query.yaml');

      expect(output).toContain('✗ Invalid query file');
      expect(output).toContain('/path/to/query.yaml');
      expect(output).toContain('Errors:');
      expect(output).toContain('Missing name field');
      expect(output).toContain('Invalid operator');
    });

    it('should format single error correctly', () => {
      const result = {
        success: false,
        errors: ['File not found'],
      };

      const output = formatValidateResult(result, '/missing.yaml');

      expect(output).toContain('✗ Invalid query file');
      expect(output).toContain('File not found');
    });
  });

  describe('edge cases', () => {
    it('should handle query with only keywords', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: minimal-query
query:
  - field: all
    terms:
      keywords:
        - single
    operator: OR
`
      );

      const result = await validateQueryCommand(queryPath);

      expect(result.success).toBe(true);
      expect(result.queryName).toBe('minimal-query');
    });

    it('should handle query with description', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: described-query
description: This is a detailed description of the query
query:
  - field: title_abstract
    terms:
      keywords:
        - test
    operator: AND
`
      );

      const result = await validateQueryCommand(queryPath);

      expect(result.success).toBe(true);
      expect(result.queryName).toBe('described-query');
    });

    it('should handle query with provider overrides', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: override-query
query:
  - field: title_abstract
    terms:
      keywords:
        - test
    operator: AND
overrides:
  pubmed:
    filters:
      year_from: 2022
`
      );

      const result = await validateQueryCommand(queryPath);

      expect(result.success).toBe(true);
      expect(result.queryName).toBe('override-query');
    });
  });

  describe('validate --vocab (controlled vocabulary)', () => {
    it('should validate MeSH terms in real query file', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: mesh-vocab-test
query:
  - field: title_abstract
    terms:
      keywords:
        - diabetes
      mesh:
        - "Diabetes Mellitus"
        - "Diabetes Mellitus, Type 2"
    operator: OR
`
      );

      const client = createMockMeSHClient(
        new Map([
          ['Diabetes Mellitus', { found: true }],
          ['Diabetes Mellitus, Type 2', { found: true }],
        ])
      );

      const result = await validateVocabCommand(queryPath, client);

      expect(result.success).toBe(true);
      expect(result.vocabResult).toBeDefined();
      expect(result.vocabResult!.valid).toHaveLength(2);
      expect(result.vocabResult!.invalid).toHaveLength(0);
    });

    it('should report invalid MeSH terms with suggestions', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: invalid-mesh-test
query:
  - field: title_abstract
    terms:
      keywords:
        - diabetes
      mesh:
        - "Diabetes Mellitis"
    operator: OR
`
      );

      const client = createMockMeSHClient(
        new Map([
          [
            'Diabetes Mellitis',
            {
              found: false,
              suggestions: [
                'Diabetes Mellitus',
                'Diabetes Mellitus, Type 2',
              ],
            },
          ],
        ])
      );

      const result = await validateVocabCommand(queryPath, client);

      expect(result.success).toBe(true);
      expect(result.vocabResult).toBeDefined();
      expect(result.vocabResult!.invalid).toHaveLength(1);
      expect(result.vocabResult!.invalid[0]!.suggestions).toContain(
        'Diabetes Mellitus'
      );
    });

    it('should format vocab validation output correctly', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: format-test
query:
  - field: title_abstract
    terms:
      keywords:
        - AI
      mesh:
        - "Artificial Intelligence"
        - "Not A Real Term"
    operator: OR
`
      );

      const client = createMockMeSHClient(
        new Map([
          ['Artificial Intelligence', { found: true }],
          ['Not A Real Term', { found: false, suggestions: ['Artificial Intelligence'] }],
        ])
      );

      const result = await validateVocabCommand(queryPath, client);

      expect(result.vocabResult).toBeDefined();
      const output = formatVocabValidationOutput(result.vocabResult!);

      expect(output).toContain('Controlled vocabulary:');
      expect(output).toContain('✓ mesh: "Artificial Intelligence"');
      expect(output).toContain('✗ mesh: "Not A Real Term"');
      expect(output).toContain('Did you mean: "Artificial Intelligence"');
    });

    it('should skip vocab validation for invalid query files', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
query: not_valid
`
      );

      const client = createMockMeSHClient(new Map());

      const result = await validateVocabCommand(queryPath, client);

      expect(result.success).toBe(false);
      expect(result.vocabResult).toBeUndefined();
    });

    it('should handle query with no controlled vocab terms', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: no-vocab-test
query:
  - field: title_abstract
    terms:
      keywords:
        - diabetes
    operator: OR
`
      );

      const client = createMockMeSHClient(new Map());

      const result = await validateVocabCommand(queryPath, client);

      expect(result.success).toBe(true);
      expect(result.vocabResult).toBeDefined();
      expect(result.vocabResult!.valid).toHaveLength(0);
      expect(result.vocabResult!.invalid).toHaveLength(0);

      const output = formatVocabValidationOutput(result.vocabResult!);
      expect(output).toBe('');
    });
  });
});
