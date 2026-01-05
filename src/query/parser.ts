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
