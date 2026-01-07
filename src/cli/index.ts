#!/usr/bin/env node
/**
 * CLI entry point for search-hub.
 */
import { Command } from 'commander';
import { init } from './commands/init.js';

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
        process.exitCode = result.success ? 0 : 1;
      } catch (error) {
        if (!globalOpts.quiet) {
          console.error(
            'Error:',
            error instanceof Error ? error.message : error
          );
        }
        process.exitCode = 1;
      }
    });

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
    process.exit(1);
  });
}
