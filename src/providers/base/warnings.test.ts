/**
 * Unsupported controlled vocabulary warnings tests.
 */
import { describe, it, expect } from 'vitest';
import { collectUnsupportedVocabWarnings } from './warnings';
import type { QueryBlock } from '../../query/types';

describe('collectUnsupportedVocabWarnings', () => {
  it('should warn (skipped) when arXiv block contains only mesh terms', () => {
    const blocks: QueryBlock[] = [
      {
        id: 'block-1',
        field: 'title_abstract',
        terms: { mesh: ['Artificial Intelligence'] },
        operator: 'OR',
      },
    ];

    const warnings = collectUnsupportedVocabWarnings(blocks, 'arXiv', new Set());
    expect(warnings).toContainEqual(
      'arXiv: block 1 skipped (contains only MeSH terms, not supported)'
    );
  });

  it('should warn (ignored) when arXiv block contains keywords + mesh', () => {
    const blocks: QueryBlock[] = [
      {
        id: 'block-1',
        field: 'title_abstract',
        terms: { keywords: ['diabetes'], mesh: ['Diabetes Mellitus'] },
        operator: 'OR',
      },
    ];

    const warnings = collectUnsupportedVocabWarnings(blocks, 'arXiv', new Set());
    expect(warnings).toContainEqual(
      'arXiv: MeSH terms in block 1 ignored (not supported) — keywords still searched'
    );
  });

  it('should warn (skipped) when Scopus block contains only mesh terms', () => {
    const blocks: QueryBlock[] = [
      {
        id: 'block-1',
        field: 'title_abstract',
        terms: { mesh: ['Neoplasms'] },
        operator: 'OR',
      },
    ];

    const warnings = collectUnsupportedVocabWarnings(blocks, 'Scopus', new Set(['emtree']));
    expect(warnings).toContainEqual(
      'Scopus: block 1 skipped (contains only MeSH terms, not supported)'
    );
  });

  it('should warn (skipped) when PubMed block contains only emtree terms', () => {
    const blocks: QueryBlock[] = [
      {
        id: 'block-1',
        field: 'title_abstract',
        terms: { emtree: ['Diabetes Mellitus'] },
        operator: 'OR',
      },
    ];

    const warnings = collectUnsupportedVocabWarnings(blocks, 'PubMed', new Set(['mesh']));
    expect(warnings).toContainEqual(
      'PubMed: block 1 skipped (contains only Emtree terms, not supported)'
    );
  });

  it('should not warn when PubMed block contains mesh terms (supported)', () => {
    const blocks: QueryBlock[] = [
      {
        id: 'block-1',
        field: 'title_abstract',
        terms: { mesh: ['Diabetes Mellitus'] },
        operator: 'OR',
      },
    ];

    const warnings = collectUnsupportedVocabWarnings(blocks, 'PubMed', new Set(['mesh']));
    expect(warnings).toHaveLength(0);
  });

  it('should not warn when Scopus block contains emtree terms (supported)', () => {
    const blocks: QueryBlock[] = [
      {
        id: 'block-1',
        field: 'title_abstract',
        terms: { emtree: ['Diabetes Mellitus'] },
        operator: 'OR',
      },
    ];

    const warnings = collectUnsupportedVocabWarnings(blocks, 'Scopus', new Set(['emtree']));
    expect(warnings).toHaveLength(0);
  });

  it('should not warn when ERIC block contains eric terms (supported)', () => {
    const blocks: QueryBlock[] = [
      {
        id: 'block-1',
        field: 'title_abstract',
        terms: { eric: ['Medical Education'] },
        operator: 'OR',
      },
    ];

    const warnings = collectUnsupportedVocabWarnings(blocks, 'ERIC', new Set(['eric']));
    expect(warnings).toHaveLength(0);
  });

  it('should report correct block number for multiple blocks', () => {
    const blocks: QueryBlock[] = [
      {
        id: 'block-1',
        field: 'title_abstract',
        terms: { keywords: ['diabetes'] },
        operator: 'OR',
      },
      {
        id: 'block-2',
        field: 'title_abstract',
        terms: { emtree: ['Diabetes Mellitus'] },
        operator: 'OR',
      },
    ];

    const warnings = collectUnsupportedVocabWarnings(blocks, 'ERIC', new Set(['eric']));
    expect(warnings).toContainEqual(
      'ERIC: block 2 skipped (contains only Emtree terms, not supported)'
    );
  });

  it('should not warn for keywords-only blocks', () => {
    const blocks: QueryBlock[] = [
      {
        id: 'block-1',
        field: 'title_abstract',
        terms: { keywords: ['diabetes'] },
        operator: 'OR',
      },
    ];

    const warnings = collectUnsupportedVocabWarnings(blocks, 'arXiv', new Set());
    expect(warnings).toHaveLength(0);
  });
});
