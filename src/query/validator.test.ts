import { describe, it, expect } from 'vitest';
import {
  fieldTypeSchema,
  termBlockSchema,
  queryBlockSchema,
  filtersSchema,
  overrideBlockSchema,
  queryFileSchema,
  validateQueryFile,
} from './validator.js';

describe('Query Validator Schemas', () => {
  describe('fieldTypeSchema', () => {
    it('should accept valid field types', () => {
      expect(fieldTypeSchema.parse('title')).toBe('title');
      expect(fieldTypeSchema.parse('abstract')).toBe('abstract');
      expect(fieldTypeSchema.parse('title_abstract')).toBe('title_abstract');
      expect(fieldTypeSchema.parse('author')).toBe('author');
      expect(fieldTypeSchema.parse('keyword')).toBe('keyword');
      expect(fieldTypeSchema.parse('all')).toBe('all');
    });

    it('should reject invalid field types', () => {
      expect(() => fieldTypeSchema.parse('invalid')).toThrow();
      expect(() => fieldTypeSchema.parse('')).toThrow();
      expect(() => fieldTypeSchema.parse(123)).toThrow();
    });
  });

  describe('termBlockSchema', () => {
    it('should accept keywords only', () => {
      const result = termBlockSchema.parse({
        keywords: ['diabetes', 'type 2 diabetes'],
      });
      expect(result.keywords).toEqual(['diabetes', 'type 2 diabetes']);
    });

    it('should accept keywords with mesh terms', () => {
      const result = termBlockSchema.parse({
        keywords: ['diabetes'],
        mesh: ['Diabetes Mellitus, Type 2'],
      });
      expect(result.mesh).toEqual(['Diabetes Mellitus, Type 2']);
    });

    it('should accept all vocabulary types', () => {
      const result = termBlockSchema.parse({
        keywords: ['diabetes'],
        mesh: ['Diabetes Mellitus, Type 2'],
        emtree: ['non insulin dependent diabetes mellitus'],
      });
      expect(result.emtree).toEqual(['non insulin dependent diabetes mellitus']);
    });

    it('should reject empty keywords array', () => {
      expect(() => termBlockSchema.parse({ keywords: [] })).toThrow();
    });

    it('should reject missing keywords', () => {
      expect(() => termBlockSchema.parse({ mesh: ['term'] })).toThrow();
    });
  });

  describe('queryBlockSchema', () => {
    it('should accept valid query block with OR operator', () => {
      const result = queryBlockSchema.parse({
        field: 'title_abstract',
        terms: { keywords: ['AI', 'machine learning'] },
        operator: 'OR',
      });
      expect(result.operator).toBe('OR');
    });

    it('should accept valid query block with AND operator', () => {
      const result = queryBlockSchema.parse({
        field: 'title',
        terms: { keywords: ['test'] },
        operator: 'AND',
      });
      expect(result.operator).toBe('AND');
    });

    it('should reject invalid operator', () => {
      expect(() =>
        queryBlockSchema.parse({
          field: 'title',
          terms: { keywords: ['test'] },
          operator: 'XOR',
        })
      ).toThrow();
    });

    it('should reject missing required fields', () => {
      expect(() =>
        queryBlockSchema.parse({
          field: 'title',
          terms: { keywords: ['test'] },
        })
      ).toThrow();

      expect(() =>
        queryBlockSchema.parse({
          terms: { keywords: ['test'] },
          operator: 'OR',
        })
      ).toThrow();
    });
  });

  describe('filtersSchema', () => {
    it('should accept year range', () => {
      const result = filtersSchema.parse({
        year_from: 2020,
        year_to: 2024,
      });
      expect(result.yearFrom).toBe(2020);
      expect(result.yearTo).toBe(2024);
    });

    it('should accept languages', () => {
      const result = filtersSchema.parse({
        language: ['en', 'ja'],
      });
      expect(result.languages).toEqual(['en', 'ja']);
    });

    it('should accept publication types', () => {
      const result = filtersSchema.parse({
        publication_types: {
          include: ['Journal Article'],
          exclude: ['Review', 'Meta-Analysis'],
        },
      });
      expect(result.publicationTypes?.include).toEqual(['Journal Article']);
      expect(result.publicationTypes?.exclude).toEqual(['Review', 'Meta-Analysis']);
    });

    it('should accept empty filters', () => {
      const result = filtersSchema.parse({});
      expect(result).toEqual({});
    });

    it('should accept undefined', () => {
      const result = filtersSchema.parse(undefined);
      expect(result).toEqual({});
    });
  });

  describe('overrideBlockSchema', () => {
    it('should accept filters override', () => {
      const result = overrideBlockSchema.parse({
        filters: {
          publication_types: {
            exclude: ['Comment', 'Letter'],
          },
        },
      });
      expect(result.filters?.publicationTypes?.exclude).toEqual(['Comment', 'Letter']);
    });

    it('should accept arxiv categories', () => {
      const result = overrideBlockSchema.parse({
        categories: ['cs.AI', 'cs.LG', 'q-bio'],
      });
      expect(result.categories).toEqual(['cs.AI', 'cs.LG', 'q-bio']);
    });

    it('should accept scopus source types', () => {
      const result = overrideBlockSchema.parse({
        source_types: ['journal', 'conference'],
      });
      expect(result.sourceTypes).toEqual(['journal', 'conference']);
    });

    it('should accept empty override', () => {
      const result = overrideBlockSchema.parse({});
      expect(result).toEqual({});
    });
  });

  describe('queryFileSchema', () => {
    it('should accept minimal valid query', () => {
      const result = queryFileSchema.parse({
        name: 'test_query',
        query: [
          {
            field: 'title_abstract',
            terms: { keywords: ['diabetes'] },
            operator: 'OR',
          },
        ],
      });
      expect(result.name).toBe('test_query');
      expect(result.blocks).toHaveLength(1);
    });

    it('should accept query with description', () => {
      const result = queryFileSchema.parse({
        name: 'test_query',
        description: 'A test query for diabetes research',
        query: [
          {
            field: 'title_abstract',
            terms: { keywords: ['diabetes'] },
            operator: 'OR',
          },
        ],
      });
      expect(result.description).toBe('A test query for diabetes research');
    });

    it('should accept query with filters', () => {
      const result = queryFileSchema.parse({
        name: 'test_query',
        query: [
          {
            field: 'title_abstract',
            terms: { keywords: ['diabetes'] },
            operator: 'OR',
          },
        ],
        filters: {
          year_from: 2020,
          year_to: 2024,
          language: ['en'],
        },
      });
      expect(result.filters.yearFrom).toBe(2020);
      expect(result.filters.languages).toEqual(['en']);
    });

    it('should accept query with overrides', () => {
      const result = queryFileSchema.parse({
        name: 'test_query',
        query: [
          {
            field: 'title_abstract',
            terms: { keywords: ['diabetes'] },
            operator: 'OR',
          },
        ],
        overrides: {
          pubmed: {
            filters: {
              publication_types: {
                exclude: ['Review'],
              },
            },
          },
          arxiv: {
            categories: ['cs.AI'],
          },
        },
      });
      expect(result.overrides.pubmed?.filters?.publicationTypes?.exclude).toEqual(['Review']);
      expect(result.overrides.arxiv?.categories).toEqual(['cs.AI']);
    });

    it('should reject missing name', () => {
      expect(() =>
        queryFileSchema.parse({
          query: [
            {
              field: 'title_abstract',
              terms: { keywords: ['diabetes'] },
              operator: 'OR',
            },
          ],
        })
      ).toThrow();
    });

    it('should reject missing query blocks', () => {
      expect(() =>
        queryFileSchema.parse({
          name: 'test_query',
        })
      ).toThrow();
    });

    it('should reject empty query blocks', () => {
      expect(() =>
        queryFileSchema.parse({
          name: 'test_query',
          query: [],
        })
      ).toThrow();
    });

    it('should accept complete example from spec', () => {
      const result = queryFileSchema.parse({
        name: 'diabetes_ai_scoping',
        description: 'AI applications in Type 2 Diabetes management',
        query: [
          {
            field: 'title_abstract',
            terms: {
              keywords: ['diabetes', 'type 2 diabetes', 'diabetes mellitus', 'T2DM'],
              mesh: ['Diabetes Mellitus, Type 2', 'Diabetes Mellitus'],
            },
            operator: 'OR',
          },
          {
            field: 'title_abstract',
            terms: {
              keywords: ['artificial intelligence', 'machine learning', 'deep learning', 'neural network'],
              mesh: ['Artificial Intelligence', 'Machine Learning', 'Deep Learning'],
            },
            operator: 'OR',
          },
          {
            field: 'title_abstract',
            terms: {
              keywords: ['diagnosis', 'prediction', 'management', 'treatment'],
            },
            operator: 'OR',
          },
        ],
        filters: {
          year_from: 2018,
          year_to: 2024,
          language: ['en'],
        },
        overrides: {
          pubmed: {
            filters: {
              publication_types: {
                exclude: ['Review', 'Systematic Review', 'Meta-Analysis'],
              },
            },
          },
          arxiv: {
            categories: ['cs.AI', 'cs.LG', 'cs.CL', 'q-bio.QM'],
          },
        },
      });

      expect(result.name).toBe('diabetes_ai_scoping');
      expect(result.blocks).toHaveLength(3);
      expect(result.filters.yearFrom).toBe(2018);
      expect(result.overrides.arxiv?.categories).toHaveLength(4);
    });
  });

  describe('validateQueryFile', () => {
    it('should return validated QueryAST for valid input', () => {
      const result = validateQueryFile({
        name: 'test_query',
        query: [
          {
            field: 'title_abstract',
            terms: { keywords: ['diabetes'] },
            operator: 'OR',
          },
        ],
      });
      expect(result.name).toBe('test_query');
      expect(result.blocks).toHaveLength(1);
    });

    it('should throw for invalid input', () => {
      expect(() => validateQueryFile({ invalid: 'data' })).toThrow();
    });
  });
});
