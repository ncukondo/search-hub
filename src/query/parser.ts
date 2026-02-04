/**
 * Query YAML Parser
 *
 * Parses YAML query files into validated QueryAST.
 * See spec/models/query-dsl.md for the full specification.
 */

import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import type { QueryAST } from './types.js';
import { validateQueryFile } from './validator.js';

/**
 * Parse a YAML string into a validated QueryAST.
 *
 * @param yaml - YAML string to parse
 * @returns Validated QueryAST
 * @throws Error if YAML is invalid or doesn't match schema
 */
export function parseQueryString(yaml: string): QueryAST {
  const data = parse(yaml);
  return validateQueryFile(data);
}

/**
 * Parse a YAML file into a validated QueryAST.
 *
 * @param filePath - Path to the YAML file
 * @returns Promise resolving to validated QueryAST
 * @throws Error if file doesn't exist, YAML is invalid, or doesn't match schema
 */
export async function parseQueryFile(filePath: string): Promise<QueryAST> {
  const content = await readFile(filePath, 'utf-8');
  return parseQueryString(content);
}


/**
 * Detect short keywords (potential acronyms) in a query.
 *
 * Short keywords (3 characters or fewer by default) may match unrelated
 * acronyms in different fields, producing noisy results.
 *
 * @param ast - Parsed QueryAST
 * @param threshold - Maximum length to consider "short" (default: 3)
 * @returns Array of unique short keywords found
 */
export function detectShortKeywords(ast: QueryAST, threshold = 3): string[] {
  const shortKeywords = new Set<string>();

  for (const block of ast.blocks) {
    for (const keyword of block.terms.keywords) {
      if (keyword.length <= threshold) {
        shortKeywords.add(keyword);
      }
    }
  }

  return Array.from(shortKeywords);
}
