/**
 * Query Resolution Layer
 *
 * Resolves provider-specific blocks and filters from a QueryAST,
 * producing a flat ResolvedAST suitable for translation.
 */

import { checkProviderSection } from './provider-section-checks.js';
import type { Filters, ProviderName, QueryAST, QueryBlock, ResolvedAST } from './types.js';

/**
 * Deep-merge override filters into base filters.
 * - Scalars: override replaces base
 * - Arrays: override replaces base
 * - Objects (publicationTypes): deep-merge recursively
 */
function deepMergeFilters(base: Filters, override: Partial<Filters>): Filters {
  const result: Filters = { ...base };

  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;

    const k = key as keyof Filters;

    if (k === 'publicationTypes' && typeof value === 'object' && !Array.isArray(value)) {
      // Deep-merge publicationTypes
      result.publicationTypes = {
        ...base.publicationTypes,
        ...value,
      };
    } else {
      // Scalars and arrays: override replaces
      (result as Record<string, unknown>)[k] = value;
    }
  }

  return result;
}

/**
 * Resolve a QueryAST for a specific provider.
 *
 * Applies provider-specific block omissions, replacements and filter additions,
 * returning a flat ResolvedAST with no provider sections.
 *
 * @param ast - The full QueryAST with optional providers section
 * @param provider - The target provider name
 * @returns A ResolvedAST with replacements applied and filters merged
 * @throws Error if replaces/omits reference a non-existent block id, a block is both
 *   replaced and omitted, omits contains duplicates, or omits would remove all blocks
 */
export function resolveForProvider(ast: QueryAST, provider: ProviderName): ResolvedAST {
  const section = ast.providers[provider];

  // No provider section — return defaults
  if (!section) {
    return {
      name: ast.name,
      description: ast.description,
      blocks: ast.blocks.map((b) => structuredClone(b)),
      filters: structuredClone(ast.filters),
    };
  }

  const issues = checkProviderSection(
    ast.blocks.map((b) => b.id),
    provider,
    section,
  );
  if (issues.length > 0) {
    throw new Error(issues.map((i) => i.message).join('; '));
  }

  // Apply block omissions and replacements (block order preserved)
  const omitted = new Set(section.omits ?? []);
  const blocks: QueryBlock[] = ast.blocks
    .filter((block) => !omitted.has(block.id))
    .map((block) => {
      const replacement = section.replaces?.[block.id];
      if (replacement) {
        return { id: block.id, ...structuredClone(replacement) };
      }
      return structuredClone(block);
    });

  // Apply filter additions
  let filters: Filters;
  if (section.adds?.filters) {
    filters = deepMergeFilters(ast.filters, section.adds.filters);
  } else {
    filters = structuredClone(ast.filters);
  }

  return {
    name: ast.name,
    description: ast.description,
    blocks,
    filters,
  };
}
