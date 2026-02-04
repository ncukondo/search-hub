import { describe, it, expect } from 'vitest';
import type {
  FieldType,
  TermBlock,
  QueryBlock,
  Filters,
  OverrideBlock,
  QueryAST,
  ProviderName,
} from './types.js';

describe('Query AST Types', () => {
  describe('FieldType', () => {
    it('should accept valid field types', () => {
      const fields: FieldType[] = [
        'title',
        'abstract',
        'title_abstract',
        'author',
        'keyword',
        'all',
      ];
      expect(fields).toHaveLength(6);
    });
  });

  describe('TermBlock', () => {
    it('should accept keywords only', () => {
      const terms: TermBlock = {
        keywords: ['diabetes', 'type 2 diabetes'],
      };
      expect(terms.keywords).toHaveLength(2);
    });

    it('should accept keywords with mesh terms', () => {
      const terms: TermBlock = {
        keywords: ['diabetes'],
        mesh: ['Diabetes Mellitus, Type 2'],
      };
      expect(terms.mesh).toHaveLength(1);
    });

    it('should accept all vocabulary types', () => {
      const terms: TermBlock = {
        keywords: ['diabetes'],
        mesh: ['Diabetes Mellitus, Type 2'],
        emtree: ['non insulin dependent diabetes mellitus'],
      };
      expect(terms.emtree).toHaveLength(1);
    });

    it('should accept exclude terms', () => {
      const terms: TermBlock = {
        keywords: ['EPA', 'entrustable professional activities'],
        exclude: ['environmental protection', 'pollution'],
      };
      expect(terms.exclude).toHaveLength(2);
    });

    it('should accept keywords with both mesh and exclude', () => {
      const terms: TermBlock = {
        keywords: ['diabetes'],
        mesh: ['Diabetes Mellitus, Type 2'],
        exclude: ['animal', 'mice'],
      };
      expect(terms.keywords).toHaveLength(1);
      expect(terms.mesh).toHaveLength(1);
      expect(terms.exclude).toHaveLength(2);
    });

    it('should accept eric descriptors', () => {
      const terms: TermBlock = {
        keywords: ['medical education'],
        eric: ['Medical Education', 'Clinical Experience'],
      };
      expect(terms.eric).toHaveLength(2);
    });

    it('should accept all vocabulary types including eric', () => {
      const terms: TermBlock = {
        keywords: ['education'],
        mesh: ['Education, Medical'],
        emtree: ['medical education'],
        eric: ['Medical Education'],
        exclude: ['veterinary'],
      };
      expect(terms.keywords).toHaveLength(1);
      expect(terms.mesh).toHaveLength(1);
      expect(terms.emtree).toHaveLength(1);
      expect(terms.eric).toHaveLength(1);
      expect(terms.exclude).toHaveLength(1);
    });
  });

  describe('QueryBlock', () => {
    it('should require field, terms, and operator', () => {
      const block: QueryBlock = {
        field: 'title_abstract',
        terms: {
          keywords: ['AI', 'machine learning'],
        },
        operator: 'OR',
      };
      expect(block.operator).toBe('OR');
    });

    it('should accept AND operator', () => {
      const block: QueryBlock = {
        field: 'title',
        terms: { keywords: ['test'] },
        operator: 'AND',
      };
      expect(block.operator).toBe('AND');
    });
  });

  describe('Filters', () => {
    it('should accept year range', () => {
      const filters: Filters = {
        yearFrom: 2020,
        yearTo: 2024,
      };
      expect(filters.yearFrom).toBe(2020);
    });

    it('should accept languages', () => {
      const filters: Filters = {
        languages: ['en', 'ja'],
      };
      expect(filters.languages).toHaveLength(2);
    });

    it('should accept publication type filters', () => {
      const filters: Filters = {
        publicationTypes: {
          include: ['Journal Article'],
          exclude: ['Review', 'Meta-Analysis'],
        },
      };
      expect(filters.publicationTypes?.include).toHaveLength(1);
      expect(filters.publicationTypes?.exclude).toHaveLength(2);
    });

    it('should accept empty filters', () => {
      const filters: Filters = {};
      expect(Object.keys(filters)).toHaveLength(0);
    });
  });

  describe('OverrideBlock', () => {
    it('should accept filters override', () => {
      const override: OverrideBlock = {
        filters: {
          publicationTypes: {
            exclude: ['Comment', 'Letter'],
          },
        },
      };
      expect(override.filters?.publicationTypes?.exclude).toHaveLength(2);
    });

    it('should accept arxiv categories', () => {
      const override: OverrideBlock = {
        categories: ['cs.AI', 'cs.LG', 'q-bio'],
      };
      expect(override.categories).toHaveLength(3);
    });

    it('should accept scopus source types', () => {
      const override: OverrideBlock = {
        sourceTypes: ['journal', 'conference'],
      };
      expect(override.sourceTypes).toHaveLength(2);
    });
  });

  describe('ProviderName', () => {
    it('should accept valid provider names', () => {
      const providers: ProviderName[] = [
        'pubmed',
        'scopus',
        'eric',
        'arxiv',
        'wos',
        'embase',
      ];
      expect(providers).toHaveLength(6);
    });
  });

  describe('QueryAST', () => {
    it('should require name and blocks', () => {
      const ast: QueryAST = {
        name: 'test_query',
        blocks: [
          {
            field: 'title_abstract',
            terms: { keywords: ['diabetes'] },
            operator: 'OR',
          },
        ],
        filters: {},
        overrides: {},
      };
      expect(ast.name).toBe('test_query');
      expect(ast.blocks).toHaveLength(1);
    });

    it('should accept optional description', () => {
      const ast: QueryAST = {
        name: 'test_query',
        description: 'A test query for diabetes research',
        blocks: [],
        filters: {},
        overrides: {},
      };
      expect(ast.description).toBe('A test query for diabetes research');
    });

    it('should accept complete QueryAST with all fields', () => {
      const ast: QueryAST = {
        name: 'diabetes_ai_scoping',
        description: 'AI applications in Type 2 Diabetes management',
        blocks: [
          {
            field: 'title_abstract',
            terms: {
              keywords: ['diabetes', 'type 2 diabetes'],
              mesh: ['Diabetes Mellitus, Type 2'],
            },
            operator: 'OR',
          },
          {
            field: 'title_abstract',
            terms: {
              keywords: ['artificial intelligence', 'machine learning'],
            },
            operator: 'OR',
          },
        ],
        filters: {
          yearFrom: 2018,
          yearTo: 2024,
          languages: ['en'],
        },
        overrides: {
          pubmed: {
            filters: {
              publicationTypes: {
                exclude: ['Review', 'Systematic Review'],
              },
            },
          },
          arxiv: {
            categories: ['cs.AI', 'cs.LG'],
          },
        },
      };

      expect(ast.blocks).toHaveLength(2);
      expect(ast.filters.yearFrom).toBe(2018);
      expect(ast.overrides.pubmed?.filters?.publicationTypes?.exclude).toContain('Review');
      expect(ast.overrides.arxiv?.categories).toContain('cs.AI');
    });
  });
});
