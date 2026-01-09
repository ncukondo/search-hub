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
    cause?: Error
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
        reject(new RefCliError(
          `Failed to install reference-manager: ${stderr || error.message}`,
          'INSTALL_FAILED',
          error
        ));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Escape a string for use in shell command.
 */
function escapeShellArg(arg: string): string {
  // Escape double quotes and backslashes
  return arg.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Execute ref add command and return parsed output.
 */
export async function refAdd(
  id: string,
  options?: { env?: NodeJS.ProcessEnv }
): Promise<RefAddOutput> {
  const escapedId = escapeShellArg(id);
  const cmd = `ref add "${escapedId}" -o json`;
  const env = options?.env ? { ...process.env, ...options.env } : process.env;

  return new Promise((resolve, reject) => {
    exec(cmd, { env }, (error, stdout, stderr) => {
      if (error) {
        reject(new RefCliError(
          `ref add failed: ${stderr || error.message}`,
          'REF_ADD_FAILED',
          error
        ));
        return;
      }

      try {
        const parsed = JSON.parse(stdout);
        const validated = RefAddOutputSchema.parse(parsed);
        resolve(validated);
      } catch (parseError) {
        reject(new RefCliError(
          `Failed to parse ref add output: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
          'PARSE_ERROR',
          parseError instanceof Error ? parseError : undefined
        ));
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
  options?: { env?: NodeJS.ProcessEnv }
): Promise<void> {
  const escapedId = escapeShellArg(id);
  const escapedField = escapeShellArg(field);
  const escapedValue = escapeShellArg(value);
  const cmd = `ref update "${escapedId}" --set "${escapedField}=${escapedValue}"`;
  const env = options?.env ? { ...process.env, ...options.env } : process.env;

  return new Promise((resolve, reject) => {
    exec(cmd, { env }, (error, stdout, stderr) => {
      if (error) {
        reject(new RefCliError(
          `ref update failed: ${stderr || error.message}`,
          'REF_UPDATE_FAILED',
          error
        ));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Execute ref export command and return the entry data.
 */
export async function refExport(
  id: string,
  options?: { env?: NodeJS.ProcessEnv }
): Promise<unknown> {
  const escapedId = escapeShellArg(id);
  const cmd = `ref export "${escapedId}"`;
  const env = options?.env ? { ...process.env, ...options.env } : process.env;

  return new Promise((resolve, reject) => {
    exec(cmd, { env }, (error, stdout, stderr) => {
      if (error) {
        reject(new RefCliError(
          `ref export failed: ${stderr || error.message}`,
          'REF_EXPORT_FAILED',
          error
        ));
        return;
      }

      try {
        const parsed = JSON.parse(stdout);
        resolve(parsed);
      } catch (parseError) {
        reject(new RefCliError(
          `Failed to parse ref export output: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
          'PARSE_ERROR',
          parseError instanceof Error ? parseError : undefined
        ));
      }
    });
  });
}
