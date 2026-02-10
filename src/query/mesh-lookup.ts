/**
 * MeSH Lookup API client.
 *
 * Validates MeSH (Medical Subject Headings) terms against the NLM MeSH Lookup API.
 * No API key required.
 *
 * API docs: https://id.nlm.nih.gov/mesh/lookup/term
 */

const MESH_LOOKUP_BASE_URL = 'https://id.nlm.nih.gov/mesh/lookup/term';

/**
 * Result of a MeSH term lookup.
 */
export interface MeSHLookupResult {
  /** The term that was looked up */
  term: string;
  /** Whether the term was found as a valid MeSH heading */
  found: boolean;
  /** Suggested terms if the lookup term was not found */
  suggestions?: string[];
}

interface MeSHApiEntry {
  resource: string;
  label: string;
}

/**
 * Client for the NLM MeSH Lookup API.
 */
export class MeSHLookupClient {
  /**
   * Look up a single MeSH term.
   *
   * First tries an exact match. If not found, tries a startswith match
   * to provide suggestions.
   */
  async lookupTerm(term: string): Promise<MeSHLookupResult> {
    // Try exact match first
    const exactResults = await this.fetchLookup(term, 'exact', 1);

    if (exactResults.length > 0) {
      return { term, found: true };
    }

    // Not found — try startswith for suggestions
    const suggestions = await this.fetchLookup(term, 'startswith', 5);

    if (suggestions.length > 0) {
      return {
        term,
        found: false,
        suggestions: suggestions.map((s) => s.label),
      };
    }

    return { term, found: false };
  }

  /**
   * Look up multiple MeSH terms.
   */
  async lookupTerms(terms: string[]): Promise<MeSHLookupResult[]> {
    const results: MeSHLookupResult[] = [];
    for (const term of terms) {
      results.push(await this.lookupTerm(term));
    }
    return results;
  }

  private async fetchLookup(
    label: string,
    match: 'exact' | 'startswith',
    limit: number
  ): Promise<MeSHApiEntry[]> {
    const params = new URLSearchParams({
      label,
      match,
      limit: String(limit),
    });

    const url = `${MESH_LOOKUP_BASE_URL}?${params.toString()}`;

    let response: Response;
    try {
      response = await fetch(url);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`MeSH lookup failed: ${message}`);
    }

    if (!response.ok) {
      throw new Error(
        `MeSH lookup failed: HTTP ${response.status} ${response.statusText}`
      );
    }

    return (await response.json()) as MeSHApiEntry[];
  }
}
