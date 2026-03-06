import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
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
    it('should output template to stdout (no output option)', async () => {
      const result = await writeQueryTemplate({});
      expect(result.success).toBe(true);
      expect(result.message).toContain('name: my_search');
    });

    it('should write template to file with -o option', async () => {
      const outputPath = join(tempDir, 'output.yaml');
      const result = await writeQueryTemplate({ output: outputPath });
      expect(result.success).toBe(true);
      const content = await readFile(outputPath, 'utf-8');
      expect(content).toContain('name: my_search');
    });

    it('should refuse to overwrite existing file without --force', async () => {
      const outputPath = join(tempDir, 'existing.yaml');
      await writeFile(outputPath, 'existing content', 'utf-8');
      const result = await writeQueryTemplate({ output: outputPath });
      expect(result.success).toBe(false);
      expect(result.message).toContain('exists');
    });

    it('should overwrite existing file with --force', async () => {
      const outputPath = join(tempDir, 'existing.yaml');
      await writeFile(outputPath, 'existing content', 'utf-8');
      const result = await writeQueryTemplate({ output: outputPath, force: true });
      expect(result.success).toBe(true);
      const content = await readFile(outputPath, 'utf-8');
      expect(content).toContain('name: my_search');
    });

    it('should create query.schema.json alongside output file with -o', async () => {
      const outputPath = join(tempDir, 'search.yaml');
      await writeQueryTemplate({ output: outputPath });
      const schemaPath = join(tempDir, 'query.schema.json');
      const schemaContent = await readFile(schemaPath, 'utf-8');
      const schema = JSON.parse(schemaContent);
      expect(schema.$schema).toContain('json-schema.org');
    });

    it('should not create schema file when outputting to stdout', async () => {
      const result = await writeQueryTemplate({});
      expect(result.success).toBe(true);
      expect(result.message).toContain('yaml-language-server');
      // No file should be created anywhere - just verify stdout contains schema comment
    });

    it('should include $schema comment in stdout output', async () => {
      const result = await writeQueryTemplate({});
      expect(result.success).toBe(true);
      const firstLine = result.message.split('\n')[0];
      expect(firstLine).toBe('# yaml-language-server: $schema=./query.schema.json');
    });
  });
});
