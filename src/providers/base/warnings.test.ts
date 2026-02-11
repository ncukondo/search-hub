/**
 * Unsupported controlled vocabulary warnings tests.
 */
import { describe, it, expect } from 'vitest';
import { collectUnsupportedVocabWarnings } from './warnings';
import type { QueryBlock } from '../../query/types';

describe('collectUnsupportedVocabWarnings', () => {
  it('should warn when arXiv block contains mesh terms', () => {
    const blocks: QueryBlock[] = [
      {
        field: 'title_abstract',
        terms: { mesh: ['Artificial Intelligence'] },
        operator: 'OR',
      },
    ];

    const warnings = collectUnsupportedVocabWarnings(blocks, 'arXiv', new Set());
    expect(warnings).toContainEqual(
      'arXiv does not support MeSH terms — mesh terms in block 1 will be ignored'
    );
  });

  it('should warn when arXiv block contains keywords + mesh', () => {
    const blocks: QueryBlock[] = [
      {
        field: 'title_abstract',
        terms: { keywords: ['diabetes'], mesh: ['Diabetes Mellitus'] },
        operator: 'OR',
      },
    ];

    const warnings = collectUnsupportedVocabWarnings(blocks, 'arXiv', new Set());
    expect(warnings).toContainEqual(
      'arXiv does not support MeSH terms — mesh terms in block 1 will be ignored'
    );
  });

  it('should warn when Scopus block contains mesh terms', () => {
    const blocks: QueryBlock[] = [
      {
        field: 'title_abstract',
        terms: { mesh: ['Neoplasms'] },
        operator: 'OR',
      },
    ];

    const warnings = collectUnsupportedVocabWarnings(blocks, 'Scopus', new Set(['emtree']));
    expect(warnings).toContainEqual(
      'Scopus does not support MeSH terms — mesh terms in block 1 will be ignored'
    );
  });

  it('should warn when PubMed block contains emtree terms', () => {
    const blocks: QueryBlock[] = [
      {
        field: 'title_abstract',
        terms: { emtree: ['Diabetes Mellitus'] },
        operator: 'OR',
      },
    ];

    const warnings = collectUnsupportedVocabWarnings(blocks, 'PubMed', new Set(['mesh']));
    expect(warnings).toContainEqual(
      'PubMed does not support Emtree terms — emtree terms in block 1 will be ignored'
    );
  });

  it('should not warn when PubMed block contains mesh terms (supported)', () => {
    const blocks: QueryBlock[] = [
      {
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
        field: 'title_abstract',
        terms: { keywords: ['diabetes'] },
        operator: 'OR',
      },
      {
        field: 'title_abstract',
        terms: { emtree: ['Diabetes Mellitus'] },
        operator: 'OR',
      },
    ];

    const warnings = collectUnsupportedVocabWarnings(blocks, 'ERIC', new Set(['eric']));
    expect(warnings).toContainEqual(
      'ERIC does not support Emtree terms — emtree terms in block 2 will be ignored'
    );
  });

  it('should not warn for keywords-only blocks', () => {
    const blocks: QueryBlock[] = [
      {
        field: 'title_abstract',
        terms: { keywords: ['diabetes'] },
        operator: 'OR',
      },
    ];

    const warnings = collectUnsupportedVocabWarnings(blocks, 'arXiv', new Set());
    expect(warnings).toHaveLength(0);
  });
});
