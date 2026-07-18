/**
 * E2E Tests for `search-hub query inspect` command
 *
 * Tests query inspection showing block resolution and added filters per provider.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import {
  setupE2EContext,
  type E2EContext,
  createQueryFile,
  createRawQueryFile,
  queryFixtures,
} from '../../e2e-helpers.js';
import { inspectQueryCommand, formatInspectOutput } from './inspect.js';

describe('search-hub query inspect E2E', () => {
  let ctx: E2EContext;

  beforeEach(async () => {
    ctx = await setupE2EContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  describe('inspect - query with providers section', () => {
    it('should show replaced blocks and added filters from YAML', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: diabetes_ai_scoping
description: Scoping review query
query:
  - id: population
    field: title_abstract
    terms:
      keywords:
        - diabetes
        - insulin resistance
    operator: OR
  - id: intervention
    field: title_abstract
    terms:
      keywords:
        - artificial intelligence
        - machine learning
    operator: OR
  - id: outcome
    field: title_abstract
    terms:
      keywords:
        - prediction
        - prognosis
    operator: OR
providers:
  arxiv:
    replaces:
      population:
        field: all
        terms:
          keywords:
            - diabetes mellitus
        operator: OR
      intervention:
        field: all
        terms:
          keywords:
            - deep learning
        operator: OR
    adds:
      filters:
        categories:
          - cs.AI
          - cs.LG
  pubmed:
    adds:
      filters:
        publication_types:
          exclude:
            - Review
  scopus:
    adds:
      filters:
        source_types:
          - journal
          - conference proceeding
`,
      );

      const result = await inspectQueryCommand(queryPath);

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();

      const inspectResult = result.result!;
      expect(inspectResult.name).toBe('diabetes_ai_scoping');
      expect(inspectResult.blocks).toHaveLength(3);

      // arXiv should have replaced population and intervention
      const popBlock = inspectResult.blocks.find((b) => b.id === 'population')!;
      expect(popBlock.status['arxiv']).toBe('replaced');
      expect(popBlock.status['pubmed']).toBe('default');

      const intBlock = inspectResult.blocks.find((b) => b.id === 'intervention')!;
      expect(intBlock.status['arxiv']).toBe('replaced');

      // outcome should be default everywhere
      const outBlock = inspectResult.blocks.find((b) => b.id === 'outcome')!;
      for (const provider of inspectResult.providers) {
        expect(outBlock.status[provider]).toBe('default');
      }

      // Verify table output format
      const output = formatInspectOutput(inspectResult);
      expect(output).toContain('Query: diabetes_ai_scoping');
      expect(output).toContain('replaced');
      expect(output).toContain('default');
      expect(output).toContain('Added Filters');
    });
  });

  describe('inspect - query without providers section', () => {
    it('should show all defaults for simple query', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);

      const result = await inspectQueryCommand(queryPath);

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();

      const inspectResult = result.result!;

      // All blocks should be default for all providers
      for (const block of inspectResult.blocks) {
        for (const provider of inspectResult.providers) {
          expect(block.status[provider]).toBe('default');
        }
      }

      // No added filters
      expect(inspectResult.addedFilters).toEqual([]);

      // Verify output does not contain "Added Filters" section
      const output = formatInspectOutput(inspectResult);
      expect(output).not.toContain('Added Filters');
    });

    it('should show all defaults for multi-block query', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.multiBlock);

      const result = await inspectQueryCommand(queryPath);

      expect(result.success).toBe(true);
      const inspectResult = result.result!;

      expect(inspectResult.blocks).toHaveLength(2);
      for (const block of inspectResult.blocks) {
        for (const provider of inspectResult.providers) {
          expect(block.status[provider]).toBe('default');
        }
      }
    });
  });

  describe('inspect - output includes all configured providers', () => {
    it('should include all four default providers in output', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);

      const result = await inspectQueryCommand(queryPath);

      expect(result.success).toBe(true);
      const output = formatInspectOutput(result.result!);

      expect(output).toContain('PubMed');
      expect(output).toContain('ERIC');
      expect(output).toContain('arXiv');
      expect(output).toContain('Scopus');
    });

    it('should limit to specified provider with --db', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);

      const result = await inspectQueryCommand(queryPath, {
        providers: ['pubmed'],
      });

      expect(result.success).toBe(true);
      const output = formatInspectOutput(result.result!);

      expect(output).toContain('PubMed');
      expect(output).not.toContain('ERIC');
      expect(output).not.toContain('arXiv');
      expect(output).not.toContain('Scopus');
    });
  });

  describe('inspect - error handling', () => {
    it('should fail for non-existent file', async () => {
      const nonExistentPath = join(ctx.tempDir, 'nonexistent.yaml');

      const result = await inspectQueryCommand(nonExistentPath);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should fail for invalid query file', async () => {
      const invalidPath = await createRawQueryFile(ctx.tempDir, 'not: valid: yaml: query');

      const result = await inspectQueryCommand(invalidPath);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
