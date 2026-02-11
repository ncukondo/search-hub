/**
 * E2E Tests for `search-hub query validate` command
 *
 * Tests query file validation functionality.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import {
  setupE2EContext,
  execCli,
  type E2EContext,
  createQueryFile,
  createRawQueryFile,
  queryFixtures,
  invalidQueryFixtures,
} from '../../e2e-helpers.js';
import {
  validateQueryCommand,
  formatValidateResult,
  formatVocabValidationOutput,
  hasVocabErrors,
  detectSchemaLink,
} from './validate.js';
import { writeQueryTemplate } from './init.js';
import { createMockMeSHClient } from '../../../query/__test-helpers__/mock-mesh-client.js';
import { getSuggestion } from '../../suggestions/rules.js';
import { formatSuggestion } from '../../suggestions/index.js';
import type { CountVocabValidator } from '../../../query/vocab-validator.js';

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

  describe('validate with controlled vocabulary (via validateQueryCommand)', () => {
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

      const result = await validateQueryCommand(queryPath, { meshClient: client });

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

      const result = await validateQueryCommand(queryPath, { meshClient: client });

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

      const result = await validateQueryCommand(queryPath, { meshClient: client });

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

      const result = await validateQueryCommand(queryPath, { meshClient: client });

      expect(result.success).toBe(false);
      expect(result.vocabResult).toBeUndefined();
    });

    it('should not include vocabResult when query has no controlled vocab terms', async () => {
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

      const result = await validateQueryCommand(queryPath, { meshClient: client });

      expect(result.success).toBe(true);
      expect(result.vocabResult).toBeUndefined();
    });

    it('should indicate vocab errors when invalid terms are found', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: exit-code-test
query:
  - field: title_abstract
    terms:
      keywords:
        - diabetes
      mesh:
        - "Diabetes Mellitus"
        - "Not A Real Term"
    operator: OR
`
      );

      const client = createMockMeSHClient(
        new Map([
          ['Diabetes Mellitus', { found: true }],
          ['Not A Real Term', { found: false }],
        ])
      );

      const result = await validateQueryCommand(queryPath, { meshClient: client });

      expect(result.success).toBe(true);
      expect(hasVocabErrors(result)).toBe(true);
    });

    it('should not indicate vocab errors when all terms are valid', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: all-valid-test
query:
  - field: title_abstract
    terms:
      keywords:
        - diabetes
      mesh:
        - "Diabetes Mellitus"
    operator: OR
`
      );

      const client = createMockMeSHClient(
        new Map([['Diabetes Mellitus', { found: true }]])
      );

      const result = await validateQueryCommand(queryPath, { meshClient: client });

      expect(result.success).toBe(true);
      expect(hasVocabErrors(result)).toBe(false);
    });
  });

  describe('suggestion integration (noVocab path)', () => {
    it('should show --dry-run suggestion after successful validation with --no-vocab', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);
      const result = await validateQueryCommand(queryPath, { noVocab: true });

      expect(result.success).toBe(true);

      // Simulate what the CLI action does
      let output = formatValidateResult(result, queryPath);
      const suggestion = formatSuggestion(getSuggestion({
        command: 'query validate',
        queryFile: queryPath,
        validationSuccess: result.success,
      }));
      if (suggestion) output += '\n' + suggestion;

      expect(output).toContain('--dry-run');
      expect(output).toContain('--preview');
      expect(output).toContain('Next:');
    });

    it('should show $EDITOR suggestion after failed validation with --no-vocab', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        invalidQueryFixtures.missingName
      );
      const result = await validateQueryCommand(queryPath, { noVocab: true });

      expect(result.success).toBe(false);

      let output = formatValidateResult(result, queryPath);
      const suggestion = formatSuggestion(getSuggestion({
        command: 'query validate',
        queryFile: queryPath,
        validationSuccess: result.success,
      }));
      if (suggestion) output += '\n' + suggestion;

      expect(output).toContain('$EDITOR');
      expect(output).toContain('Next:');
    });

    it('should not show suggestion when --quiet is used', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);
      const result = await validateQueryCommand(queryPath, { noVocab: true });

      expect(result.success).toBe(true);

      // When --quiet is set, the CLI skips all output including suggestions
      // Verify that suggestion is non-empty (so quiet suppression is meaningful)
      const suggestion = formatSuggestion(getSuggestion({
        command: 'query validate',
        queryFile: queryPath,
        validationSuccess: result.success,
      }));
      expect(suggestion.length).toBeGreaterThan(0);

      // The quiet path should produce no output at all - this is gated by
      // !globalOpts.quiet in the CLI action
    });
  });

  describe('suggestion integration (vocab path)', () => {
    it('should show suggestion after successful vocab validation', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: mesh-suggestion-test
query:
  - field: title_abstract
    terms:
      keywords:
        - diabetes
      mesh:
        - "Diabetes Mellitus"
    operator: OR
`
      );

      const client = createMockMeSHClient(
        new Map([['Diabetes Mellitus', { found: true }]])
      );

      const result = await validateQueryCommand(queryPath, { meshClient: client });

      expect(result.success).toBe(true);
      expect(hasVocabErrors(result)).toBe(false);

      let output = formatValidateResult(result, queryPath);
      if (result.vocabResult) {
        output += formatVocabValidationOutput(result.vocabResult);
      }
      const suggestion = formatSuggestion(getSuggestion({
        command: 'query validate',
        queryFile: queryPath,
        validationSuccess: result.success && !hasVocabErrors(result),
      }));
      if (suggestion) output += '\n' + suggestion;

      expect(output).toContain('--dry-run');
      expect(output).toContain('Next:');
    });

    it('should show $EDITOR suggestion when vocab has errors', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: vocab-error-suggestion-test
query:
  - field: title_abstract
    terms:
      keywords:
        - diabetes
      mesh:
        - "Not A Real Term"
    operator: OR
`
      );

      const client = createMockMeSHClient(
        new Map([['Not A Real Term', { found: false }]])
      );

      const result = await validateQueryCommand(queryPath, { meshClient: client });

      expect(result.success).toBe(true);
      expect(hasVocabErrors(result)).toBe(true);

      let output = formatValidateResult(result, queryPath);
      if (result.vocabResult) {
        output += formatVocabValidationOutput(result.vocabResult);
      }
      const suggestion = formatSuggestion(getSuggestion({
        command: 'query validate',
        queryFile: queryPath,
        validationSuccess: result.success && !hasVocabErrors(result),
      }));
      if (suggestion) output += '\n' + suggestion;

      expect(output).toContain('$EDITOR');
      expect(output).toContain('Next:');
    });
  });

  describe('validate - mesh-only query (no keywords)', () => {
    it('should validate mesh-only query file', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: mesh-only-test
query:
  - field: title_abstract
    terms:
      mesh:
        - "Artificial Intelligence"
    operator: OR
`
      );

      const result = await validateQueryCommand(queryPath);

      expect(result.success).toBe(true);
      expect(result.queryName).toBe('mesh-only-test');
      expect(result.blockCount).toBe(1);
    });

    it('should validate eric-only query file', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: eric-only-test
query:
  - field: title_abstract
    terms:
      eric:
        - "Medical Education"
    operator: OR
`
      );

      const result = await validateQueryCommand(queryPath);

      expect(result.success).toBe(true);
      expect(result.queryName).toBe('eric-only-test');
      expect(result.blockCount).toBe(1);
    });

    it('should reject block with no term types', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: empty-terms-test
query:
  - field: title_abstract
    terms:
      exclude:
        - "animal"
    operator: OR
`
      );

      const result = await validateQueryCommand(queryPath);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      const errorText = result.errors!.join(' ');
      expect(errorText).toContain('At least one of keywords, mesh, emtree, or eric is required');
    });

    it('should validate mixed keywords and mesh-only blocks', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: mixed-test
query:
  - field: title_abstract
    terms:
      mesh:
        - "Artificial Intelligence"
    operator: OR
  - field: title_abstract
    terms:
      keywords:
        - diabetes
        - T2DM
    operator: OR
`
      );

      const result = await validateQueryCommand(queryPath);

      expect(result.success).toBe(true);
      expect(result.queryName).toBe('mixed-test');
      expect(result.blockCount).toBe(2);
    });
  });

  describe('default vocab validation (auto-check)', () => {
    it('should auto-validate MeSH terms via validateQueryCommand with meshClient', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: auto-vocab-test
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

      const result = await validateQueryCommand(queryPath, { meshClient: client });

      expect(result.success).toBe(true);
      expect(result.vocabResult).toBeDefined();
      expect(result.vocabResult!.valid).toHaveLength(2);
      expect(result.vocabResult!.invalid).toHaveLength(0);
    });

    it('should suggest correct term for suffix typo via truncated startsWith', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: suffix-typo-test
query:
  - field: title_abstract
    terms:
      keywords:
        - AI
      mesh:
        - "Artificial Intelligencee"
    operator: OR
`
      );

      const client = createMockMeSHClient(
        new Map([
          [
            'Artificial Intelligencee',
            {
              found: false,
              suggestions: ['Artificial Intelligence'],
            },
          ],
        ])
      );

      const result = await validateQueryCommand(queryPath, { meshClient: client });

      expect(result.success).toBe(true);
      expect(result.vocabResult).toBeDefined();
      expect(result.vocabResult!.invalid).toHaveLength(1);
      expect(result.vocabResult!.invalid[0]!.suggestions).toContain(
        'Artificial Intelligence'
      );

      const output = formatVocabValidationOutput(result.vocabResult!);
      expect(output).toContain('✗ mesh: "Artificial Intelligencee"');
      expect(output).toContain('Did you mean: "Artificial Intelligence"');
    });

    it('should skip vocab validation with --no-vocab', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: no-vocab-test
query:
  - field: title_abstract
    terms:
      keywords:
        - diabetes
      mesh:
        - "Diabetes Mellitus"
    operator: OR
`
      );

      const client = createMockMeSHClient(
        new Map([['Diabetes Mellitus', { found: true }]])
      );

      const result = await validateQueryCommand(queryPath, {
        meshClient: client,
        noVocab: true,
      });

      expect(result.success).toBe(true);
      expect(result.vocabResult).toBeUndefined();
    });

    it('should not auto-validate when query has no controlled vocab terms', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: keywords-only-test
query:
  - field: title_abstract
    terms:
      keywords:
        - diabetes
        - insulin
    operator: OR
`
      );

      const client = createMockMeSHClient(new Map());

      const result = await validateQueryCommand(queryPath, { meshClient: client });

      expect(result.success).toBe(true);
      expect(result.vocabResult).toBeUndefined();
    });

    it('should gracefully handle API errors during auto-validation', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: api-error-test
query:
  - field: title_abstract
    terms:
      keywords:
        - diabetes
      mesh:
        - "Diabetes Mellitus"
    operator: OR
`
      );

      const client = {
        lookupTerm: async () => { throw new Error('Network timeout'); },
        lookupTerms: async () => [],
      } as unknown as import('../../../query/mesh-lookup.js').MeSHLookupClient;

      const result = await validateQueryCommand(queryPath, { meshClient: client });

      expect(result.success).toBe(true);
      expect(result.vocabResult).toBeDefined();
      expect(result.vocabResult!.errors).toHaveLength(1);
      expect(result.vocabResult!.errors[0]!.error).toContain('Network timeout');
    });
  });

  describe('CLI stdout suggestion integration', () => {
    it('should include Next: suggestion in CLI stdout for valid query with --no-vocab', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);

      const result = await execCli(
        ['query', 'validate', queryPath, '--no-vocab', '--config', ctx.configPath],
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Next:');
      expect(result.stdout).toContain('--dry-run');
    });

    it('should include Next: suggestion in CLI stdout for invalid query with --no-vocab', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        invalidQueryFixtures.missingName
      );

      const result = await execCli(
        ['query', 'validate', queryPath, '--no-vocab', '--config', ctx.configPath],
      );

      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toContain('Next:');
      expect(result.stdout).toContain('$EDITOR');
    });

    it('should suppress suggestion in CLI stdout with --quiet', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);

      const result = await execCli(
        ['query', 'validate', queryPath, '--no-vocab', '--quiet', '--config', ctx.configPath],
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toContain('Next:');
    });
  });

  describe('$schema link detection', () => {
    it('should detect $schema in query init output', async () => {
      const outputPath = join(ctx.tempDir, 'init-schema.yaml');
      await writeQueryTemplate({ output: outputPath });

      const hasSchema = await detectSchemaLink(outputPath);
      expect(hasSchema).toBe(true);
    });

    it('should not detect $schema in hand-written files', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: handwritten
query:
  - field: title_abstract
    terms:
      keywords:
        - test
    operator: OR
`
      );

      const hasSchema = await detectSchemaLink(queryPath);
      expect(hasSchema).toBe(false);
    });

    it('should not show query init guidance for file with $schema', async () => {
      const outputPath = join(ctx.tempDir, 'with-schema.yaml');
      await writeQueryTemplate({ output: outputPath });

      const result = await validateQueryCommand(outputPath);
      expect(result.success).toBe(true);

      const hasSchema = await detectSchemaLink(outputPath);
      const suggestion = formatSuggestion(getSuggestion({
        command: 'query validate',
        queryFile: outputPath,
        validationSuccess: result.success,
        hasSchemaLink: hasSchema,
      }));

      // Should NOT contain query init since schema is present
      expect(suggestion).not.toContain('query init');
    });

    it('should show query init guidance for hand-written file without $schema', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: no-schema
query:
  - field: title_abstract
    terms:
      keywords:
        - test
    operator: OR
`
      );

      const result = await validateQueryCommand(queryPath);
      expect(result.success).toBe(true);

      const hasSchema = await detectSchemaLink(queryPath);
      const suggestion = formatSuggestion(getSuggestion({
        command: 'query validate',
        queryFile: queryPath,
        validationSuccess: result.success,
        hasSchemaLink: hasSchema,
      }));

      // Should contain query init recommendation
      expect(suggestion).toContain('query init');
    });

    it('should show query init in CLI stdout for file without $schema', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: cli-schema-test
query:
  - field: title_abstract
    terms:
      keywords:
        - test
    operator: OR
`
      );

      const result = await execCli(
        ['query', 'validate', queryPath, '--no-vocab', '--config', ctx.configPath],
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('query init');
    });

    it('should not show query init in CLI stdout for file with $schema', async () => {
      const outputPath = join(ctx.tempDir, 'cli-with-schema.yaml');
      await writeQueryTemplate({ output: outputPath });

      const result = await execCli(
        ['query', 'validate', outputPath, '--no-vocab', '--config', ctx.configPath],
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toContain('query init');
    });
  });

  describe('ERIC/Emtree count-only validation E2E', () => {
    it('should validate ERIC descriptors via count-only search', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: eric-count-test
query:
  - field: title_abstract
    terms:
      keywords:
        - education
      eric:
        - "Medical Education"
        - "Medcial Education"
    operator: OR
`
      );

      const meshClient = createMockMeSHClient(new Map());
      const ericValidator: CountVocabValidator = {
        vocabulary: 'eric',
        countTerm: vi.fn(async (term: string) => {
          return term === 'Medical Education' ? 42 : 0;
        }),
      };

      const result = await validateQueryCommand(queryPath, {
        meshClient,
        countValidators: [ericValidator],
      });

      expect(result.success).toBe(true);
      expect(result.vocabResult).toBeDefined();
      expect(result.vocabResult!.valid).toHaveLength(1);
      expect(result.vocabResult!.valid[0]!.term).toBe('Medical Education');
      expect(result.vocabResult!.valid[0]!.vocabulary).toBe('eric');
      expect(result.vocabResult!.invalid).toHaveLength(1);
      expect(result.vocabResult!.invalid[0]!.term).toBe('Medcial Education');
      expect(result.vocabResult!.invalid[0]!.vocabulary).toBe('eric');
    });

    it('should validate Emtree terms via count-only search', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: emtree-count-test
query:
  - field: title_abstract
    terms:
      keywords:
        - diabetes
      emtree:
        - "diabetes mellitus"
        - "diabetis mellitus"
    operator: OR
`
      );

      const meshClient = createMockMeSHClient(new Map());
      const emtreeValidator: CountVocabValidator = {
        vocabulary: 'emtree',
        countTerm: vi.fn(async (term: string) => {
          return term === 'diabetes mellitus' ? 100 : 0;
        }),
      };

      const result = await validateQueryCommand(queryPath, {
        meshClient,
        countValidators: [emtreeValidator],
      });

      expect(result.success).toBe(true);
      expect(result.vocabResult).toBeDefined();
      expect(result.vocabResult!.valid).toHaveLength(1);
      expect(result.vocabResult!.invalid).toHaveLength(1);
    });

    it('should format ERIC/Emtree validation output correctly', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: format-eric-test
query:
  - field: title_abstract
    terms:
      eric:
        - "Medical Education"
        - "Medcial Education"
    operator: OR
`
      );

      const meshClient = createMockMeSHClient(new Map());
      const ericValidator: CountVocabValidator = {
        vocabulary: 'eric',
        countTerm: vi.fn(async (term: string) => {
          return term === 'Medical Education' ? 42 : 0;
        }),
      };

      const result = await validateQueryCommand(queryPath, {
        meshClient,
        countValidators: [ericValidator],
      });

      expect(result.vocabResult).toBeDefined();
      const output = formatVocabValidationOutput(result.vocabResult!);

      expect(output).toContain('Controlled vocabulary:');
      expect(output).toContain('✓ eric: "Medical Education"');
      expect(output).toContain('✗ eric: "Medcial Education" — not found');
    });

    it('should validate mixed vocabularies in a single query', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: mixed-vocab-test
query:
  - field: title_abstract
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
`
      );

      const meshClient = createMockMeSHClient(
        new Map([['Diabetes Mellitus', { found: true }]])
      );
      const ericValidator: CountVocabValidator = {
        vocabulary: 'eric',
        countTerm: vi.fn(async () => 50),
      };
      const emtreeValidator: CountVocabValidator = {
        vocabulary: 'emtree',
        countTerm: vi.fn(async () => 100),
      };

      const result = await validateQueryCommand(queryPath, {
        meshClient,
        countValidators: [ericValidator, emtreeValidator],
      });

      expect(result.success).toBe(true);
      expect(result.vocabResult).toBeDefined();
      expect(result.vocabResult!.valid).toHaveLength(3);

      const output = formatVocabValidationOutput(result.vocabResult!);
      expect(output).toContain('✓ mesh: "Diabetes Mellitus"');
      expect(output).toContain('✓ eric: "Medical Education"');
      expect(output).toContain('✓ emtree: "diabetes mellitus"');
    });

    it('should skip ERIC/Emtree when --no-vocab is set', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: no-vocab-count-test
query:
  - field: title_abstract
    terms:
      eric:
        - "Medical Education"
    operator: OR
`
      );

      const result = await validateQueryCommand(queryPath, { noVocab: true });

      expect(result.success).toBe(true);
      expect(result.vocabResult).toBeUndefined();
    });

    it('should gracefully handle count API errors', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: error-count-test
query:
  - field: title_abstract
    terms:
      eric:
        - "Valid Term"
        - "Error Term"
    operator: OR
`
      );

      const meshClient = createMockMeSHClient(new Map());
      const ericValidator: CountVocabValidator = {
        vocabulary: 'eric',
        countTerm: vi.fn(async (term: string) => {
          if (term === 'Error Term') throw new Error('ERIC API timeout');
          return 10;
        }),
      };

      const result = await validateQueryCommand(queryPath, {
        meshClient,
        countValidators: [ericValidator],
      });

      expect(result.success).toBe(true);
      expect(result.vocabResult).toBeDefined();
      expect(result.vocabResult!.valid).toHaveLength(1);
      expect(result.vocabResult!.errors).toHaveLength(1);
      expect(result.vocabResult!.errors[0]!.error).toContain('ERIC API timeout');

      const output = formatVocabValidationOutput(result.vocabResult!);
      expect(output).toContain('⚠ eric: "Error Term" — ERIC API timeout');
    });
  });
});
