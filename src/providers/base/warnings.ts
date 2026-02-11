/**
 * Unsupported controlled vocabulary warnings.
 *
 * Generates warnings when query blocks contain controlled vocabulary
 * terms that the target provider does not support.
 */

import type { QueryBlock } from '../../query/types';

/** Controlled vocabulary types that can appear in a TermBlock */
type VocabType = 'mesh' | 'emtree' | 'eric';

/** Human-readable names for controlled vocabulary types */
const VOCAB_DISPLAY_NAMES: Record<VocabType, string> = {
  mesh: 'MeSH',
  emtree: 'Emtree',
  eric: 'ERIC descriptor',
};

/**
 * Collect warnings for unsupported controlled vocabulary in query blocks.
 *
 * @param blocks - Query blocks to check
 * @param providerDisplayName - Display name of the provider (e.g., "arXiv", "Scopus")
 * @param supportedVocab - Set of controlled vocabulary types this provider supports
 * @returns Array of warning messages
 */
export function collectUnsupportedVocabWarnings(
  blocks: QueryBlock[],
  providerDisplayName: string,
  supportedVocab: ReadonlySet<VocabType>
): string[] {
  const warnings: string[] = [];
  const vocabTypes: VocabType[] = ['mesh', 'emtree', 'eric'];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    const hasKeywords = block.terms.keywords && block.terms.keywords.length > 0;
    for (const vocab of vocabTypes) {
      if (!supportedVocab.has(vocab) && block.terms[vocab] && block.terms[vocab].length > 0) {
        const displayName = VOCAB_DISPLAY_NAMES[vocab];
        const blockNum = i + 1;
        if (hasKeywords) {
          warnings.push(
            `${providerDisplayName}: ${displayName} terms in block ${blockNum} ignored (not supported) — keywords still searched`
          );
        } else {
          warnings.push(
            `${providerDisplayName}: block ${blockNum} skipped (contains only ${displayName} terms, not supported)`
          );
        }
      }
    }
  }

  return warnings;
}
