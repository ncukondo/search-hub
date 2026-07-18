import { describe, it, expect } from 'vitest';
import type {
  FieldType,
  TermBlock,
  QueryBlock,
  Filters,
  ProviderSection,
  QueryAST,
  ResolvedAST,
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
    it('should require field, terms, operator, and id', () => {
      const block: QueryBlock = {
        id: 'population',
        field: 'title_abstract',
        terms: {
          keywords: ['AI', 'machine learning'],
        },
        operator: 'OR',
      };
      expect(block.operator).toBe('OR');
      expect(block.id).toBe('population');
    });

    it('should accept AND operator', () => {
      const block: QueryBlock = {
        id: 'intervention',
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

    it('should accept categories (arXiv)', () => {
      const filters: Filters = {
        categories: ['cs.AI', 'cs.LG', 'q-bio'],
      };
      expect(filters.categories).toHaveLength(3);
    });

    it('should accept sourceTypes (Scopus)', () => {
      const filters: Filters = {
        sourceTypes: ['journal', 'conference'],
      };
      expect(filters.sourceTypes).toHaveLength(2);
    });
  });

  describe('ProviderSection', () => {
    it('should accept replaces with block overrides', () => {
      const section: ProviderSection = {
        replaces: {
          population: {
            field: 'all',
            terms: { keywords: ['arxiv-specific terms'] },
            operator: 'OR',
          },
        },
      };
      expect(section.replaces?.['population']).toBeDefined();
      expect(section.replaces?.['population']?.field).toBe('all');
    });

    it('should accept adds with partial filters', () => {
      const section: ProviderSection = {
        adds: {
          filters: {
            categories: ['cs.AI', 'cs.LG'],
          },
        },
      };
      expect(section.adds?.filters?.categories).toHaveLength(2);
    });

    it('should accept both replaces and adds', () => {
      const section: ProviderSection = {
        replaces: {
          intervention: {
            field: 'title_abstract',
            terms: { keywords: ['different terms'] },
            operator: 'OR',
          },
        },
        adds: {
          filters: {
            sourceTypes: ['journal'],
          },
        },
      };
      expect(section.replaces?.['intervention']).toBeDefined();
      expect(section.adds?.filters?.sourceTypes).toHaveLength(1);
    });

    it('should accept empty provider section', () => {
      const section: ProviderSection = {};
      expect(section.replaces).toBeUndefined();
      expect(section.adds).toBeUndefined();
    });
  });

  describe('ProviderName', () => {
    it('should accept valid provider names', () => {
      const providers: ProviderName[] = ['pubmed', 'scopus', 'eric', 'arxiv', 'wos', 'embase'];
      expect(providers).toHaveLength(6);
    });
  });

  describe('QueryAST', () => {
    it('should require name, blocks with ids, and providers', () => {
      const ast: QueryAST = {
        name: 'test_query',
        blocks: [
          {
            id: 'population',
            field: 'title_abstract',
            terms: { keywords: ['diabetes'] },
            operator: 'OR',
          },
        ],
        filters: {},
        providers: {},
      };
      expect(ast.name).toBe('test_query');
      expect(ast.blocks).toHaveLength(1);
      expect(ast.blocks[0]!.id).toBe('population');
    });

    it('should accept optional description', () => {
      const ast: QueryAST = {
        name: 'test_query',
        description: 'A test query for diabetes research',
        blocks: [],
        filters: {},
        providers: {},
      };
      expect(ast.description).toBe('A test query for diabetes research');
    });

    it('should accept complete QueryAST with providers', () => {
      const ast: QueryAST = {
        name: 'diabetes_ai_scoping',
        description: 'AI applications in Type 2 Diabetes management',
        blocks: [
          {
            id: 'population',
            field: 'title_abstract',
            terms: {
              keywords: ['diabetes', 'type 2 diabetes'],
              mesh: ['Diabetes Mellitus, Type 2'],
            },
            operator: 'OR',
          },
          {
            id: 'intervention',
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
        providers: {
          pubmed: {
            adds: {
              filters: {
                publicationTypes: {
                  exclude: ['Review', 'Systematic Review'],
                },
              },
            },
          },
          arxiv: {
            replaces: {
              intervention: {
                field: 'all',
                terms: { keywords: ['deep learning', 'neural network'] },
                operator: 'OR',
              },
            },
            adds: {
              filters: {
                categories: ['cs.AI', 'cs.LG'],
              },
            },
          },
        },
      };

      expect(ast.blocks).toHaveLength(2);
      expect(ast.filters.yearFrom).toBe(2018);
      expect(ast.providers?.pubmed?.adds?.filters?.publicationTypes?.exclude).toContain('Review');
      expect(ast.providers?.arxiv?.adds?.filters?.categories).toContain('cs.AI');
      expect(ast.providers?.arxiv?.replaces?.['intervention']?.field).toBe('all');
    });
  });

  describe('ResolvedAST', () => {
    it('should have blocks and filters but no providers', () => {
      const resolved: ResolvedAST = {
        name: 'test_query',
        blocks: [
          {
            id: 'population',
            field: 'title_abstract',
            terms: { keywords: ['diabetes'] },
            operator: 'OR',
          },
        ],
        filters: {
          yearFrom: 2020,
        },
      };
      expect(resolved.name).toBe('test_query');
      expect(resolved.blocks).toHaveLength(1);
      expect(resolved.filters.yearFrom).toBe(2020);
      // ResolvedAST should not have providers property
      expect('providers' in resolved).toBe(false);
    });

    it('should accept optional description', () => {
      const resolved: ResolvedAST = {
        name: 'test',
        description: 'A resolved query',
        blocks: [],
        filters: {},
      };
      expect(resolved.description).toBe('A resolved query');
    });
  });
});
