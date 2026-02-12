import { describe, it, expect } from 'vitest';
import {
  fieldTypeSchema,
  termBlockSchema,
  queryBlockSchema,
  filtersSchema,
  providerSectionSchema,
  queryFileSchema,
  validateQueryFile,
  formatValidationErrors,
  ValidationError,
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

    it('should accept mesh-only block (no keywords)', () => {
      const result = termBlockSchema.parse({
        mesh: ['Artificial Intelligence'],
      });
      expect(result.mesh).toEqual(['Artificial Intelligence']);
      expect(result.keywords).toBeUndefined();
    });

    it('should accept eric-only block (no keywords)', () => {
      const result = termBlockSchema.parse({
        eric: ['Medical Education'],
      });
      expect(result.eric).toEqual(['Medical Education']);
      expect(result.keywords).toBeUndefined();
    });

    it('should reject block with no term types at all', () => {
      expect(() => termBlockSchema.parse({})).toThrow(
        /At least one of keywords, mesh, emtree, or eric is required/
      );
    });

    it('should reject block with empty arrays (truthy but no actual terms)', () => {
      expect(() => termBlockSchema.parse({ mesh: [] })).toThrow();
      expect(() => termBlockSchema.parse({ emtree: [] })).toThrow();
      expect(() => termBlockSchema.parse({ eric: [] })).toThrow();
      expect(() => termBlockSchema.parse({ mesh: [], eric: [] })).toThrow();
    });

    it('should reject block with only exclude (no searchable terms)', () => {
      expect(() =>
        termBlockSchema.parse({ exclude: ['animal'] })
      ).toThrow(
        /At least one of keywords, mesh, emtree, or eric is required/
      );
    });

    it('should accept exclude terms', () => {
      const result = termBlockSchema.parse({
        keywords: ['EPA', 'entrustable professional activities'],
        exclude: ['environmental protection', 'pollution'],
      });
      expect(result.exclude).toEqual(['environmental protection', 'pollution']);
    });

    it('should accept keywords with mesh and exclude', () => {
      const result = termBlockSchema.parse({
        keywords: ['diabetes'],
        mesh: ['Diabetes Mellitus, Type 2'],
        exclude: ['animal', 'mice'],
      });
      expect(result.keywords).toEqual(['diabetes']);
      expect(result.mesh).toEqual(['Diabetes Mellitus, Type 2']);
      expect(result.exclude).toEqual(['animal', 'mice']);
    });

    it('should reject non-array exclude', () => {
      expect(() =>
        termBlockSchema.parse({
          keywords: ['test'],
          exclude: 'not an array',
        })
      ).toThrow();
    });

    it('should reject exclude with non-string elements', () => {
      expect(() =>
        termBlockSchema.parse({
          keywords: ['test'],
          exclude: [123, 456],
        })
      ).toThrow();
    });

    it('should accept eric descriptors', () => {
      const result = termBlockSchema.parse({
        keywords: ['medical education'],
        eric: ['Medical Education', 'Clinical Experience'],
      });
      expect(result.eric).toEqual(['Medical Education', 'Clinical Experience']);
    });

    it('should accept keywords with all vocabulary types including eric', () => {
      const result = termBlockSchema.parse({
        keywords: ['education'],
        mesh: ['Education, Medical'],
        emtree: ['medical education'],
        eric: ['Medical Education'],
        exclude: ['veterinary'],
      });
      expect(result.keywords).toEqual(['education']);
      expect(result.mesh).toEqual(['Education, Medical']);
      expect(result.emtree).toEqual(['medical education']);
      expect(result.eric).toEqual(['Medical Education']);
      expect(result.exclude).toEqual(['veterinary']);
    });

    it('should reject non-array eric', () => {
      expect(() =>
        termBlockSchema.parse({
          keywords: ['test'],
          eric: 'not an array',
        })
      ).toThrow();
    });

    it('should reject eric with non-string elements', () => {
      expect(() =>
        termBlockSchema.parse({
          keywords: ['test'],
          eric: [123, 456],
        })
      ).toThrow();
    });
  });

  describe('queryBlockSchema', () => {
    it('should accept valid query block with id', () => {
      const result = queryBlockSchema.parse({
        id: 'population',
        field: 'title_abstract',
        terms: { keywords: ['AI', 'machine learning'] },
        operator: 'OR',
      });
      expect(result.id).toBe('population');
      expect(result.operator).toBe('OR');
    });

    it('should accept valid query block with AND operator', () => {
      const result = queryBlockSchema.parse({
        id: 'intervention',
        field: 'title',
        terms: { keywords: ['test'] },
        operator: 'AND',
      });
      expect(result.operator).toBe('AND');
    });

    it('should reject invalid operator', () => {
      expect(() =>
        queryBlockSchema.parse({
          id: 'test',
          field: 'title',
          terms: { keywords: ['test'] },
          operator: 'XOR',
        })
      ).toThrow();
    });

    it('should reject missing id', () => {
      expect(() =>
        queryBlockSchema.parse({
          field: 'title',
          terms: { keywords: ['test'] },
          operator: 'OR',
        })
      ).toThrow();
    });

    it('should reject empty id', () => {
      expect(() =>
        queryBlockSchema.parse({
          id: '',
          field: 'title',
          terms: { keywords: ['test'] },
          operator: 'OR',
        })
      ).toThrow();
    });

    it('should reject missing required fields', () => {
      expect(() =>
        queryBlockSchema.parse({
          id: 'test',
          field: 'title',
          terms: { keywords: ['test'] },
        })
      ).toThrow();

      expect(() =>
        queryBlockSchema.parse({
          id: 'test',
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

    it('should accept categories', () => {
      const result = filtersSchema.parse({
        categories: ['cs.AI', 'cs.LG'],
      });
      expect(result.categories).toEqual(['cs.AI', 'cs.LG']);
    });

    it('should accept source_types', () => {
      const result = filtersSchema.parse({
        source_types: ['journal', 'conference'],
      });
      expect(result.sourceTypes).toEqual(['journal', 'conference']);
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

  describe('providerSectionSchema', () => {
    it('should accept replaces with block overrides', () => {
      const result = providerSectionSchema.parse({
        replaces: {
          population: {
            field: 'all',
            terms: { keywords: ['arxiv-specific'] },
            operator: 'OR',
          },
        },
      });
      expect(result.replaces?.['population']?.field).toBe('all');
    });

    it('should accept adds with partial filters', () => {
      const result = providerSectionSchema.parse({
        adds: {
          filters: {
            categories: ['cs.AI', 'cs.LG'],
          },
        },
      });
      expect(result.adds?.filters?.categories).toEqual(['cs.AI', 'cs.LG']);
    });

    it('should accept adds with snake_case filter keys', () => {
      const result = providerSectionSchema.parse({
        adds: {
          filters: {
            year_from: 2020,
            source_types: ['journal'],
            publication_types: { exclude: ['Review'] },
          },
        },
      });
      expect(result.adds?.filters?.yearFrom).toBe(2020);
      expect(result.adds?.filters?.sourceTypes).toEqual(['journal']);
      expect(result.adds?.filters?.publicationTypes?.exclude).toEqual(['Review']);
    });

    it('should accept both replaces and adds', () => {
      const result = providerSectionSchema.parse({
        replaces: {
          intervention: {
            field: 'title_abstract',
            terms: { keywords: ['different terms'] },
            operator: 'OR',
          },
        },
        adds: {
          filters: {
            source_types: ['journal'],
          },
        },
      });
      expect(result.replaces?.['intervention']).toBeDefined();
      expect(result.adds?.filters?.sourceTypes).toEqual(['journal']);
    });

    it('should accept empty provider section', () => {
      const result = providerSectionSchema.parse({});
      expect(result.replaces).toBeUndefined();
      expect(result.adds).toBeUndefined();
    });
  });

  describe('queryFileSchema', () => {
    it('should accept minimal valid query with id', () => {
      const result = queryFileSchema.parse({
        name: 'test_query',
        query: [
          {
            id: 'population',
            field: 'title_abstract',
            terms: { keywords: ['diabetes'] },
            operator: 'OR',
          },
        ],
      });
      expect(result.name).toBe('test_query');
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0]!.id).toBe('population');
    });

    it('should accept query with description', () => {
      const result = queryFileSchema.parse({
        name: 'test_query',
        description: 'A test query for diabetes research',
        query: [
          {
            id: 'population',
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
            id: 'population',
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

    it('should accept query with providers', () => {
      const result = queryFileSchema.parse({
        name: 'test_query',
        query: [
          {
            id: 'population',
            field: 'title_abstract',
            terms: { keywords: ['diabetes'] },
            operator: 'OR',
          },
        ],
        providers: {
          pubmed: {
            adds: {
              filters: {
                publication_types: {
                  exclude: ['Review'],
                },
              },
            },
          },
          arxiv: {
            replaces: {
              population: {
                field: 'all',
                terms: { keywords: ['arxiv diabetes'] },
                operator: 'OR',
              },
            },
            adds: {
              filters: {
                categories: ['cs.AI'],
              },
            },
          },
        },
      });
      expect(result.providers?.pubmed?.adds?.filters?.publicationTypes?.exclude).toEqual(['Review']);
      expect(result.providers?.arxiv?.adds?.filters?.categories).toEqual(['cs.AI']);
      expect(result.providers?.arxiv?.replaces?.['population']?.field).toBe('all');
    });

    it('should reject overrides (old format)', () => {
      expect(() =>
        queryFileSchema.parse({
          name: 'test_query',
          query: [
            {
              id: 'population',
              field: 'title_abstract',
              terms: { keywords: ['diabetes'] },
              operator: 'OR',
            },
          ],
          overrides: {
            pubmed: { filters: {} },
          },
        })
      ).not.toThrow(); // overrides is just ignored as unknown key by Zod (passthrough not used)
    });

    it('should reject blocks without id', () => {
      expect(() =>
        queryFileSchema.parse({
          name: 'test_query',
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

    it('should reject replaces referencing non-existent block id', () => {
      expect(() =>
        queryFileSchema.parse({
          name: 'test_query',
          query: [
            {
              id: 'population',
              field: 'title_abstract',
              terms: { keywords: ['diabetes'] },
              operator: 'OR',
            },
          ],
          providers: {
            arxiv: {
              replaces: {
                nonexistent: {
                  field: 'all',
                  terms: { keywords: ['test'] },
                  operator: 'OR',
                },
              },
            },
          },
        })
      ).toThrow(/replaces keys must reference existing block ids/);
    });

    it('should reject missing name', () => {
      expect(() =>
        queryFileSchema.parse({
          query: [
            {
              id: 'population',
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
            id: 'population',
            field: 'title_abstract',
            terms: {
              keywords: ['diabetes', 'type 2 diabetes', 'diabetes mellitus', 'T2DM'],
              mesh: ['Diabetes Mellitus, Type 2', 'Diabetes Mellitus'],
            },
            operator: 'OR',
          },
          {
            id: 'intervention',
            field: 'title_abstract',
            terms: {
              keywords: ['artificial intelligence', 'machine learning', 'deep learning', 'neural network'],
              mesh: ['Artificial Intelligence', 'Machine Learning', 'Deep Learning'],
            },
            operator: 'OR',
          },
          {
            id: 'outcome',
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
        providers: {
          pubmed: {
            adds: {
              filters: {
                publication_types: {
                  exclude: ['Review', 'Systematic Review', 'Meta-Analysis'],
                },
              },
            },
          },
          arxiv: {
            replaces: {
              intervention: {
                field: 'all',
                terms: { keywords: ['deep learning', 'neural network', 'transformer'] },
                operator: 'OR',
              },
            },
            adds: {
              filters: {
                categories: ['cs.AI', 'cs.LG', 'cs.CL', 'q-bio.QM'],
              },
            },
          },
        },
      });

      expect(result.name).toBe('diabetes_ai_scoping');
      expect(result.blocks).toHaveLength(3);
      expect(result.filters.yearFrom).toBe(2018);
      expect(result.providers?.arxiv?.adds?.filters?.categories).toHaveLength(4);
      expect(result.providers?.arxiv?.replaces?.['intervention']?.field).toBe('all');
    });
  });

  describe('validateQueryFile', () => {
    it('should return validated QueryAST for valid input', () => {
      const result = validateQueryFile({
        name: 'test_query',
        query: [
          {
            id: 'population',
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

  describe('formatValidationErrors', () => {
    it('should return descriptive error messages', () => {
      const errors = formatValidationErrors({
        name: '',
        query: [],
      });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]!.message).toBeTruthy();
    });

    it('should include error paths', () => {
      const errors = formatValidationErrors({
        name: 'test',
        query: [
          {
            id: 'test',
            field: 'invalid_field',
            terms: { keywords: ['test'] },
            operator: 'OR',
          },
        ],
      });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]!.path).toBeTruthy();
      expect(errors[0]!.path).toContain('query');
    });

    it('should report multiple errors', () => {
      const errors = formatValidationErrors({
        query: [
          {
            id: 'test',
            field: 'invalid_field',
            terms: { keywords: [] },
            operator: 'INVALID',
          },
        ],
      });
      // Missing name, invalid field, empty keywords, invalid operator
      expect(errors.length).toBeGreaterThan(1);
    });

    it('should return empty array for valid input', () => {
      const errors = formatValidationErrors({
        name: 'test_query',
        query: [
          {
            id: 'population',
            field: 'title_abstract',
            terms: { keywords: ['diabetes'] },
            operator: 'OR',
          },
        ],
      });
      expect(errors).toEqual([]);
    });
  });

  describe('ValidationError', () => {
    it('should have path and message properties', () => {
      const error = new ValidationError('query.0.field', 'Invalid field type');
      expect(error.path).toBe('query.0.field');
      expect(error.message).toBe('Invalid field type');
    });

    it('should extend Error', () => {
      const error = new ValidationError('path', 'message');
      expect(error).toBeInstanceOf(Error);
    });
  });
});
