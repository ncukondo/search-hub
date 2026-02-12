/**
 * E2E Tests for the resolver pipeline.
 *
 * Tests the full flow: parse YAML → resolve for provider → translate → verify native queries.
 * This validates that the provider-aware DSL works correctly end-to-end.
 */
import { describe, it, expect } from 'vitest';
import { parseQueryString } from './parser.js';
import { resolveForProvider } from './resolver.js';
import { translateQuery as translatePubMed } from '../providers/pubmed/translator.js';
import { translateQuery as translateArXiv } from '../providers/arxiv/translator.js';
import { translateQuery as translateScopus } from '../providers/scopus/translator.js';
import { translateQuery as translateERIC } from '../providers/eric/translator.js';

const YAML_WITH_PROVIDERS = `
name: provider_aware_test
description: "Test query with providers section"

query:
  - id: population
    field: title_abstract
    terms:
      keywords:
        - "diabetes mellitus"
        - "type 2 diabetes"
      mesh:
        - "Diabetes Mellitus, Type 2"
    operator: OR

  - id: intervention
    field: title_abstract
    terms:
      keywords:
        - "metformin"
        - "insulin"
    operator: OR

filters:
  year_from: 2020
  year_to: 2025
  language:
    - en

providers:
  arxiv:
    replaces:
      intervention:
        field: all
        terms:
          keywords:
            - "metformin"
            - "insulin therapy"
        operator: OR
    adds:
      filters:
        categories:
          - q-bio
          - cs.AI

  scopus:
    adds:
      filters:
        source_types:
          - journal

  pubmed:
    adds:
      filters:
        publication_types:
          exclude:
            - "Review"
            - "Comment"
`;

const YAML_WITHOUT_PROVIDERS = `
name: no_providers_test
description: "Test query without providers section"

query:
  - id: concept-1
    field: title_abstract
    terms:
      keywords:
        - "machine learning"
        - "deep learning"
    operator: OR

filters:
  year_from: 2022
`;

