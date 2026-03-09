import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateQueryTemplate, writeQueryTemplate, sanitizeForFilename } from './init.js';
import { parseQueryString } from '../../../query/parser.js';

describe('query init', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'search-hub-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('sanitizeForFilename', () => {
    it('should convert spaces to hyphens and lowercase', () => {
      expect(sanitizeForFilename('WBA pain mechanisms')).toBe('wba-pain-mechanisms');
    });

    it('should handle simple title', () => {
      expect(sanitizeForFilename('My Search')).toBe('my-search');
    });

    it('should preserve underscores', () => {
      expect(sanitizeForFilename('test_query')).toBe('test_query');
    });

    it('should remove non-ASCII characters', () => {
      expect(sanitizeForFilename('日本語 test')).toBe('test');
    });

    it('should trim surrounding spaces', () => {
      expect(sanitizeForFilename('  spaces  ')).toBe('spaces');
    });

    it('should throw on empty result', () => {
      expect(() => sanitizeForFilename('')).toThrow();
      expect(() => sanitizeForFilename('   ')).toThrow();
      expect(() => sanitizeForFilename('日本語')).toThrow();
    });
  });

  describe('generateQueryTemplate', () => {
    it('should generate valid YAML', () => {
      const template = generateQueryTemplate();
      expect(template).toBeDefined();
      expect(template.length).toBeGreaterThan(0);
    });

    it('should generate YAML that passes query validate', () => {
      const template = generateQueryTemplate();
      const ast = parseQueryString(template);
      expect(ast).toBeDefined();
      expect(ast.name).toBe('my_search');
    });

    it('should set name field from title parameter', () => {
      const template = generateQueryTemplate('WBA pain');
      const ast = parseQueryString(template);
      expect(ast.name).toBe('WBA pain');
    });

    it('should produce valid YAML when title contains a colon', () => {
      const template = generateQueryTemplate('pain: mechanisms');
      const ast = parseQueryString(template);
      expect(ast.name).toBe('pain: mechanisms');
    });

    it('should produce valid YAML when title contains a hash', () => {
      const template = generateQueryTemplate('test #1');
      const ast = parseQueryString(template);
      expect(ast.name).toBe('test #1');
    });

    it('should default name to my_search when title is not provided', () => {
      const template = generateQueryTemplate();
      const ast = parseQueryString(template);
      expect(ast.name).toBe('my_search');
    });

    it('should include commented exclude example', () => {
      const template = generateQueryTemplate();
      expect(template).toContain('# exclude:');
      expect(template).toContain('# Terms to exclude (NOT operator)');
    });

    it('should include explicit exclude: [] in template', () => {
      const template = generateQueryTemplate();
      expect(template).toContain('exclude: []');
    });

    it('should include exclude usage tips in comments', () => {
      const template = generateQueryTemplate();
      expect(template).toContain('Tip:');
      expect(template).toContain('acronym');
    });

    it('should have $schema comment as first line', () => {
      const template = generateQueryTemplate();
      const firstLine = template.split('\n')[0];
      expect(firstLine).toBe('# yaml-language-server: $schema=./query.schema.json');
    });
  });

  describe('writeQueryTemplate', () => {
    it('should write to .search-hub/queries/<sanitized-title>.yaml by default', async () => {
      const result = await writeQueryTemplate({ title: 'WBA pain', cwd: tempDir });
      expect(result.success).toBe(true);
      const content = await readFile(join(tempDir, '.search-hub', 'queries', 'wba-pain.yaml'), 'utf-8');
      expect(content).toContain('name: "WBA pain"');
    });

    it('should auto-create .search-hub/queries/ directory', async () => {
      await writeQueryTemplate({ title: 'test search', cwd: tempDir });
      const stats = await stat(join(tempDir, '.search-hub', 'queries'));
      expect(stats.isDirectory()).toBe(true);
    });

    it('should create query.schema.json in .search-hub/queries/', async () => {
      await writeQueryTemplate({ title: 'test search', cwd: tempDir });
      const schemaPath = join(tempDir, '.search-hub', 'queries', 'query.schema.json');
      const schemaContent = await readFile(schemaPath, 'utf-8');
      const schema = JSON.parse(schemaContent);
      expect(schema.$schema).toContain('json-schema.org');
    });

    it('should refuse to overwrite existing file without --force', async () => {
      await mkdir(join(tempDir, '.search-hub', 'queries'), { recursive: true });
      await writeFile(join(tempDir, '.search-hub', 'queries', 'test.yaml'), 'existing', 'utf-8');
      const result = await writeQueryTemplate({ title: 'test', cwd: tempDir });
      expect(result.success).toBe(false);
      expect(result.message).toContain('exists');
    });

    it('should overwrite existing file with --force', async () => {
      await mkdir(join(tempDir, '.search-hub', 'queries'), { recursive: true });
      await writeFile(join(tempDir, '.search-hub', 'queries', 'test.yaml'), 'existing', 'utf-8');
      const result = await writeQueryTemplate({ title: 'test', cwd: tempDir, force: true });
      expect(result.success).toBe(true);
      const content = await readFile(join(tempDir, '.search-hub', 'queries', 'test.yaml'), 'utf-8');
      expect(content).toContain('name: "test"');
    });

    it('should use -o path when provided', async () => {
      const outputPath = join(tempDir, 'custom.yaml');
      const result = await writeQueryTemplate({ title: 'my search', output: outputPath });
      expect(result.success).toBe(true);
      const content = await readFile(outputPath, 'utf-8');
      expect(content).toContain('name: "my search"');
    });

    it('should output to stdout with --stdout', async () => {
      const result = await writeQueryTemplate({ title: 'my search', stdout: true });
      expect(result.success).toBe(true);
      expect(result.message).toContain('name: "my search"');
    });

    it('should not create files when --stdout is used', async () => {
      await writeQueryTemplate({ title: 'my search', stdout: true, cwd: tempDir });
      // .search-hub/queries/ directory should NOT be created
      await expect(stat(join(tempDir, '.search-hub', 'queries'))).rejects.toThrow();
    });

    it('should include $schema comment in stdout output', async () => {
      const result = await writeQueryTemplate({ title: 'test', stdout: true });
      expect(result.success).toBe(true);
      const firstLine = result.message.split('\n')[0];
      expect(firstLine).toBe('# yaml-language-server: $schema=./query.schema.json');
    });

    it('should create query.schema.json alongside -o output file', async () => {
      const outputPath = join(tempDir, 'search.yaml');
      await writeQueryTemplate({ title: 'search', output: outputPath });
      const schemaPath = join(tempDir, 'query.schema.json');
      const schemaContent = await readFile(schemaPath, 'utf-8');
      const schema = JSON.parse(schemaContent);
      expect(schema.$schema).toContain('json-schema.org');
    });
  });
});
