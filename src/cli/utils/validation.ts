/**
 * CLI validation utilities.
 */
import type { ProviderName } from '../../providers/base/types.js';

/**
 * Currently implemented providers available at runtime.
 *
 * Note: The ProviderName type in `providers/base/types.ts` includes
 * additional providers ('wos', 'embase') that are planned but not yet
 * implemented. This constant only includes providers that have working
 * implementations and can be used in CLI commands.
 *
 * When adding a new provider implementation:
 * 1. Implement the provider in `src/providers/{name}/`
 * 2. Add it to this list to make it available via CLI
 */
const VALID_PROVIDERS: readonly ProviderName[] = ['pubmed', 'eric', 'arxiv', 'scopus'];

/**
 * Check if a string is a valid provider name.
 */
export function isValidProviderName(value: string): value is ProviderName {
  return VALID_PROVIDERS.includes(value as ProviderName);
}

/**
 * Parse a comma-separated string of provider names with validation.
 *
 * @param input - Comma-separated provider names (e.g., "pubmed,eric")
 * @returns Array of validated ProviderName values
 * @throws Error if any provider name is invalid
 */
export function parseProviderNames(input: string): ProviderName[] {
  const names = input.split(',').map((p) => p.trim().toLowerCase());
  const invalid = names.filter((n) => !isValidProviderName(n));
  if (invalid.length > 0) {
    throw new Error(
      `Invalid provider(s): ${invalid.join(', ')}. Valid: ${VALID_PROVIDERS.join(', ')}`,
    );
  }
  return names as ProviderName[];
}

/**
 * Get list of valid provider names.
 */
export function getValidProviders(): readonly ProviderName[] {
  return VALID_PROVIDERS;
}
