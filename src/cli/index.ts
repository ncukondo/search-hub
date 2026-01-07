#!/usr/bin/env node
/**
 * CLI entry point for search-hub.
 */
import { Command } from 'commander';
import { init } from './commands/init.js';
import { EXIT_CODES } from './exit-codes.js';

/**
 * Global CLI options available to all commands.
 */
export interface GlobalOptions {
  /** Path to config file */
  config?: string;
  /** Path to session directory */
  sessionDir?: string;
  /** Enable verbose output */
  verbose: boolean;
  /** Suppress all output except errors */
  quiet: boolean;
  /** Enable color output (default: true, use --no-color to disable) */
  color: boolean;
}

/**
 * Create and configure the CLI program.
 */
export function createProgram(): Command {
  const program = new Command();

  program
    .name('search-hub')
    .version('0.1.0')
    .description(
      'CLI tool for systematic literature searching across multiple academic databases'
    )
    .option('-c, --config <path>', 'path to config file')
    .option('--session-dir <path>', 'path to session directory')
    .option('-v, --verbose', 'enable verbose output', false)
    .option('-q, --quiet', 'suppress all output except errors', false)
    .option('--no-color', 'disable color output');

  // Register init command
  program
    .command('init')
    .description('Initialize configuration directory')
    .option('-f, --force', 'overwrite existing configuration', false)
    .action(async (options: { force: boolean }) => {
      const globalOpts = program.opts() as GlobalOptions;
      try {
        const result = await init({ force: options.force });
        if (!globalOpts.quiet) {
          if (result.success) {
            console.log(result.message);
          } else {
            console.error(result.message);
          }
        }
        process.exitCode = result.success ? EXIT_CODES.SUCCESS : EXIT_CODES.CONFIG_ERROR;
      } catch (error) {
        if (!globalOpts.quiet) {
          console.error(
            'Error:',
            error instanceof Error ? error.message : error
          );
        }
        process.exitCode = EXIT_CODES.GENERAL_ERROR;
      }
    });

  // Register config command
  program
    .command('config')
    .description('View and edit configuration')
    .argument('[key]', 'configuration key to view or set')
    .argument('[value]', 'value to set for the key')
    .action(async (key?: string, value?: string) => {
      const globalOpts = program.opts() as GlobalOptions;
      try {
        if (!key) {
          // View all config
          if (!globalOpts.quiet) {
            console.log('Configuration viewer not yet implemented');
          }
        } else if (!value) {
          // View specific key
          if (!globalOpts.quiet) {
            console.log(`Config key: ${key}`);
          }
        } else {
          // Set key value
          if (!globalOpts.quiet) {
            console.log(`Set ${key} = ${value}`);
          }
        }
        process.exitCode = EXIT_CODES.SUCCESS;
      } catch (error) {
        if (!globalOpts.quiet) {
          console.error(
            'Error:',
            error instanceof Error ? error.message : error
          );
        }
        process.exitCode = EXIT_CODES.CONFIG_ERROR;
      }
    });

  // Register query command group
  const queryCommand = program
    .command('query')
    .description('Query file utilities');

  queryCommand
    .command('validate')
    .description('Validate query YAML file')
    .argument('<file>', 'path to query YAML file')
    .action(async (file: string) => {
      const globalOpts = program.opts() as GlobalOptions;
      try {
        if (!globalOpts.quiet) {
          console.log(`Validating ${file}...`);
        }
        process.exitCode = EXIT_CODES.SUCCESS;
      } catch (error) {
        if (!globalOpts.quiet) {
          console.error(
            'Error:',
            error instanceof Error ? error.message : error
          );
        }
        process.exitCode = EXIT_CODES.QUERY_ERROR;
      }
    });

  queryCommand
    .command('translate')
    .description('Show translated queries for each database')
    .argument('<file>', 'path to query YAML file')
    .option('--db <provider>', 'show translation for specific provider only')
    .action(async (file: string, options: { db?: string }) => {
      const globalOpts = program.opts() as GlobalOptions;
      try {
        if (!globalOpts.quiet) {
          console.log(`Translating ${file}...`);
          if (options.db) {
            console.log(`Provider: ${options.db}`);
          }
        }
        process.exitCode = EXIT_CODES.SUCCESS;
      } catch (error) {
        if (!globalOpts.quiet) {
          console.error(
            'Error:',
            error instanceof Error ? error.message : error
          );
        }
        process.exitCode = EXIT_CODES.QUERY_ERROR;
      }
    });

  // Register status command
  program
    .command('status')
    .description('Show session status and statistics')
    .argument('[session-id]', 'session ID to show details for')
    .option('--json', 'output as JSON')
    .option('--all', 'include completed sessions')
    .action(async (sessionId?: string, _options?: { json?: boolean; all?: boolean }) => {
      const globalOpts = program.opts() as GlobalOptions;
      try {
        if (!globalOpts.quiet) {
          if (sessionId) {
            console.log(`Status for session: ${sessionId}`);
          } else {
            console.log('Session list');
          }
        }
        process.exitCode = EXIT_CODES.SUCCESS;
      } catch (error) {
        if (!globalOpts.quiet) {
          console.error(
            'Error:',
            error instanceof Error ? error.message : error
          );
        }
        process.exitCode = EXIT_CODES.SESSION_ERROR;
      }
    });

  // Register search command
  program
    .command('search')
    .description('Execute search across databases')
    .argument('[query-file]', 'path to query YAML file')
    .option('--db <providers>', 'target specific database(s), comma-separated')
    .option('--query <string>', 'direct query string (requires --db)')
    .option('--name <string>', 'session name')
    .option('--max-results <n>', 'limit results per database')
    .option('--dry-run', 'show translated queries without executing')
    .option('--no-resume', 'start fresh even if session exists')
    .action(
      async (
        queryFile?: string,
        options?: {
          db?: string;
          query?: string;
          name?: string;
          maxResults?: string;
          dryRun?: boolean;
          resume?: boolean;
        }
      ) => {
        const globalOpts = program.opts() as GlobalOptions;
        try {
          if (!globalOpts.quiet) {
            if (queryFile) {
              console.log(`Searching with ${queryFile}...`);
            } else if (options?.query) {
              console.log(`Direct query: ${options.query}`);
            }
          }
          process.exitCode = EXIT_CODES.SUCCESS;
        } catch (error) {
          if (!globalOpts.quiet) {
            console.error(
              'Error:',
              error instanceof Error ? error.message : error
            );
          }
          process.exitCode = EXIT_CODES.GENERAL_ERROR;
        }
      }
    );

  // Register resume command
  program
    .command('resume')
    .description('Resume an interrupted search session')
    .argument('<session-id>', 'session ID to resume')
    .option('--db <providers>', 'resume only specific database(s)')
    .option('--retry-failed', 'retry failed databases')
    .action(
      async (
        sessionId: string,
        _options?: { db?: string; retryFailed?: boolean }
      ) => {
        const globalOpts = program.opts() as GlobalOptions;
        try {
          if (!globalOpts.quiet) {
            console.log(`Resuming session: ${sessionId}`);
          }
          process.exitCode = EXIT_CODES.SUCCESS;
        } catch (error) {
          if (!globalOpts.quiet) {
            console.error(
              'Error:',
              error instanceof Error ? error.message : error
            );
          }
          process.exitCode = EXIT_CODES.SESSION_ERROR;
        }
      }
    );

  // Register export command
  program
    .command('export')
    .description('Export session results to various formats')
    .argument('<session-id>', 'session ID to export')
    .option('--format <fmt>', 'output format: ids, json, jsonl', 'jsonl')
    .option('-o, --output <path>', 'output file path')
    .option('--db <providers>', 'export only specific database(s)')
    .option('--id-type <type>', 'for ids format: doi, pmid, all')
    .action(
      async (
        sessionId: string,
        _options?: {
          format?: string;
          output?: string;
          db?: string;
          idType?: string;
        }
      ) => {
        const globalOpts = program.opts() as GlobalOptions;
        try {
          if (!globalOpts.quiet) {
            console.log(`Exporting session: ${sessionId}`);
          }
          process.exitCode = EXIT_CODES.SUCCESS;
        } catch (error) {
          if (!globalOpts.quiet) {
            console.error(
              'Error:',
              error instanceof Error ? error.message : error
            );
          }
          process.exitCode = EXIT_CODES.SESSION_ERROR;
        }
      }
    );

  return program;
}

/**
 * Main entry point for CLI execution.
 */
export async function main(): Promise<void> {
  const program = createProgram();
  await program.parseAsync(process.argv);
}

// Run main if executed directly
if (
  process.argv[1] &&
  (process.argv[1].endsWith('/cli/index.js') ||
    process.argv[1].endsWith('/cli/index.ts'))
) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(EXIT_CODES.GENERAL_ERROR);
  });
}
