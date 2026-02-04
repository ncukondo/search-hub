/**
 * E2E Tests for `search-hub query init` command
 *
 * Tests query template generation functionality.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import {
  setupE2EContext,
  type E2EContext,
  createRawQueryFile,
} from '../../e2e-helpers.js';
import { generateQueryTemplate, writeQueryTemplate } from './init.js';
import { parseQueryString } from '../../../query/parser.js';
import { validateQueryCommand } from './validate.js';

describe('search-hub query init E2E', () => {
  let ctx: E2EContext;

  beforeEach(async () => {
    ctx = await setupE2EContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  describe('generateQueryTemplate produces valid YAML', () => {
    it('should produce YAML that passes parseQueryString', () => {
      const template = generateQueryTemplate();
      const ast = parseQueryString(template);
      expect(ast).toBeDefined();
      expect(ast.name).toBe('my_search');
      expect(ast.blocks.length).toBeGreaterThanOrEqual(1);
    });

    it('should contain expected fields', () => {
      const template = generateQueryTemplate();
      expect(template).toContain('name: my_search');
      expect(template).toContain('field: title_abstract');
      expect(template).toContain('operator: OR');
      expect(template).toContain('keywords:');
    });

    it('should contain helpful comments', () => {
      const template = generateQueryTemplate();
      expect(template).toContain('# filters:');
      expect(template).toContain('# overrides:');
      expect(template).toContain('# mesh:');
    });

    it('should include explicit exclude: [] for visibility', () => {
      const template = generateQueryTemplate();
      expect(template).toContain('exclude: []');
      expect(template).toContain('Tip:');
      expect(template).toContain('acronym');
    });
  });

  describe('writeQueryTemplate creates a file', () => {
    it('should write template to specified output path', async () => {
      const outputPath = join(ctx.tempDir, 'template.yaml');
      const result = await writeQueryTemplate({ output: outputPath });
      expect(result.success).toBe(true);
      const content = await readFile(outputPath, 'utf-8');
      expect(content).toContain('name: my_search');
    });

    it('should produce a file that passes validateQueryCommand', async () => {
      const outputPath = join(ctx.tempDir, 'validate-test.yaml');
      await writeQueryTemplate({ output: outputPath });
      const result = await validateQueryCommand(outputPath);
      expect(result.success).toBe(true);
      expect(result.queryName).toBe('my_search');
      expect(result.blockCount).toBe(1);
    });

    it('should not overwrite without --force', async () => {
      const outputPath = await createRawQueryFile(ctx.tempDir, 'existing', 'existing.yaml');
      const result = await writeQueryTemplate({ output: outputPath });
      expect(result.success).toBe(false);
      expect(result.message).toContain('exists');
      // Verify original content is unchanged
      const content = await readFile(outputPath, 'utf-8');
      expect(content).toBe('existing');
    });

    it('should overwrite with --force', async () => {
      const outputPath = await createRawQueryFile(ctx.tempDir, 'existing', 'force-test.yaml');
      const result = await writeQueryTemplate({ output: outputPath, force: true });
      expect(result.success).toBe(true);
      const content = await readFile(outputPath, 'utf-8');
      expect(content).toContain('name: my_search');
    });
  });

  describe('generated template validates with validateQueryCommand', () => {
    it('should validate the generated template end-to-end', async () => {
      // Generate template, write to file, validate
      const template = generateQueryTemplate();
      const queryPath = await createRawQueryFile(ctx.tempDir, template, 'generated.yaml');
      const result = await validateQueryCommand(queryPath);
      expect(result.success).toBe(true);
      expect(result.queryName).toBe('my_search');
      expect(result.blockCount).toBe(1);
    });
  });
});
