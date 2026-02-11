/**
 * Query validate command implementation.
 *
 * Validates a YAML query file and reports any errors.
 * Optionally validates controlled vocabulary terms (MeSH, ERIC, Emtree) against external APIs.
 */
import { readFile } from 'node:fs/promises';
import { parseQueryString, ValidationError } from '../../../query/index.js';
import { ZodError } from 'zod';
import type { MeSHLookupClient } from '../../../query/mesh-lookup.js';
import type { QueryAST } from '../../../query/types.js';
import {
  extractControlledVocabTerms,
  validateControlledVocab,
  type CountVocabValidator,
  type VocabValidationResult,
} from '../../../query/vocab-validator.js';

/**
 * Result of query validation.
 */
export interface ValidateResult {
  /** Whether validation succeeded */
  success: boolean;
  /** Error messages if validation failed */
  errors?: string[];
  /** Query name (if valid) */
  queryName?: string;
  /** Number of query blocks (if valid) */
  blockCount?: number;
  /** Controlled vocabulary validation results (auto-checked by default) */
  vocabResult?: VocabValidationResult;
}

/**
 * Read and parse a query YAML file.
 *
 * @returns The parsed AST on success, or a ValidateResult with errors on failure.
 */
async function parseQueryFile(
  filePath: string
): Promise<{ ast: QueryAST } | { result: ValidateResult }> {
  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to read file';
    return { result: { success: false, errors: [message] } };
  }

  try {
    const ast = parseQueryString(content);
    return { ast };
  } catch (error) {
    if (error instanceof ZodError) {
      const errors = error.issues.map((e) => {
        const path = e.path.join('.');
        return path ? `${path}: ${e.message}` : e.message;
      });
      return { result: { success: false, errors } };
    }

    if (error instanceof ValidationError) {
      return { result: { success: false, errors: [error.message] } };
    }

    const message =
      error instanceof Error ? error.message : 'Unknown validation error';
    return { result: { success: false, errors: [message] } };
  }
}

/**
 * Validate a query YAML file.
 *
 * @param filePath - Path to the query file
 * @returns Validation result
 */
export async function validateQueryCommand(
  filePath: string,
  options?: {
    meshClient?: MeSHLookupClient;
    noVocab?: boolean;
    countValidators?: CountVocabValidator[];
  }
): Promise<ValidateResult> {
  const parsed = await parseQueryFile(filePath);

  if ('result' in parsed) {
    return parsed.result;
  }

  const result: ValidateResult = {
    success: true,
    queryName: parsed.ast.name,
    blockCount: parsed.ast.blocks.length,
  };

  // Auto-validate vocab when controlled vocab terms exist
  if (options?.meshClient && !options.noVocab) {
    const terms = extractControlledVocabTerms(parsed.ast);
    if (terms.length > 0) {
      result.vocabResult = await validateControlledVocab(
        parsed.ast,
        options.meshClient,
        options.countValidators ? { countValidators: options.countValidators } : undefined
      );
    }
  }

  return result;
}

/**
 * Format validation result for display.
 */
export function formatValidateResult(
  result: ValidateResult,
  filePath: string
): string {
  if (result.success) {
    const lines = [
      `✓ Valid query file: ${filePath}`,
      `  Name: ${result.queryName}`,
      `  Blocks: ${result.blockCount}`,
    ];
    return lines.join('\n');
  }

  const lines = [`✗ Invalid query file: ${filePath}`, '', 'Errors:'];
  if (result.errors) {
    for (const error of result.errors) {
      lines.push(`  - ${error}`);
    }
  }
  return lines.join('\n');
}

/**
 * Check if a validation result contains invalid controlled vocabulary terms.
 */
export function hasVocabErrors(result: ValidateResult): boolean {
  return (result.vocabResult?.invalid.length ?? 0) > 0;
}

/**
 * Detect whether a YAML file has a yaml-language-server $schema comment
 * in its first 5 lines.
 */
export async function detectSchemaLink(filePath: string): Promise<boolean> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n').slice(0, 5);
    return lines.some((line) => /yaml-language-server.*\$schema=/.test(line));
  } catch {
    return false;
  }
}

/**
 * Format controlled vocabulary validation results for display.
 */
export function formatVocabValidationOutput(
  result: VocabValidationResult
): string {
  if (
    result.valid.length === 0 &&
    result.invalid.length === 0 &&
    result.errors.length === 0
  ) {
    return '';
  }

  const lines: string[] = ['', 'Controlled vocabulary:'];

  for (const item of result.valid) {
    lines.push(`  ✓ ${item.vocabulary}: "${item.term}"`);
  }

  for (const item of result.invalid) {
    lines.push(`  ✗ ${item.vocabulary}: "${item.term}" — not found`);
    if (item.suggestions && item.suggestions.length > 0) {
      lines.push(
        `    Did you mean: ${item.suggestions.map((s) => `"${s}"`).join(', ')}`
      );
    }
  }

  for (const item of result.errors) {
    lines.push(`  ⚠ ${item.vocabulary}: "${item.term}" — ${item.error}`);
  }

  return lines.join('\n');
}
