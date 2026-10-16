/**
 * Cross-validation of provider sections against the query's blocks.
 *
 * Shared by the zod validator and the resolution layer so both report
 * the same errors for invalid `replaces` / `omits` usage.
 */

import type { ProviderSection } from './types.js';

/**
 * A single provider-section problem.
 * `key` is the offending action key, used as the error path suffix.
 */
export interface ProviderSectionIssue {
  key: 'replaces' | 'omits';
  message: string;
}

/**
 * Check a provider section's `replaces` and `omits` against the block ids.
 *
 * @param blockIds - Block ids of the query, in order
 * @param provider - Provider name (used in messages)
 * @param section - The provider section to check
 * @returns Issues found (empty when valid)
 */
export function checkProviderSection(
  blockIds: readonly string[],
  provider: string,
  section: Pick<ProviderSection, 'replaces' | 'omits'>,
): ProviderSectionIssue[] {
  const issues: ProviderSectionIssue[] = [];
  const known = new Set(blockIds);

  for (const key of Object.keys(section.replaces ?? {})) {
    if (!known.has(key)) {
      issues.push({
        key: 'replaces',
        message: `replaces keys must reference existing block ids: providers.${provider}.replaces references non-existent block id "${key}"`,
      });
    }
  }

  const omits = section.omits;
  if (!omits) return issues;

  const seen = new Set<string>();
  for (const id of omits) {
    if (seen.has(id)) {
      issues.push({
        key: 'omits',
        message: `providers.${provider}.omits contains duplicate block id "${id}"`,
      });
      continue;
    }
    seen.add(id);
    if (!known.has(id)) {
      issues.push({
        key: 'omits',
        message: `providers.${provider}.omits references non-existent block id "${id}"`,
      });
    } else if (section.replaces && id in section.replaces) {
      issues.push({
        key: 'omits',
        message: `providers.${provider}: block id "${id}" cannot appear in both replaces and omits`,
      });
    }
  }

  if (blockIds.length > 0 && blockIds.every((id) => seen.has(id))) {
    issues.push({
      key: 'omits',
      message: `providers.${provider}.omits removes all blocks; at least one block must remain`,
    });
  }

  return issues;
}
