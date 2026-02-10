/**
 * Query validate command implementation.
 *
 * Validates a YAML query file and reports any errors.
 * Optionally validates controlled vocabulary terms (MeSH) against external APIs.
 */
import { readFile } from 'node:fs/promises';
import { parseQueryString, ValidationError } from '../../../query/index.js';
import { ZodError } from 'zod';
import type { MeSHLookupClient } from '../../../query/mesh-lookup.js';
import {
  validateControlledVocab,
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
  /** Controlled vocabulary validation results (when --vocab is used) */
  vocabResult?: VocabValidationResult;
}

/**
 * Validate a query YAML file.
 *
 * @param filePath - Path to the query file
 * @returns Validation result
 */
export async function validateQueryCommand(
  filePath: string
): Promise<ValidateResult> {
  // Read file
  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to read file';
    return {
      success: false,
      errors: [message],
    };
  }

  // Parse and validate using query module
  try {
    const ast = parseQueryString(content);
    return {
      success: true,
      queryName: ast.name,
      blockCount: ast.blocks.length,
    };
  } catch (error) {
    if (error instanceof ZodError) {
      const errors = error.issues.map((e) => {
        const path = e.path.join('.');
        return path ? `${path}: ${e.message}` : e.message;
      });
      return {
        success: false,
        errors,
      };
    }

    if (error instanceof ValidationError) {
      return {
        success: false,
        errors: [error.message],
      };
    }

    // YAML parse error or other error
    const message =
      error instanceof Error ? error.message : 'Unknown validation error';
    return {
      success: false,
      errors: [message],
    };
  }
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
 * Validate a query YAML file with controlled vocabulary checking.
 *
 * First validates the query structure, then validates controlled vocab
 * terms (MeSH) against external APIs.
 */
export async function validateVocabCommand(
  filePath: string,
  meshClient: MeSHLookupClient
): Promise<ValidateResult> {
  // Read file
  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to read file';
    return {
      success: false,
      errors: [message],
    };
  }

  // Parse and validate structure first
  let ast;
  try {
    ast = parseQueryString(content);
  } catch (error) {
    if (error instanceof ZodError) {
      const errors = error.issues.map((e) => {
        const path = e.path.join('.');
        return path ? `${path}: ${e.message}` : e.message;
      });
      return { success: false, errors };
    }

    if (error instanceof ValidationError) {
      return { success: false, errors: [error.message] };
    }

    const message =
      error instanceof Error ? error.message : 'Unknown validation error';
    return { success: false, errors: [message] };
  }

  // Validate controlled vocabulary terms
  const vocabResult = await validateControlledVocab(ast, meshClient);

  return {
    success: true,
    queryName: ast.name,
    blockCount: ast.blocks.length,
    vocabResult,
  };
}

/**
 * Format controlled vocabulary validation results for display.
 */
export function formatVocabValidationOutput(
  result: VocabValidationResult
): string {
  if (result.valid.length === 0 && result.invalid.length === 0) {
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

  return lines.join('\n');
}
