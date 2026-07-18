/**
 * Query Assess Command
 *
 * Records a structured assessment of the current query iteration
 * to the search iteration log.
 */
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { appendLogEntry, formatTimestamp, type AssessmentLogEntry } from './iteration-log.js';

export interface AssessOptions {
  verdict?: string | undefined;
  precision?: string | undefined;
  comment?: string | undefined;
}

export interface AssessResult {
  success: boolean;
  error?: string;
}

/**
 * Execute the query assess command.
 * Validates inputs and appends an assessment entry to the log.
 */
export async function executeQueryAssess(
  queryFile: string,
  options: AssessOptions,
): Promise<AssessResult> {
  // Validate at least one option is provided
  if (!options.verdict && !options.precision && !options.comment) {
    return {
      success: false,
      error: 'At least one of --verdict, --precision, or --comment is required',
    };
  }

  // Validate query file exists
  try {
    await access(queryFile, constants.R_OK);
  } catch {
    return {
      success: false,
      error: `Query file not found: ${queryFile}`,
    };
  }

  const entry: AssessmentLogEntry = {
    date: formatTimestamp(),
    type: 'assessment',
  };

  if (options.verdict !== undefined) {
    entry.verdict = options.verdict;
  }
  if (options.precision !== undefined) {
    entry.precision = options.precision;
  }
  if (options.comment !== undefined) {
    entry.comment = options.comment;
  }

  await appendLogEntry(queryFile, entry);

  return { success: true };
}