describe('resolver E2E pipeline', () => {
  describe('YAML with providers section', () => {
    it('should parse, resolve, and translate for PubMed with filter additions', () => {
      const ast = parseQueryString(YAML_WITH_PROVIDERS);
      const resolved = resolveForProvider(ast, 'pubmed');

      // PubMed should get default blocks (no replacements)
      expect(resolved.blocks).toHaveLength(2);
      expect(resolved.blocks[0]!.id).toBe('population');
      expect(resolved.blocks[0]!.terms.keywords).toContain('diabetes mellitus');
      expect(resolved.blocks[1]!.id).toBe('intervention');
      expect(resolved.blocks[1]!.terms.keywords).toContain('metformin');

      // PubMed should get merged filters with publicationTypes added
      expect(resolved.filters.yearFrom).toBe(2020);
      expect(resolved.filters.publicationTypes?.exclude).toContain('Review');
      expect(resolved.filters.publicationTypes?.exclude).toContain('Comment');

      // Translate and verify native PubMed query
      const translated = translatePubMed(resolved);
      expect(translated.provider).toBe('pubmed');
      expect(translated.native).toContain('[tiab]');
      expect(translated.native).toContain('diabetes mellitus');
      expect(translated.native).toContain('metformin');
      // Publication type exclusion in native query (PubMed lowercases pub types)
      expect(translated.native).toContain('NOT');
      expect(translated.native).toContain('review[pt]');
    });

    it('should resolve arXiv with custom block replacement and categories', () => {
      const ast = parseQueryString(YAML_WITH_PROVIDERS);
      const resolved = resolveForProvider(ast, 'arxiv');

      // arXiv should get population block as-is (no replacement for it)
      expect(resolved.blocks[0]!.id).toBe('population');
      expect(resolved.blocks[0]!.terms.keywords).toContain('diabetes mellitus');

      // arXiv should get replaced intervention block
      expect(resolved.blocks[1]!.id).toBe('intervention');
      expect(resolved.blocks[1]!.field).toBe('all');
      expect(resolved.blocks[1]!.terms.keywords).toContain('insulin therapy');
      // Original "insulin" should be replaced, not merged
      expect(resolved.blocks[1]!.terms.keywords).not.toContain('insulin');

      // arXiv should get categories from adds
      expect(resolved.filters.categories).toContain('q-bio');
      expect(resolved.filters.categories).toContain('cs.AI');

      // Translate and verify native arXiv query
      const translated = translateArXiv(resolved);
      expect(translated.provider).toBe('arxiv');
      expect(translated.native).toContain('diabetes mellitus');
      expect(translated.native).toContain('insulin therapy');
      // Categories should appear in the arXiv query
      expect(translated.native).toContain('cat:q-bio');
      expect(translated.native).toContain('cat:cs.AI');
    });

    it('should resolve Scopus with source type additions', () => {
      const ast = parseQueryString(YAML_WITH_PROVIDERS);
      const resolved = resolveForProvider(ast, 'scopus');

      // Scopus should get default blocks
      expect(resolved.blocks).toHaveLength(2);

      // Scopus should get sourceTypes from adds
      expect(resolved.filters.sourceTypes).toContain('journal');

      // Translate and verify native Scopus query
      const translated = translateScopus(resolved);
      expect(translated.provider).toBe('scopus');
      expect(translated.native).toContain('TITLE-ABS');
      expect(translated.native).toContain('diabetes mellitus');
      // Source type filter
      expect(translated.native).toContain('SRCTYPE');
    });

    it('should resolve ERIC with no provider-specific changes', () => {
      const ast = parseQueryString(YAML_WITH_PROVIDERS);
      const resolved = resolveForProvider(ast, 'eric');

      // ERIC has no providers section — gets defaults
      expect(resolved.blocks).toHaveLength(2);
      expect(resolved.filters.yearFrom).toBe(2020);
      expect(resolved.filters.categories).toBeUndefined();
      expect(resolved.filters.sourceTypes).toBeUndefined();

      // Translate and verify
      const translated = translateERIC(resolved);
      expect(translated.provider).toBe('eric');
      expect(translated.native).toContain('diabetes mellitus');
    });

    it('should give different native queries per provider from same YAML', () => {
      const ast = parseQueryString(YAML_WITH_PROVIDERS);

      const pubmedNative = translatePubMed(resolveForProvider(ast, 'pubmed')).native;
      const arxivNative = translateArXiv(resolveForProvider(ast, 'arxiv')).native;
      const scopusNative = translateScopus(resolveForProvider(ast, 'scopus')).native;
      const ericNative = translateERIC(resolveForProvider(ast, 'eric')).native;

      // All should be different (different syntax, different customizations)
      expect(pubmedNative).not.toBe(arxivNative);
      expect(pubmedNative).not.toBe(scopusNative);
      expect(arxivNative).not.toBe(scopusNative);

      // arXiv should have categories, PubMed should not
      expect(arxivNative).toContain('cat:');
      expect(pubmedNative).not.toContain('cat:');

      // PubMed should have publication type exclusion, ERIC should not
      expect(pubmedNative).toContain('review[pt]');
      expect(ericNative).not.toContain('review[pt]');
    });
  });

  describe('YAML without providers section (backward compat)', () => {
    it('should parse and resolve identically for all providers', () => {
      const ast = parseQueryString(YAML_WITHOUT_PROVIDERS);

      const pubmed = resolveForProvider(ast, 'pubmed');
      const arxiv = resolveForProvider(ast, 'arxiv');
      const scopus = resolveForProvider(ast, 'scopus');
      const eric = resolveForProvider(ast, 'eric');

      // All should get the same blocks and filters
      for (const resolved of [pubmed, arxiv, scopus, eric]) {
        expect(resolved.blocks).toHaveLength(1);
        expect(resolved.blocks[0]!.terms.keywords).toContain('machine learning');
        expect(resolved.filters.yearFrom).toBe(2022);
      }
    });

    it('should translate to valid native queries for all providers', () => {
      const ast = parseQueryString(YAML_WITHOUT_PROVIDERS);

      const pubmed = translatePubMed(resolveForProvider(ast, 'pubmed'));
      const arxiv = translateArXiv(resolveForProvider(ast, 'arxiv'));
      const scopus = translateScopus(resolveForProvider(ast, 'scopus'));
      const eric = translateERIC(resolveForProvider(ast, 'eric'));

      // All should contain the search terms
      for (const result of [pubmed, arxiv, scopus, eric]) {
        expect(result.native).toContain('machine learning');
        expect(result.native).toContain('deep learning');
        expect(result.native.length).toBeGreaterThan(0);
      }
    });
  });

  describe('filter merging verification', () => {
    it('should deep-merge publicationTypes correctly', () => {
      const ast = parseQueryString(YAML_WITH_PROVIDERS);
      const resolved = resolveForProvider(ast, 'pubmed');

      // Base filters should still be present
      expect(resolved.filters.yearFrom).toBe(2020);
      expect(resolved.filters.yearTo).toBe(2025);
      expect(resolved.filters.languages).toContain('en');

      // Added filters should be merged in
      expect(resolved.filters.publicationTypes?.exclude).toEqual(['Review', 'Comment']);
    });

    it('should replace arrays (categories) rather than merge', () => {
      const ast = parseQueryString(YAML_WITH_PROVIDERS);
      const resolved = resolveForProvider(ast, 'arxiv');

      // categories comes entirely from adds (base has no categories)
      expect(resolved.filters.categories).toEqual(['q-bio', 'cs.AI']);
    });
  });
});
