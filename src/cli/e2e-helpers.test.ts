/**
 * E2E Helpers Unit Tests
 *
 * Tests for the E2E test helper utilities.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import YAML from 'yaml';
import {
  createTempDir,
  setupE2EContext,
  createQueryFile,
  createRawQueryFile,
  createConfig,
  createRawConfig,
  createSimpleQuery,
  queryFixtures,
  invalidQueryFixtures,
} from './e2e-helpers.js';

describe('E2E Helpers', () => {
  let cleanupFns: Array<() => Promise<void>> = [];

  afterEach(async () => {
    for (const cleanup of cleanupFns) {
      await cleanup();
    }
    cleanupFns = [];
  });

  describe('createTempDir', () => {
    it('should create a unique temp directory', async () => {
      const dir1 = await createTempDir();
      const dir2 = await createTempDir();
      cleanupFns.push(
        async () => {
          const { rm } = await import('node:fs/promises');
          await rm(dir1, { recursive: true, force: true });
        },
        async () => {
          const { rm } = await import('node:fs/promises');
          await rm(dir2, { recursive: true, force: true });
        }
      );

      expect(dir1).toContain('search-hub-e2e-');
      expect(dir2).toContain('search-hub-e2e-');
      expect(dir1).not.toBe(dir2);

      // Verify directories exist
      const stats1 = await stat(dir1);
      const stats2 = await stat(dir2);
      expect(stats1.isDirectory()).toBe(true);
      expect(stats2.isDirectory()).toBe(true);
    });
  });

  describe('setupE2EContext', () => {
    it('should create context with temp dirs and config', async () => {
      const ctx = await setupE2EContext();
      cleanupFns.push(ctx.cleanup);

      // Verify structure
      expect(ctx.tempDir).toContain('search-hub-e2e-');
      expect(ctx.sessionsDir).toBe(join(ctx.tempDir, 'sessions'));
      expect(ctx.configPath).toBe(join(ctx.tempDir, 'config.toml'));

      // Verify directories exist
      const tempStats = await stat(ctx.tempDir);
      const sessionsStats = await stat(ctx.sessionsDir);
      expect(tempStats.isDirectory()).toBe(true);
      expect(sessionsStats.isDirectory()).toBe(true);

      // Verify config file exists and is valid
      const configContent = await readFile(ctx.configPath, 'utf-8');
      expect(configContent).toContain('[session]');
      expect(configContent).toContain(ctx.sessionsDir);
    });

    it('cleanup should remove all artifacts', async () => {
      const ctx = await setupE2EContext();
      const tempDir = ctx.tempDir;

      await ctx.cleanup();

      // Verify directory no longer exists
      await expect(stat(tempDir)).rejects.toThrow();
    });
  });

  describe('createQueryFile', () => {
    it('should create valid YAML query file', async () => {
      const ctx = await setupE2EContext();
      cleanupFns.push(ctx.cleanup);

      const query = createSimpleQuery('test-query');
      const filePath = await createQueryFile(ctx.tempDir, query);

      expect(filePath).toBe(join(ctx.tempDir, 'query.yaml'));

      const content = await readFile(filePath, 'utf-8');
      const parsed = YAML.parse(content);

      expect(parsed.name).toBe('test-query');
      expect(parsed.query).toHaveLength(1);
      expect(parsed.query[0].field).toBe('title_abstract');
      expect(parsed.query[0].terms.keywords).toContain('diabetes');
      expect(parsed.filters.year_from).toBe(2024);
    });

    it('should use custom filename', async () => {
      const ctx = await setupE2EContext();
      cleanupFns.push(ctx.cleanup);

      const query = createSimpleQuery();
      const filePath = await createQueryFile(
        ctx.tempDir,
        query,
        'custom-query.yaml'
      );

      expect(filePath).toBe(join(ctx.tempDir, 'custom-query.yaml'));
      const stats = await stat(filePath);
      expect(stats.isFile()).toBe(true);
    });

    it('should handle multi-block queries', async () => {
      const ctx = await setupE2EContext();
      cleanupFns.push(ctx.cleanup);

      const filePath = await createQueryFile(ctx.tempDir, queryFixtures.multiBlock);
      const content = await readFile(filePath, 'utf-8');
      const parsed = YAML.parse(content);

      expect(parsed.query).toHaveLength(2);
      expect(parsed.filters.year_from).toBe(2020);
      expect(parsed.filters.year_to).toBe(2024);
      expect(parsed.filters.languages).toContain('en');
    });

    it('should handle queries with MeSH terms', async () => {
      const ctx = await setupE2EContext();
      cleanupFns.push(ctx.cleanup);

      const filePath = await createQueryFile(ctx.tempDir, queryFixtures.withMesh);
      const content = await readFile(filePath, 'utf-8');
      const parsed = YAML.parse(content);

      expect(parsed.query[0].terms.mesh).toContain('Diabetes Mellitus, Type 2');
    });
  });

  describe('createRawQueryFile', () => {
    it('should create file with raw content', async () => {
      const ctx = await setupE2EContext();
      cleanupFns.push(ctx.cleanup);

      const rawContent = invalidQueryFixtures.missingName;
      const filePath = await createRawQueryFile(ctx.tempDir, rawContent);

      const content = await readFile(filePath, 'utf-8');
      expect(content).toBe(rawContent);
    });
  });

  describe('createConfig', () => {
    it('should create valid TOML config file', async () => {
      const ctx = await setupE2EContext();
      cleanupFns.push(ctx.cleanup);

      const configPath = await createConfig(ctx.tempDir, {
        session: { directory: '/test/sessions' },
        providers: {
          pubmed: { enabled: true, api_key: 'test-key', rate_limit: 5 },
          eric: { enabled: false },
          arxiv: { enabled: true },
          scopus: { enabled: false },
          wos: { enabled: false },
          embase: { enabled: false },
        },
      });

      const content = await readFile(configPath, 'utf-8');
      expect(content).toContain('[session]');
      expect(content).toContain('directory = "/test/sessions"');
      expect(content).toContain('[providers.pubmed]');
      expect(content).toContain('enabled = true');
      expect(content).toContain('api_key = "test-key"');
      expect(content).toContain('rate_limit = 5');
    });

    it('should handle partial config', async () => {
      const ctx = await setupE2EContext();
      cleanupFns.push(ctx.cleanup);

      const configPath = await createConfig(ctx.tempDir, {
        log: { level: 'debug' },
      });

      const content = await readFile(configPath, 'utf-8');
      expect(content).toContain('[log]');
      expect(content).toContain('level = "debug"');
    });
  });

  describe('createRawConfig', () => {
    it('should create file with raw content', async () => {
      const ctx = await setupE2EContext();
      cleanupFns.push(ctx.cleanup);

      const rawContent = `
[session]
directory = "/custom/path"

[invalid_section]
unknown_key = "value"
`;
      const configPath = await createRawConfig(ctx.tempDir, rawContent);

      const content = await readFile(configPath, 'utf-8');
      expect(content).toBe(rawContent);
    });
  });

  describe('queryFixtures', () => {
    it('should provide valid simple query', () => {
      const query = queryFixtures.simple;
      expect(query.name).toBe('simple-test');
      expect(query.blocks).toHaveLength(1);
    });

    it('should provide valid multiBlock query', () => {
      const query = queryFixtures.multiBlock;
      expect(query.blocks).toHaveLength(2);
      expect(query.filters.yearFrom).toBe(2020);
    });

    it('should provide valid withMesh query', () => {
      const query = queryFixtures.withMesh;
      const firstBlock = query.blocks[0];
      expect(firstBlock).toBeDefined();
      expect(firstBlock?.terms.mesh).toBeDefined();
    });
  });

  describe('invalidQueryFixtures', () => {
    it('should provide invalid query strings for testing', () => {
      expect(invalidQueryFixtures.missingName).not.toContain('name:');
      expect(invalidQueryFixtures.invalidField).toContain('invalid_field');
      expect(invalidQueryFixtures.emptyKeywords).toContain('keywords: []');
      expect(invalidQueryFixtures.malformedYaml).toContain('missing colon');
    });
  });
});
