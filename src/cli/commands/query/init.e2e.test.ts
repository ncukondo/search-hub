/**
 * E2E Tests for `search-hub query init` command
 *
 * Tests query template generation functionality.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { readFile, access, stat } from 'node:fs/promises';
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
      expect(template).toContain('# providers:');
      expect(template).toContain('# mesh:');
    });

    it('should include explicit exclude: [] for visibility', () => {
      const template = generateQueryTemplate();
      expect(template).toContain('exclude: []');
      expect(template).toContain('Tip:');
      expect(template).toContain('acronym');
    });
  });

  describe('query init "<title>" creates file in queries/', () => {
    it('should create queries/test-search.yaml', async () => {
      const result = await writeQueryTemplate({ title: 'test search', cwd: ctx.tempDir });
      expect(result.success).toBe(true);
      const outputPath = join(ctx.tempDir, 'queries', 'test-search.yaml');
      const content = await readFile(outputPath, 'utf-8');
      expect(content).toContain('name: "test search"');
    });

    it('should set YAML name field to title', async () => {
      await writeQueryTemplate({ title: 'test search', cwd: ctx.tempDir });
      const outputPath = join(ctx.tempDir, 'queries', 'test-search.yaml');
      const content = await readFile(outputPath, 'utf-8');
      const ast = parseQueryString(content);
      expect(ast.name).toBe('test search');
    });

    it('should create query.schema.json in queries/', async () => {
      await writeQueryTemplate({ title: 'test search', cwd: ctx.tempDir });
      const schemaPath = join(ctx.tempDir, 'queries', 'query.schema.json');
      await expect(access(schemaPath)).resolves.toBeUndefined();
      const schemaContent = await readFile(schemaPath, 'utf-8');
      const schema = JSON.parse(schemaContent);
      expect(schema.$schema).toContain('json-schema.org');
    });

    it('should produce a file that passes validateQueryCommand', async () => {
      await writeQueryTemplate({ title: 'test search', cwd: ctx.tempDir });
      const outputPath = join(ctx.tempDir, 'queries', 'test-search.yaml');
      const result = await validateQueryCommand(outputPath);
      expect(result.success).toBe(true);
      expect(result.queryName).toBe('test search');
      expect(result.blockCount).toBe(1);
    });
  });

  describe('--stdout outputs to stdout without file creation', () => {
    it('should return template content in message', async () => {
      const result = await writeQueryTemplate({ title: 'WBA pain', stdout: true });
      expect(result.success).toBe(true);
      expect(result.message).toContain('name: "WBA pain"');
    });

    it('should not create any files', async () => {
      await writeQueryTemplate({ title: 'WBA pain', stdout: true, cwd: ctx.tempDir });
      await expect(stat(join(ctx.tempDir, 'queries'))).rejects.toThrow();
    });
  });

  describe('-o custom path', () => {
    it('should write to the specified path', async () => {
      const outputPath = join(ctx.tempDir, 'custom.yaml');
      const result = await writeQueryTemplate({ title: 'my search', output: outputPath });
      expect(result.success).toBe(true);
      const content = await readFile(outputPath, 'utf-8');
      expect(content).toContain('name: "my search"');
    });

    it('should create query.schema.json alongside custom path', async () => {
      const outputPath = join(ctx.tempDir, 'custom.yaml');
      await writeQueryTemplate({ title: 'my search', output: outputPath });
      const schemaPath = join(ctx.tempDir, 'query.schema.json');
      const schemaContent = await readFile(schemaPath, 'utf-8');
      const schema = JSON.parse(schemaContent);
      expect(schema.$schema).toContain('json-schema.org');
    });
  });

  describe('overwrite protection and --force', () => {
    it('should refuse to overwrite existing file', async () => {
      await writeQueryTemplate({ title: 'test', cwd: ctx.tempDir });
      const result = await writeQueryTemplate({ title: 'test', cwd: ctx.tempDir });
      expect(result.success).toBe(false);
      expect(result.message).toContain('exists');
    });

    it('should overwrite with --force', async () => {
      await writeQueryTemplate({ title: 'test', cwd: ctx.tempDir });
      const result = await writeQueryTemplate({ title: 'test', cwd: ctx.tempDir, force: true });
      expect(result.success).toBe(true);
    });
  });

  describe('$schema support', () => {
    it('should have $schema comment as first line of generated template', () => {
      const template = generateQueryTemplate();
      const firstLine = template.split('\n')[0];
      expect(firstLine).toBe('# yaml-language-server: $schema=./query.schema.json');
    });

    it('should generate template that passes validateQueryCommand with $schema comment', async () => {
      await writeQueryTemplate({ title: 'test', cwd: ctx.tempDir });
      const outputPath = join(ctx.tempDir, 'queries', 'test.yaml');
      const result = await validateQueryCommand(outputPath);
      expect(result.success).toBe(true);
      expect(result.queryName).toBe('test');
    });
  });
});
