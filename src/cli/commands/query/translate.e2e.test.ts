/**
 * E2E Tests for `search-hub query translate` command
 *
 * Tests query translation to native database syntax.
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
import {
  translateQueryCommand,
  formatTranslateResult,
} from './translate.js';

describe('search-hub query translate E2E', () => {
  let ctx: E2EContext;

  beforeEach(async () => {
    ctx = await setupE2EContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  describe('translate - to all databases', () => {
    it('should translate simple query to all default databases', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);

      const result = await translateQueryCommand(queryPath);

      expect(result.success).toBe(true);
      expect(result.translations).toBeDefined();

      // Should have translations for all default providers
      expect(result.translations!['pubmed']).toBeDefined();
      expect(result.translations!['eric']).toBeDefined();
      expect(result.translations!['arxiv']).toBeDefined();
      expect(result.translations!['scopus']).toBeDefined();
    });

    it('should include native query syntax for each database', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);

      const result = await translateQueryCommand(queryPath);

      expect(result.success).toBe(true);

      // Each translation should have native syntax
      const pubmed = result.translations!['pubmed'];
      expect(pubmed).toBeDefined();
      expect(pubmed!.native).toBeDefined();
      expect(pubmed!.native.length).toBeGreaterThan(0);

      const eric = result.translations!['eric'];
      expect(eric).toBeDefined();
      expect(eric!.native).toBeDefined();

      const arxiv = result.translations!['arxiv'];
      expect(arxiv).toBeDefined();
      expect(arxiv!.native).toBeDefined();

      const scopus = result.translations!['scopus'];
      expect(scopus).toBeDefined();
      expect(scopus!.native).toBeDefined();
    });

    it('should translate multi-block query to all databases', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.multiBlock);

      const result = await translateQueryCommand(queryPath);

      expect(result.success).toBe(true);
      expect(Object.keys(result.translations!)).toHaveLength(4);
    });
  });

  describe('translate - --db filters to specific database', () => {
    it('should translate only for specified provider', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);

      const result = await translateQueryCommand(queryPath, {
        providers: ['pubmed'],
      });

      expect(result.success).toBe(true);
      expect(result.translations).toBeDefined();
      expect(Object.keys(result.translations!)).toHaveLength(1);
      expect(result.translations!['pubmed']).toBeDefined();
      expect(result.translations!['eric']).toBeUndefined();
    });

    it('should translate for multiple specified providers', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);

      const result = await translateQueryCommand(queryPath, {
        providers: ['pubmed', 'arxiv'],
      });

      expect(result.success).toBe(true);
      expect(Object.keys(result.translations!)).toHaveLength(2);
      expect(result.translations!['pubmed']).toBeDefined();
      expect(result.translations!['arxiv']).toBeDefined();
      expect(result.translations!['eric']).toBeUndefined();
      expect(result.translations!['scopus']).toBeUndefined();
    });
  });

  describe('translate - shows native syntax for each database', () => {
    it('should show PubMed native syntax with field tags', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);

      const result = await translateQueryCommand(queryPath, {
        providers: ['pubmed'],
      });

      expect(result.success).toBe(true);
      const pubmed = result.translations!['pubmed'];

      // PubMed uses field tags like [tiab] for title/abstract
      expect(pubmed!.native).toMatch(/\[tiab\]|\[Title\/Abstract\]/i);
    });

    it('should show ERIC native syntax', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);

      const result = await translateQueryCommand(queryPath, {
        providers: ['eric'],
      });

      expect(result.success).toBe(true);
      const eric = result.translations!['eric'];
      expect(eric!.native).toBeDefined();
      // ERIC syntax should contain the search terms
      expect(eric!.native.toLowerCase()).toContain('diabetes');
    });

    it('should show arXiv native syntax', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);

      const result = await translateQueryCommand(queryPath, {
        providers: ['arxiv'],
      });

      expect(result.success).toBe(true);
      const arxiv = result.translations!['arxiv'];
      expect(arxiv!.native).toBeDefined();
    });

    it('should show Scopus native syntax', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);

      const result = await translateQueryCommand(queryPath, {
        providers: ['scopus'],
      });

      expect(result.success).toBe(true);
      const scopus = result.translations!['scopus'];
      expect(scopus!.native).toBeDefined();
      // Scopus typically uses TITLE-ABS-KEY format
      expect(scopus!.native).toMatch(/TITLE|ABS|KEY/i);
    });

    it('should include year filters in translation', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.multiBlock);

      const result = await translateQueryCommand(queryPath);

      expect(result.success).toBe(true);

      // The multiBlock fixture has year filters
      // Check that at least one translation includes year references
      const translations = Object.values(result.translations!);
      const hasYearFilter = translations.some(
        (t) => /2020|2024|year|pubyear|date/i.test(t.native)
      );
      expect(hasYearFilter).toBe(true);
    });
  });

  describe('translate - error handling', () => {
    it('should fail for non-existent file', async () => {
      const nonExistentPath = join(ctx.tempDir, 'nonexistent.yaml');

      const result = await translateQueryCommand(nonExistentPath);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should fail for invalid query file', async () => {
      const invalidPath = await createRawQueryFile(
        ctx.tempDir,
        'not: valid: yaml: query'
      );

      const result = await translateQueryCommand(invalidPath);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('formatTranslateResult', () => {
    it('should format success result with all providers', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);
      const result = await translateQueryCommand(queryPath);

      const output = formatTranslateResult(result, queryPath);

      expect(output).toContain('Translations for:');
      expect(output).toContain('[PUBMED]');
      expect(output).toContain('[ERIC]');
      expect(output).toContain('[ARXIV]');
      expect(output).toContain('[SCOPUS]');
    });

    it('should format success result with single provider', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.simple);
      const result = await translateQueryCommand(queryPath, {
        providers: ['pubmed'],
      });

      const output = formatTranslateResult(result, queryPath);

      expect(output).toContain('Translations for:');
      expect(output).toContain('[PUBMED]');
      expect(output).not.toContain('[ERIC]');
    });

    it('should format error result', async () => {
      const result = {
        success: false,
        error: 'File not found',
      };

      const output = formatTranslateResult(result, '/missing.yaml');

      expect(output).toContain('✗ Failed to translate');
      expect(output).toContain('/missing.yaml');
      expect(output).toContain('File not found');
    });
  });

  describe('MeSH term handling', () => {
    it('should include MeSH terms in PubMed translation', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.withMesh);

      const result = await translateQueryCommand(queryPath, {
        providers: ['pubmed'],
      });

      expect(result.success).toBe(true);
      const pubmed = result.translations!['pubmed'];

      // Should include the MeSH term
      expect(pubmed!.native).toContain('Diabetes Mellitus, Type 2');
      // Should have MeSH tag (PubMed uses [mh] for MeSH Heading)
      expect(pubmed!.native).toMatch(/\[mh\]|\[MeSH\]/i);
    });
  });

  describe('ERIC Descriptor handling', () => {
    it('should include ERIC Descriptors in ERIC translation', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: eric-descriptor-test
query:
  - field: title_abstract
    terms:
      keywords:
        - medical education
      eric:
        - Medical Education
        - Clinical Experience
    operator: OR
`
      );

      const result = await translateQueryCommand(queryPath, {
        providers: ['eric'],
      });

      expect(result.success).toBe(true);
      const eric = result.translations!['eric'];

      // Should include ERIC Descriptors with subject: prefix
      expect(eric!.native).toContain('subject:"Medical Education"');
      expect(eric!.native).toContain('subject:"Clinical Experience"');
    });

    it('should combine keywords and ERIC Descriptors with OR', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: eric-combined-test
query:
  - field: title_abstract
    terms:
      keywords:
        - competency based education
      eric:
        - Competency Based Education
    operator: OR
`
      );

      const result = await translateQueryCommand(queryPath, {
        providers: ['eric'],
      });

      expect(result.success).toBe(true);
      const eric = result.translations!['eric'];

      // Keywords should be in title/description fields
      expect(eric!.native).toContain('title:"competency based education"');
      expect(eric!.native).toContain('description:"competency based education"');
      // ERIC Descriptors should use subject: field
      expect(eric!.native).toContain('subject:"Competency Based Education"');
      // All terms should be combined with OR
      expect(eric!.native).toContain(' OR ');
    });

    it('should ignore eric field for non-ERIC providers', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: eric-ignored-test
query:
  - field: title_abstract
    terms:
      keywords:
        - education
      eric:
        - Medical Education
    operator: OR
`
      );

      const result = await translateQueryCommand(queryPath, {
        providers: ['pubmed'],
      });

      expect(result.success).toBe(true);
      const pubmed = result.translations!['pubmed'];

      // PubMed should not include ERIC Descriptors
      expect(pubmed!.native).not.toContain('subject:');
      expect(pubmed!.native).not.toContain('Medical Education');
    });
  });

  describe('translate - mesh-only query (no keywords)', () => {
    it('should translate mesh-only query for PubMed', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: mesh-only-translate-test
query:
  - field: title_abstract
    terms:
      mesh:
        - "Artificial Intelligence"
    operator: OR
`
      );

      const result = await translateQueryCommand(queryPath, {
        providers: ['pubmed'],
      });

      expect(result.success).toBe(true);
      const pubmed = result.translations!['pubmed'];
      expect(pubmed!.native).toContain('Artificial Intelligence');
      expect(pubmed!.native).toContain('[mh]');
    });

    it('should translate mesh-only query for all providers', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: mesh-only-all-providers
query:
  - field: title_abstract
    terms:
      mesh:
        - "Artificial Intelligence"
    operator: OR
`
      );

      const result = await translateQueryCommand(queryPath);

      expect(result.success).toBe(true);
      expect(result.translations!['pubmed']).toBeDefined();
      expect(result.translations!['eric']).toBeDefined();
      expect(result.translations!['arxiv']).toBeDefined();
      expect(result.translations!['scopus']).toBeDefined();
    });

    it('should translate mixed keywords-and-mesh-only blocks', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: mixed-blocks-translate
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
    operator: OR
`
      );

      const result = await translateQueryCommand(queryPath, {
        providers: ['pubmed'],
      });

      expect(result.success).toBe(true);
      const pubmed = result.translations!['pubmed'];
      expect(pubmed!.native).toContain('Artificial Intelligence');
      expect(pubmed!.native).toContain('diabetes');
    });
  });

  describe('Emtree term handling', () => {
    it('should include Emtree terms in Scopus translation using INDEXTERMS', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: emtree-test
query:
  - field: title_abstract
    terms:
      emtree:
        - Diabetes Mellitus
        - Insulin Resistance
    operator: OR
`
      );

      const result = await translateQueryCommand(queryPath, {
        providers: ['scopus'],
      });

      expect(result.success).toBe(true);
      const scopus = result.translations!['scopus'];
      expect(scopus!.native).toContain('INDEXTERMS');
      expect(scopus!.native).toContain('Diabetes Mellitus');
      expect(scopus!.native).toContain('Insulin Resistance');
    });

    it('should combine keywords and Emtree terms in Scopus', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: emtree-combined-test
query:
  - field: title_abstract
    terms:
      keywords:
        - diabetes
        - T2DM
      emtree:
        - Diabetes Mellitus
    operator: OR
`
      );

      const result = await translateQueryCommand(queryPath, {
        providers: ['scopus'],
      });

      expect(result.success).toBe(true);
      const scopus = result.translations!['scopus'];
      // Keywords in TITLE-ABS-KEY
      expect(scopus!.native).toContain('TITLE-ABS-KEY(diabetes OR T2DM)');
      // Emtree in INDEXTERMS
      expect(scopus!.native).toContain('INDEXTERMS("Diabetes Mellitus")');
    });

    it('should translate emtree-only block for all providers', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: emtree-only-all
query:
  - field: title_abstract
    terms:
      emtree:
        - Artificial Intelligence
    operator: OR
`
      );

      const result = await translateQueryCommand(queryPath);

      expect(result.success).toBe(true);
      // Scopus should use INDEXTERMS
      const scopus = result.translations!['scopus'];
      expect(scopus!.native).toContain('INDEXTERMS');
      // Other providers should produce output (may be empty for unsupported vocab)
      expect(result.translations!['pubmed']).toBeDefined();
      expect(result.translations!['arxiv']).toBeDefined();
      expect(result.translations!['eric']).toBeDefined();
    });
  });

  describe('Unsupported vocabulary warnings', () => {
    it('should warn when arXiv encounters mesh terms', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: mesh-warning-test
query:
  - field: title_abstract
    terms:
      keywords:
        - diabetes
      mesh:
        - Diabetes Mellitus
    operator: OR
`
      );

      const result = await translateQueryCommand(queryPath, {
        providers: ['arxiv'],
      });

      expect(result.success).toBe(true);
      const arxiv = result.translations!['arxiv'];
      expect(arxiv!.warnings).toBeDefined();
      expect(arxiv!.warnings).toContainEqual(
        'arXiv does not support MeSH terms — mesh terms in block 1 will be ignored'
      );
    });

    it('should warn when Scopus encounters mesh terms', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: scopus-mesh-warning
query:
  - field: title_abstract
    terms:
      mesh:
        - Neoplasms
    operator: OR
`
      );

      const result = await translateQueryCommand(queryPath, {
        providers: ['scopus'],
      });

      expect(result.success).toBe(true);
      const scopus = result.translations!['scopus'];
      expect(scopus!.warnings).toContainEqual(
        'Scopus does not support MeSH terms — mesh terms in block 1 will be ignored'
      );
    });

    it('should not warn when PubMed uses mesh (supported)', async () => {
      const queryPath = await createQueryFile(ctx.tempDir, queryFixtures.withMesh);

      const result = await translateQueryCommand(queryPath, {
        providers: ['pubmed'],
      });

      expect(result.success).toBe(true);
      const pubmed = result.translations!['pubmed'];
      expect(pubmed!.warnings).toBeUndefined();
    });

    it('should not warn when Scopus uses emtree (supported)', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: scopus-emtree-no-warning
query:
  - field: title_abstract
    terms:
      emtree:
        - Diabetes Mellitus
    operator: OR
`
      );

      const result = await translateQueryCommand(queryPath, {
        providers: ['scopus'],
      });

      expect(result.success).toBe(true);
      const scopus = result.translations!['scopus'];
      expect(scopus!.warnings).toBeUndefined();
    });

    it('should display warnings in formatted output', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: warning-format-test
query:
  - field: title_abstract
    terms:
      keywords:
        - diabetes
      mesh:
        - Diabetes Mellitus
    operator: OR
`
      );

      const result = await translateQueryCommand(queryPath, {
        providers: ['arxiv'],
      });

      const output = formatTranslateResult(result, queryPath);
      expect(output).toContain('arXiv does not support MeSH terms');
    });
  });

  describe('query with various fields', () => {
    it('should translate title field correctly', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: title-test
query:
  - field: title
    terms:
      keywords:
        - machine learning
    operator: AND
`
      );

      const result = await translateQueryCommand(queryPath);

      expect(result.success).toBe(true);
      // Title field should be reflected in translations
    });

    it('should translate all field correctly', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: all-field-test
query:
  - field: all
    terms:
      keywords:
        - artificial intelligence
    operator: AND
`
      );

      const result = await translateQueryCommand(queryPath);

      expect(result.success).toBe(true);
    });

    it('should translate keyword field correctly', async () => {
      const queryPath = await createRawQueryFile(
        ctx.tempDir,
        `
name: keyword-test
query:
  - field: keyword
    terms:
      keywords:
        - neural network
        - deep learning
    operator: OR
`
      );

      const result = await translateQueryCommand(queryPath);

      expect(result.success).toBe(true);
    });
  });
});
