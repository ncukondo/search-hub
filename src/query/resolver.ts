/**
 * Query Resolution Layer
 *
 * Resolves provider-specific blocks and filters from a QueryAST,
 * producing a flat ResolvedAST suitable for translation.
 */

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
 * Applies provider-specific block replacements and filter additions,
 * returning a flat ResolvedAST with no provider sections.
 *
 * @param ast - The full QueryAST with optional providers section
 * @param provider - The target provider name
 * @returns A ResolvedAST with replacements applied and filters merged
 * @throws Error if replaces references a non-existent block id
 */
export function resolveForProvider(ast: QueryAST, provider: ProviderName): ResolvedAST {
  const section = ast.providers?.[provider];

  // No provider section — return defaults
  if (!section) {
    return {
      name: ast.name,
      description: ast.description,
      blocks: ast.blocks.map((b) => ({ ...b })),
      filters: { ...ast.filters },
    };
  }

  // Apply block replacements
  let blocks: QueryBlock[];
  if (section.replaces) {
    const blockIds = new Set(ast.blocks.map((b) => b.id));
    for (const key of Object.keys(section.replaces)) {
      if (!blockIds.has(key)) {
        throw new Error(`replaces references non-existent block id: "${key}"`);
      }
    }

    blocks = ast.blocks.map((block) => {
      const replacement = section.replaces?.[block.id];
      if (replacement) {
        return { id: block.id, ...replacement };
      }
      return { ...block };
    });
  } else {
    blocks = ast.blocks.map((b) => ({ ...b }));
  }

  // Apply filter additions
  let filters: Filters;
  if (section.adds?.filters) {
    filters = deepMergeFilters(ast.filters, section.adds.filters);
  } else {
    filters = { ...ast.filters };
  }

  return {
    name: ast.name,
    description: ast.description,
    blocks,
    filters,
  };
}
