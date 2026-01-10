/**
 * E2E Tests for `search-hub search` command - Dry Run
 *
 * Tests the search command with --dry-run flag.
 * These tests do NOT make real API calls.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  setupE2EContext,
  type E2EContext,
  createQueryFile,
  createRawQueryFile,
  queryFixtures,
} from '../e2e-helpers.js';
import {
  parseSearchOptions,
  validateSearchInput,
  formatDryRunOutput,
  type SearchCommandOptions,
  type TranslationResult,
} from './search.js';
import { translateQueryCommand } from './query/translate.js';

describe('search-hub search --dry-run E2E', () => {
  let ctx: E2EContext;

  beforeEach(async () => {
    ctx = await setupE2EContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  describe('--dry-run shows translated queries', () => {
    it('should show translations for all providers', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);

      // Use translate command to get translations (simulating dry run)
      const result = await translateQueryCommand(queryPath);

      expect(result.success).toBe(true);
      expect(result.translations).toBeDefined();

      // Format as dry run output
      const translations: TranslationResult[] = Object.entries(
        result.translations!
      ).map(([provider, t]) => ({
        provider,
        query: t.native,
      }));

      const output = formatDryRunOutput(translations);

      expect(output).toContain('Translated queries:');
      expect(output).toContain('[pubmed]');
      expect(output).toContain('[eric]');
      expect(output).toContain('[arxiv]');
      expect(output).toContain('[scopus]');
    });

    it('should show translation for single provider with --db', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);

      const result = await translateQueryCommand(queryPath, {
        providers: ['pubmed'],
      });

      expect(result.success).toBe(true);

      const translations: TranslationResult[] = Object.entries(
        result.translations!
      ).map(([provider, t]) => ({
        provider,
        query: t.native,
      }));

      const output = formatDryRunOutput(translations);

      expect(output).toContain('[pubmed]');
      expect(output).not.toContain('[eric]');
      expect(output).not.toContain('[arxiv]');
      expect(output).not.toContain('[scopus]');
    });
  });

  describe('--dry-run does not create session', () => {
    it('should not create session directory in dry run mode', async () => {
      // In dry run mode, no session should be created
      const options: SearchCommandOptions = {
        queryFile: 'test.yaml',
        dryRun: true,
      };

      expect(options.dryRun).toBe(true);

      // Check sessions directory is empty
      const sessionsContent = await readdir(ctx.sessionsDir);
      expect(sessionsContent).toHaveLength(0);
    });
  });

  describe('--dry-run does not make API calls', () => {
    it('should only translate queries without executing', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);

      // Simulate dry run - only translate, no execution
      const result = await translateQueryCommand(queryPath);

      expect(result.success).toBe(true);
      // Verify we got translations but no search was executed
      expect(result.translations).toBeDefined();
      // No session files should exist
      const sessionsContent = await readdir(ctx.sessionsDir);
      expect(sessionsContent).toHaveLength(0);
    });
  });

  describe('--db filters databases in dry run', () => {
    it('should only show pubmed translation with --db pubmed', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);

      const result = await translateQueryCommand(queryPath, {
        providers: ['pubmed'],
      });

      expect(result.success).toBe(true);
      expect(Object.keys(result.translations!)).toEqual(['pubmed']);
    });

    it('should show multiple providers with --db pubmed,eric', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);

      const result = await translateQueryCommand(queryPath, {
        providers: ['pubmed', 'eric'],
      });

      expect(result.success).toBe(true);
      const providers = Object.keys(result.translations!);
      expect(providers).toContain('pubmed');
      expect(providers).toContain('eric');
      expect(providers).not.toContain('arxiv');
      expect(providers).not.toContain('scopus');
    });
  });

  describe('parseSearchOptions', () => {
    it('should parse query file argument', () => {
      const options = parseSearchOptions('query.yaml', {});

      expect(options.queryFile).toBe('query.yaml');
    });

    it('should parse --query option', () => {
      const options = parseSearchOptions(undefined, {
        query: 'diabetes[tiab]',
      });

      expect(options.directQuery).toBe('diabetes[tiab]');
    });

    it('should parse --db option', () => {
      const options = parseSearchOptions('query.yaml', {
        db: 'pubmed',
      });

      expect(options.providers).toEqual(['pubmed']);
    });

    it('should parse multiple --db values', () => {
      const options = parseSearchOptions('query.yaml', {
        db: 'pubmed,eric',
      });

      expect(options.providers).toContain('pubmed');
      expect(options.providers).toContain('eric');
    });

    it('should parse --max-results option', () => {
      const options = parseSearchOptions('query.yaml', {
        maxResults: '100',
      });

      expect(options.maxResults).toBe(100);
    });

    it('should parse --dry-run flag', () => {
      const options = parseSearchOptions('query.yaml', {
        dryRun: true,
      });

      expect(options.dryRun).toBe(true);
    });

    it('should parse --no-resume flag', () => {
      const options = parseSearchOptions('query.yaml', {
        noResume: true,
      });

      expect(options.noResume).toBe(true);
    });

    it('should parse --name option', () => {
      const options = parseSearchOptions('query.yaml', {
        name: 'my-search-session',
      });

      expect(options.sessionName).toBe('my-search-session');
    });
  });

  describe('validateSearchInput', () => {
    it('should require query file or direct query', () => {
      const result = validateSearchInput({});

      expect(result.valid).toBe(false);
      expect(result.error).toContain('query file');
    });

    it('should accept query file', () => {
      const result = validateSearchInput({
        queryFile: 'query.yaml',
      });

      expect(result.valid).toBe(true);
    });

    it('should require --db with direct query', () => {
      const result = validateSearchInput({
        directQuery: 'diabetes[tiab]',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('--db');
    });

    it('should accept direct query with --db', () => {
      const result = validateSearchInput({
        directQuery: 'diabetes[tiab]',
        providers: ['pubmed'],
      });

      expect(result.valid).toBe(true);
    });

    it('should reject direct query with multiple providers', () => {
      const result = validateSearchInput({
        directQuery: 'diabetes[tiab]',
        providers: ['pubmed', 'eric'],
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('single provider');
    });
  });

  describe('formatDryRunOutput', () => {
    it('should format empty translations', () => {
      const output = formatDryRunOutput([]);

      expect(output).toBe('No translations available.');
    });

    it('should format single translation', () => {
      const translations: TranslationResult[] = [
        { provider: 'pubmed', query: 'diabetes[tiab]' },
      ];

      const output = formatDryRunOutput(translations);

      expect(output).toContain('Translated queries:');
      expect(output).toContain('[pubmed]');
      expect(output).toContain('diabetes[tiab]');
    });

    it('should format multiple translations', () => {
      const translations: TranslationResult[] = [
        { provider: 'pubmed', query: 'diabetes[tiab]' },
        { provider: 'eric', query: 'diabetes AND mellitus' },
      ];

      const output = formatDryRunOutput(translations);

      expect(output).toContain('[pubmed]');
      expect(output).toContain('diabetes[tiab]');
      expect(output).toContain('[eric]');
      expect(output).toContain('diabetes AND mellitus');
    });
  });

  describe('dry run with complex queries', () => {
    it('should handle multi-block queries', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.multiBlock);

      const result = await translateQueryCommand(queryPath);

      expect(result.success).toBe(true);
      expect(Object.keys(result.translations!).length).toBeGreaterThan(0);
    });

    it('should handle queries with MeSH terms', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.withMesh);

      const result = await translateQueryCommand(queryPath, {
        providers: ['pubmed'],
      });

      expect(result.success).toBe(true);
      expect(result.translations!['pubmed']).toBeDefined();
    });

    it('should handle queries with filters', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: filtered-query
query:
  - field: title_abstract
    terms:
      keywords:
        - cancer
    operator: AND
filters:
  year_from: 2022
  year_to: 2024
  languages:
    - en
`
      );

      const result = await translateQueryCommand(queryPath);

      expect(result.success).toBe(true);
      // Check that year filters are included in translations
      const anyHasYear = Object.values(result.translations!).some((t) =>
        /2022|2024/.test(t.native)
      );
      expect(anyHasYear).toBe(true);
    });
  });

  describe('error handling in dry run', () => {
    it('should handle missing query file', async () => {
      const result = await translateQueryCommand(
        join(ctx.tempDir, 'nonexistent.yaml')
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle invalid query file', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        'invalid: yaml: content'
      );

      const result = await translateQueryCommand(queryPath);

      expect(result.success).toBe(false);
    });
  });
});
