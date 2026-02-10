import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  // Types
  type FieldType,
  type Operator,
  type ProviderName,
  type TermBlock,
  type QueryBlock,
  type Filters,
  type PublicationTypeFilter,
  type OverrideBlock,
  type QueryAST,
  // Parser functions
  parseQueryFile,
  parseQueryString,
  // Validator functions
  validateQueryFile,
  formatValidationErrors,
  ValidationError,
  // Schemas
  fieldTypeSchema,
  termBlockSchema,
  queryBlockSchema,
  filtersSchema,
  overrideBlockSchema,
  queryFileSchema,
  // Vocabulary validation
  MeSHLookupClient,
  type MeSHLookupResult,
  extractControlledVocabTerms,
  validateControlledVocab,
  type VocabTerm,
  type VocabTermResult,
  type VocabValidationResult,
} from './index.js';

describe('Query Module Exports', () => {
  describe('Type exports', () => {
    it('should export all types', () => {
      // Type assertions - these compile if types are exported correctly
      const field: FieldType = 'title_abstract';
      const operator: Operator = 'OR';
      const provider: ProviderName = 'pubmed';

      const termBlock: TermBlock = {
        keywords: ['test'],
        mesh: ['Test Term'],
      };

      const queryBlock: QueryBlock = {
        field,
        terms: termBlock,
        operator,
      };

      const publicationFilter: PublicationTypeFilter = {
        include: ['Journal Article'],
        exclude: ['Review'],
      };

      const filters: Filters = {
        yearFrom: 2020,
        yearTo: 2024,
        languages: ['en'],
        publicationTypes: publicationFilter,
      };

      const override: OverrideBlock = {
        filters,
        categories: ['cs.AI'],
        sourceTypes: ['journal'],
      };

      const ast: QueryAST = {
        name: 'test_query',
        description: 'Test query',
        blocks: [queryBlock],
        filters,
        overrides: {
          [provider]: override,
        },
      };

      expect(ast.name).toBe('test_query');
    });
  });

  describe('Schema exports', () => {
    it('should export all schemas', () => {
      expect(fieldTypeSchema).toBeDefined();
      expect(termBlockSchema).toBeDefined();
      expect(queryBlockSchema).toBeDefined();
      expect(filtersSchema).toBeDefined();
      expect(overrideBlockSchema).toBeDefined();
      expect(queryFileSchema).toBeDefined();
    });
  });

  describe('Function exports', () => {
    it('should export parseQueryString', () => {
      expect(parseQueryString).toBeDefined();
      expect(typeof parseQueryString).toBe('function');
    });

    it('should export parseQueryFile', () => {
      expect(parseQueryFile).toBeDefined();
      expect(typeof parseQueryFile).toBe('function');
    });

    it('should export validateQueryFile', () => {
      expect(validateQueryFile).toBeDefined();
      expect(typeof validateQueryFile).toBe('function');
    });

    it('should export formatValidationErrors', () => {
      expect(formatValidationErrors).toBeDefined();
      expect(typeof formatValidationErrors).toBe('function');
    });

    it('should export ValidationError', () => {
      expect(ValidationError).toBeDefined();
      expect(typeof ValidationError).toBe('function');
    });
  });

  describe('Vocabulary validation exports', () => {
    it('should export MeSHLookupClient', () => {
      expect(MeSHLookupClient).toBeDefined();
      expect(typeof MeSHLookupClient).toBe('function');
    });

    it('should export extractControlledVocabTerms', () => {
      expect(extractControlledVocabTerms).toBeDefined();
      expect(typeof extractControlledVocabTerms).toBe('function');
    });

    it('should export validateControlledVocab', () => {
      expect(validateControlledVocab).toBeDefined();
      expect(typeof validateControlledVocab).toBe('function');
    });

    it('should export vocabulary types', () => {
      const term: VocabTerm = { term: 'Test', vocabulary: 'mesh' };
      const result: VocabTermResult = { term: 'Test', vocabulary: 'mesh', found: true };
      const lookupResult: MeSHLookupResult = { term: 'Test', found: true };
      const validationResult: VocabValidationResult = { valid: [result], invalid: [], errors: [] };

      expect(term.vocabulary).toBe('mesh');
      expect(validationResult.valid).toHaveLength(1);
      expect(lookupResult.found).toBe(true);
    });
  });

  describe('End-to-end integration', () => {
    let testDir: string;

    beforeAll(async () => {
      testDir = join(tmpdir(), `query-module-test-${Date.now()}`);
      await mkdir(testDir, { recursive: true });
    });

    afterAll(async () => {
      await rm(testDir, { recursive: true, force: true });
    });

    it('should parse and validate a complete query file', async () => {
      const filePath = join(testDir, 'integration-test.yaml');
      await writeFile(
        filePath,
        `
name: integration_test
description: End-to-end integration test

query:
  - field: title_abstract
    terms:
      keywords:
        - machine learning
        - deep learning
      mesh:
        - Machine Learning
    operator: OR

  - field: title_abstract
    terms:
      keywords:
        - healthcare
        - medical
    operator: OR

filters:
  year_from: 2020
  year_to: 2024
  language:
    - en

overrides:
  pubmed:
    filters:
      publication_types:
        exclude:
          - Review
  arxiv:
    categories:
      - cs.AI
      - cs.LG
`
      );

      const ast = await parseQueryFile(filePath);

      // Verify structure
      expect(ast.name).toBe('integration_test');
      expect(ast.description).toBe('End-to-end integration test');
      expect(ast.blocks).toHaveLength(2);

      // Verify first block
      const block1 = ast.blocks[0]!;
      expect(block1.field).toBe('title_abstract');
      expect(block1.terms.keywords).toEqual(['machine learning', 'deep learning']);
      expect(block1.terms.mesh).toEqual(['Machine Learning']);
      expect(block1.operator).toBe('OR');

      // Verify filters
      expect(ast.filters.yearFrom).toBe(2020);
      expect(ast.filters.yearTo).toBe(2024);
      expect(ast.filters.languages).toEqual(['en']);

      // Verify overrides
      expect(ast.overrides.pubmed?.filters?.publicationTypes?.exclude).toEqual(['Review']);
      expect(ast.overrides.arxiv?.categories).toEqual(['cs.AI', 'cs.LG']);
    });

    it('should report validation errors for invalid file', async () => {
      const filePath = join(testDir, 'invalid-test.yaml');
      await writeFile(
        filePath,
        `
description: Missing name and empty query
query: []
`
      );

      // parseQueryFile should throw
      await expect(parseQueryFile(filePath)).rejects.toThrow();

      // formatValidationErrors should report errors
      const yaml = await import('yaml');
      const content = await import('node:fs/promises').then((m) => m.readFile(filePath, 'utf-8'));
      const data = yaml.parse(content);
      const errors = formatValidationErrors(data);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.path === 'name' || e.message.includes('name'))).toBe(true);
    });
  });
});
