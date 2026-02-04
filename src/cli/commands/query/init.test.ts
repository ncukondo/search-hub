import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateQueryTemplate, writeQueryTemplate } from './init.js';
import { parseQueryString } from '../../../query/parser.js';

describe('query init', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'search-hub-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
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

    it('should include commented exclude example', () => {
      const template = generateQueryTemplate();
      expect(template).toContain('# exclude:');
      expect(template).toContain('# Terms to exclude (NOT operator)');
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
  });
});
