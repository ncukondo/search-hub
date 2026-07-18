/**
 * ref CLI wrapper for reference-manager integration.
 * Provides functions to interact with the reference-manager CLI.
 */

import { exec } from 'node:child_process';
import { RefAddOutputSchema, type RefAddOutput } from './types.js';

/**
 * Error thrown by ref CLI operations.
 */
export class RefCliError extends Error {
  override cause: Error | undefined;

  constructor(
    message: string,
    public readonly code: string,
    cause?: Error,
  ) {
    super(message);
    this.name = 'RefCliError';
    this.cause = cause;
  }
}

/**
 * Check if the ref command is available.
 */
export async function checkRefAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    exec('ref --version', (error) => {
      resolve(!error);
    });
  });
}

/**
 * Check if npm is available.
 */
export async function checkNpmAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    exec('npm --version', (error) => {
      resolve(!error);
    });
  });
}

/**
 * Install reference-manager globally via npm.
 */
export async function installRefManager(): Promise<void> {
  return new Promise((resolve, reject) => {
    exec('npm i -g @ncukondo/reference-manager', (error, stdout, stderr) => {
      if (error) {
        reject(
          new RefCliError(
            `Failed to install reference-manager: ${stderr || error.message}`,
            'INSTALL_FAILED',
            error,
          ),
        );
      } else {
        resolve();
      }
    });
  });
}

/**
 * Options for ref CLI commands.
 */
export interface RefCliOptions {
  /** Path to the library file (uses --library option) */
  libraryPath?: string;
}

/**
 * Escape a string for use in shell command.
 */
function escapeShellArg(arg: string): string {
  // Escape double quotes and backslashes
  return arg.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Build library option string for ref commands.
 */
function buildLibraryOption(libraryPath?: string): string {
  if (!libraryPath) return '';
  return `--library "${escapeShellArg(libraryPath)}" `;
}

/**
 * Execute ref add command and return parsed output.
 *
 * Note: ref add returns exit code 1 when there are failures (e.g., fetch errors),
 * but still outputs valid JSON. We parse stdout even when exit code is non-zero.
 */
export async function refAdd(id: string, options?: RefCliOptions): Promise<RefAddOutput> {
  const escapedId = escapeShellArg(id);
  const libraryOpt = buildLibraryOption(options?.libraryPath);
  const cmd = `ref ${libraryOpt}add "${escapedId}" -o json`;

  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      // ref add returns exit code 1 when there are failures, but still outputs valid JSON.
      // Try to parse stdout first, even if there's an error.
      if (stdout) {
        try {
          const parsed = JSON.parse(stdout);
          const validated = RefAddOutputSchema.parse(parsed);
          resolve(validated);
          return;
        } catch (parseError) {
          // If parsing fails and we had an exec error, report the exec error
          if (error) {
            reject(
              new RefCliError(
                `ref add failed: ${stderr || error.message}`,
                'REF_ADD_FAILED',
                error,
              ),
            );
            return;
          }
          // Otherwise report the parse error
          reject(
            new RefCliError(
              `Failed to parse ref add output: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
              'PARSE_ERROR',
              parseError instanceof Error ? parseError : undefined,
            ),
          );
          return;
        }
      }

      // No stdout - report the exec error
      if (error) {
        reject(
          new RefCliError(`ref add failed: ${stderr || error.message}`, 'REF_ADD_FAILED', error),
        );
        return;
      }

      // No stdout and no error - unexpected
      reject(new RefCliError('ref add produced no output', 'NO_OUTPUT'));
    });
  });
}

/**
 * Execute ref add -i json for bulk import and return parsed output.
 *
 * Imports all entries from a CSL-JSON file in a single call.
 * The output format is identical to single-item ref add -o json.
 */
export async function refAddBulk(filePath: string, options?: RefCliOptions): Promise<RefAddOutput> {
  const escapedPath = escapeShellArg(filePath);
  const libraryOpt = buildLibraryOption(options?.libraryPath);
  const cmd = `ref ${libraryOpt}add -i json "${escapedPath}" -o json`;

  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (stdout) {
        try {
          const parsed = JSON.parse(stdout);
          const validated = RefAddOutputSchema.parse(parsed);
          resolve(validated);
          return;
        } catch (parseError) {
          if (error) {
            reject(
              new RefCliError(
                `ref add bulk failed: ${stderr || error.message}`,
                'REF_ADD_FAILED',
                error,
              ),
            );
            return;
          }
          reject(
            new RefCliError(
              `Failed to parse ref add bulk output: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
              'PARSE_ERROR',
              parseError instanceof Error ? parseError : undefined,
            ),
          );
          return;
        }
      }

      if (error) {
        reject(
          new RefCliError(
            `ref add bulk failed: ${stderr || error.message}`,
            'REF_ADD_FAILED',
            error,
          ),
        );
        return;
      }

      reject(new RefCliError('ref add bulk produced no output', 'NO_OUTPUT'));
    });
  });
}

/**
 * Execute ref fulltext attach command to attach a file to a reference entry.
 *
 * Attaches a fulltext file (PDF, Markdown, etc.) to a reference entry.
 * Idempotent: if the file is already attached, succeeds silently.
 */
export async function refFulltextAttach(
  refId: string,
  filePath: string,
  options?: RefCliOptions,
): Promise<void> {
  const escapedRefId = escapeShellArg(refId);
  const escapedFilePath = escapeShellArg(filePath);
  const libraryOpt = buildLibraryOption(options?.libraryPath);
  const cmd = `ref ${libraryOpt}fulltext attach "${escapedRefId}" "${escapedFilePath}"`;

  return new Promise((resolve, reject) => {
    exec(cmd, (error, _stdout, stderr) => {
      if (error) {
        reject(
          new RefCliError(
            `ref fulltext attach failed: ${stderr || error.message}`,
            'REF_FULLTEXT_ATTACH_FAILED',
            error,
          ),
        );
      } else {
        resolve();
      }
    });
  });
}

/**
 * Execute ref update command to update a field.
 */
export async function refUpdate(
  id: string,
  field: string,
  value: string,
  options?: RefCliOptions,
): Promise<void> {
  const escapedId = escapeShellArg(id);
  const escapedField = escapeShellArg(field);
  const escapedValue = escapeShellArg(value);
  const libraryOpt = buildLibraryOption(options?.libraryPath);
  const cmd = `ref ${libraryOpt}update "${escapedId}" --set "${escapedField}=${escapedValue}"`;

  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        reject(
          new RefCliError(
            `ref update failed: ${stderr || error.message}`,
            'REF_UPDATE_FAILED',
            error,
          ),
        );
      } else {
        resolve();
      }
    });
  });
}

/**
 * Execute ref export command and return the entry data.
 */
export async function refExport(id: string, options?: RefCliOptions): Promise<unknown> {
  const escapedId = escapeShellArg(id);
  const libraryOpt = buildLibraryOption(options?.libraryPath);
  const cmd = `ref ${libraryOpt}export "${escapedId}"`;

  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        reject(
          new RefCliError(
            `ref export failed: ${stderr || error.message}`,
            'REF_EXPORT_FAILED',
            error,
          ),
        );
        return;
      }

      try {
        const parsed = JSON.parse(stdout);
        resolve(parsed);
      } catch (parseError) {
        reject(
          new RefCliError(
            `Failed to parse ref export output: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
            'PARSE_ERROR',
            parseError instanceof Error ? parseError : undefined,
          ),
        );
      }
    });
  });
}
