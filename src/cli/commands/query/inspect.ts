/**
 * Query Inspect Command
 *
 * Visualizes how a query DSL file resolves for each provider,
 * showing which blocks use default vs. custom strategies and
 * which filters are added per provider.
 */

import { readFile } from 'node:fs/promises';
import { parseQueryString } from '../../../query/parser.js';
import type { QueryAST, Filters } from '../../../query/types.js';
import type { ProviderName } from '../../../providers/base/types.js';

/** Provider display names for table headers */
const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  pubmed: 'PubMed',
  eric: 'ERIC',
  arxiv: 'arXiv',
  scopus: 'Scopus',
  wos: 'WoS',
  embase: 'Embase',
};

export interface BlockInspectRow {
  id: string;
  status: Partial<Record<ProviderName, 'default' | 'replaced'>>;
}

export interface FilterInspectRow {
  filterKey: string;
  values: Partial<Record<ProviderName, string>>;
}

export interface InspectResult {
  name: string;
  providers: ProviderName[];
  blocks: BlockInspectRow[];
  addedFilters: FilterInspectRow[];
}

export interface InspectCommandResult {
  success: boolean;
  error?: string;
  result?: InspectResult;
}

/**
 * Default providers to inspect for.
 */
const DEFAULT_PROVIDERS: ProviderName[] = [
  'pubmed',
  'eric',
  'arxiv',
  'scopus',
];

/**
 * Inspect a QueryAST to determine block resolution and filter additions per provider.
 */
export function inspectQuery(
  ast: QueryAST,
  enabledProviders: ProviderName[]
): InspectResult {
  const blocks: BlockInspectRow[] = ast.blocks.map((block) => {
    const status: Partial<Record<ProviderName, 'default' | 'replaced'>> = {};
    for (const provider of enabledProviders) {
      const section = ast.providers[provider];
      if (section?.replaces?.[block.id]) {
        status[provider] = 'replaced';
      } else {
        status[provider] = 'default';
      }
    }
    return { id: block.id, status };
  });

  // Collect added filters across all providers
  const filterKeysSet = new Set<string>();
  for (const provider of enabledProviders) {
    const section = ast.providers[provider];
    if (section?.adds?.filters) {
      for (const key of Object.keys(section.adds.filters)) {
        filterKeysSet.add(key);
      }
    }
  }

  const addedFilters: FilterInspectRow[] = [];
  for (const filterKey of filterKeysSet) {
    const row: FilterInspectRow = { filterKey, values: {} };
    for (const provider of enabledProviders) {
      const section = ast.providers[provider];
      const filterValue = section?.adds?.filters?.[filterKey as keyof Filters];
      if (filterValue !== undefined) {
        row.values[provider] = formatFilterValue(filterValue);
      }
    }
    addedFilters.push(row);
  }

  return {
    name: ast.name,
    providers: enabledProviders,
    blocks,
    addedFilters,
  };
}

/**
 * Format a filter value for display.
 */
function formatFilterValue(value: unknown): string {
  if (Array.isArray(value)) {
    const joined = value.join(', ');
    // Truncate long arrays
    if (joined.length > 20) {
      return joined.substring(0, 17) + '..';
    }
    return joined;
  }
  if (typeof value === 'object' && value !== null) {
    // For publicationTypes: { exclude: ['Review'] } → "-Review"
    const obj = value as Record<string, unknown>;
    const parts: string[] = [];
    if (Array.isArray(obj['include'])) {
      parts.push(...(obj['include'] as string[]));
    }
    if (Array.isArray(obj['exclude'])) {
      parts.push(...(obj['exclude'] as string[]).map((v) => `-${v}`));
    }
    const joined = parts.join(', ');
    if (joined.length > 20) {
      return joined.substring(0, 17) + '..';
    }
    return joined || JSON.stringify(value);
  }
  return String(value);
}

/**
 * Format InspectResult as an aligned table string.
 */
export function formatInspectOutput(result: InspectResult): string {
  const lines: string[] = [];
  lines.push(`Query: ${result.name}`);
  lines.push('');

  const providerHeaders = result.providers.map(
    (p) => PROVIDER_DISPLAY_NAMES[p] || p
  );

  // Block resolution table
  const blockRows = result.blocks.map((block) => [
    block.id,
    ...result.providers.map((p) => block.status[p] || 'default'),
  ]);
  lines.push(
    ...formatTable(['Block', ...providerHeaders], blockRows)
  );

  // Added filters table (only if there are added filters)
  if (result.addedFilters.length > 0) {
    lines.push('');
    const filterRows = result.addedFilters.map((filter) => [
      camelToSnakeCase(filter.filterKey),
      ...result.providers.map((p) => filter.values[p] || '\u2014'),
    ]);
    lines.push(
      ...formatTable(['Added Filters', ...providerHeaders], filterRows)
    );
  }

  return lines.join('\n');
}

/**
 * Convert a camelCase string to snake_case.
 */
function camelToSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Format a table with headers and rows, with Unicode box drawing alignment.
 */
function formatTable(headers: string[], rows: string[][]): string[] {
  const colCount = headers.length;
  const colWidths: number[] = headers.map((h) => h.length);

  // Compute column widths
  for (const row of rows) {
    for (let i = 0; i < colCount; i++) {
      colWidths[i] = Math.max(colWidths[i]!, (row[i] || '').length);
    }
  }

  const lines: string[] = [];

  // Header row
  const headerLine = headers
    .map((h, i) => h.padEnd(colWidths[i]!))
    .join(' \u2502 ');
  lines.push(`  ${headerLine}`);

  // Separator
  const separatorLine = colWidths
    .map((w) => '\u2500'.repeat(w))
    .join('\u2500\u253C\u2500');
  lines.push(`  ${separatorLine}`);

  // Data rows
  for (const row of rows) {
    const rowLine = row
      .map((cell, i) => (cell || '').padEnd(colWidths[i]!))
      .join(' \u2502 ');
    lines.push(`  ${rowLine}`);
  }

  return lines;
}

/**
 * Run the inspect command on a query file.
 */
export async function inspectQueryCommand(
  filePath: string,
  options: { providers?: ProviderName[] } = {}
): Promise<InspectCommandResult> {
  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to read file';
    return { success: false, error: message };
  }

  let ast: QueryAST;
  try {
    ast = parseQueryString(content);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to parse query file';
    return { success: false, error: message };
  }

  const providers = options.providers ?? DEFAULT_PROVIDERS;
  const result = inspectQuery(ast, providers);

  return { success: true, result };
}
