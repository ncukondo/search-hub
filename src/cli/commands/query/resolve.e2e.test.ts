/**
 * E2E Tests for smart query file resolution.
 *
 * Tests the resolveQueryFile() utility with real filesystem operations,
 * and the full flow: query init → query validate (by name).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { setupE2EContext, type E2EContext, createRawQueryFile } from '../../e2e-helpers.js';
import { resolveQueryFile } from './resolve.js';
import { writeQueryTemplate } from './init.js';
import { validateQueryCommand } from './validate.js';

describe('smart query file resolution E2E', () => {
  let ctx: E2EContext;
  let origCwd: string;

  beforeEach(async () => {
    ctx = await setupE2EContext();
    origCwd = process.cwd();
    process.chdir(ctx.tempDir);
  });

  afterEach(async () => {
    process.chdir(origCwd);
    await ctx.cleanup();
  });

  describe('resolveQueryFile with real filesystem', () => {
    it('resolves exact path', async () => {
      const filePath = await createRawQueryFile(
        ctx.tempDir,
        'name: test\nquery:\n  - id: b1\n    field: title\n    terms:\n      keywords:\n        - test\n    operator: OR\n',
      );
      const resolved = await resolveQueryFile(filePath);
      expect(resolved).toBe(filePath);
    });

    it('resolves <name>.yaml in current directory', async () => {
      await createRawQueryFile(
        ctx.tempDir,
        'name: test\nquery:\n  - id: b1\n    field: title\n    terms:\n      keywords:\n        - test\n    operator: OR\n',
        'my-query.yaml',
      );
      const resolved = await resolveQueryFile('my-query');
      expect(resolved).toBe('my-query.yaml');
    });

    it('resolves .search-hub/queries/<name>.yaml', async () => {
      await mkdir(join(ctx.tempDir, '.search-hub', 'queries'), { recursive: true });
      await createRawQueryFile(
        join(ctx.tempDir, '.search-hub', 'queries'),
        'name: test\nquery:\n  - id: b1\n    field: title\n    terms:\n      keywords:\n        - test\n    operator: OR\n',
        'wba-pain.yaml',
      );
      const resolved = await resolveQueryFile('wba-pain');
      expect(resolved).toBe('.search-hub/queries/wba-pain.yaml');
    });

    it('resolves .search-hub/queries/<name>.yml when .yaml does not exist', async () => {
      await mkdir(join(ctx.tempDir, '.search-hub', 'queries'), { recursive: true });
      await createRawQueryFile(
        join(ctx.tempDir, '.search-hub', 'queries'),
        'name: test\nquery:\n  - id: b1\n    field: title\n    terms:\n      keywords:\n        - test\n    operator: OR\n',
        'wba-pain.yml',
      );
      const resolved = await resolveQueryFile('wba-pain');
      expect(resolved).toBe('.search-hub/queries/wba-pain.yml');
    });

    it('throws with helpful error for missing query', async () => {
      await expect(resolveQueryFile('nonexistent')).rejects.toThrow(
        'Query file not found: "nonexistent"',
      );
      await expect(resolveQueryFile('nonexistent')).rejects.toThrow('query init');
    });
  });

  describe('full flow: query init → query validate by name', () => {
    it('validates using short name after init', async () => {
      // Create query via init
      const initResult = await writeQueryTemplate({ title: 'test query', cwd: ctx.tempDir });
      expect(initResult.success).toBe(true);

      // Resolve the short name
      const resolved = await resolveQueryFile('test-query');
      expect(resolved).toBe('.search-hub/queries/test-query.yaml');

      // Validate using the resolved path
      const validateResult = await validateQueryCommand(resolved);
      expect(validateResult.success).toBe(true);
      expect(validateResult.queryName).toBe('test query');
    });

    it('validates using name with .yaml extension', async () => {
      await writeQueryTemplate({ title: 'test ext', cwd: ctx.tempDir });

      const resolved = await resolveQueryFile('test-ext.yaml');
      expect(resolved).toBe('.search-hub/queries/test-ext.yaml');

      const validateResult = await validateQueryCommand(resolved);
      expect(validateResult.success).toBe(true);
    });
  });
});
