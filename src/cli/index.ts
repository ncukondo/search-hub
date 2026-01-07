#!/usr/bin/env node
/**
 * CLI entry point for search-hub.
 */
import { Command } from 'commander';
import { init } from './commands/init.js';
import { EXIT_CODES } from './exit-codes.js';
import { loadConfig, getDefaultConfig } from '../config/index.js';
import {
  viewConfig,
  viewConfigKey,
  setConfigKey,
} from './commands/config.js';
import {
  validateQueryCommand,
  formatValidateResult,
} from './commands/query/validate.js';
import {
  translateQueryCommand,
  formatTranslateResult,
} from './commands/query/translate.js';
import type { ProviderName } from '../providers/base/types.js';
import {
  listSessionsForDisplay,
  getSessionDetails,
  formatSessionList,
  formatSessionDetails,
} from './commands/status.js';
import {
  parseSearchOptions,
  validateSearchInput,
  formatDryRunOutput,
} from './commands/search.js';
import {
  parseResumeOptions,
  validateResumeInput,
  getResumableProvidersForCommand,
} from './commands/resume.js';
import {
  parseExportOptions,
  validateExportInput,
  formatIds,
  formatJson,
  formatJsonl,
} from './commands/export.js';
import { loadSession } from '../session/manager.js';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getSessionsDir } from './utils/sessions-dir.js';

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
        // Load config - use default if no config file exists
        let config;
        try {
          config = await loadConfig(
            globalOpts.config ? { globalConfigPath: globalOpts.config } : {}
          );
        } catch {
          config = getDefaultConfig();
        }

        if (!key) {
          // View all config
          if (!globalOpts.quiet) {
            console.log(viewConfig(config));
          }
        } else if (!value) {
          // View specific key
          const result = viewConfigKey(config, key);
          if (result.success) {
            if (!globalOpts.quiet) {
              console.log(result.value);
            }
          } else {
            if (!globalOpts.quiet) {
              console.error(`Error: ${result.error}`);
            }
            process.exitCode = EXIT_CODES.CONFIG_ERROR;
            return;
          }
        } else {
          // Set key value
          const result = setConfigKey(config, key, value);
          if (result.success) {
            if (!globalOpts.quiet) {
              console.log(`Set ${key} = ${result.value}`);
            }
            // Note: Saving config to file would require additional implementation
          } else {
            if (!globalOpts.quiet) {
              console.error(`Error: ${result.error}`);
            }
            process.exitCode = EXIT_CODES.CONFIG_ERROR;
            return;
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
        const result = await validateQueryCommand(file);
        if (!globalOpts.quiet) {
          console.log(formatValidateResult(result, file));
        }
        process.exitCode = result.success
          ? EXIT_CODES.SUCCESS
          : EXIT_CODES.QUERY_ERROR;
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
        const translateOptions = options.db
          ? { providers: [options.db as ProviderName] }
          : {};
        const result = await translateQueryCommand(file, translateOptions);
        if (!globalOpts.quiet) {
          console.log(formatTranslateResult(result, file));
        }
        process.exitCode = result.success
          ? EXIT_CODES.SUCCESS
          : EXIT_CODES.QUERY_ERROR;
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
    .action(async (sessionId?: string, options?: { json?: boolean; all?: boolean }) => {
      const globalOpts = program.opts() as GlobalOptions;
      try {
        const sessionsDir = await getSessionsDir(globalOpts);
        const formatOpts = { json: options?.json ?? false };

        if (sessionId) {
          // Show specific session details
          const result = await getSessionDetails(sessionId, sessionsDir);
          if (result.success && result.session) {
            if (!globalOpts.quiet) {
              console.log(formatSessionDetails(result.session, formatOpts));
            }
          } else {
            if (!globalOpts.quiet) {
              console.error(`Error: ${result.error}`);
            }
            process.exitCode = EXIT_CODES.SESSION_ERROR;
            return;
          }
        } else {
          // List sessions
          const listOpts = { all: options?.all ?? false };
          const sessions = await listSessionsForDisplay(sessionsDir, listOpts);
          if (!globalOpts.quiet) {
            console.log(formatSessionList(sessions, formatOpts));
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
          // Parse and validate options
          const searchOpts = parseSearchOptions(queryFile, {
            db: options?.db,
            query: options?.query,
            name: options?.name,
            maxResults: options?.maxResults,
            dryRun: options?.dryRun,
            noResume: options?.resume === false,
          });

          const validation = validateSearchInput(searchOpts);
          if (!validation.valid) {
            if (!globalOpts.quiet) {
              console.error(`Error: ${validation.error}`);
            }
            process.exitCode = EXIT_CODES.GENERAL_ERROR;
            return;
          }

          // Handle dry-run mode
          if (searchOpts.dryRun) {
            if (searchOpts.queryFile) {
              // Translate from file
              const translateOpts = searchOpts.providers
                ? { providers: searchOpts.providers }
                : {};
              const result = await translateQueryCommand(
                searchOpts.queryFile,
                translateOpts
              );
              if (result.success && result.translations) {
                const translations = Object.entries(result.translations).map(
                  ([provider, t]) => ({ provider, query: t.native })
                );
                if (!globalOpts.quiet) {
                  console.log(formatDryRunOutput(translations));
                }
              } else {
                if (!globalOpts.quiet) {
                  console.error(`Error: ${result.error}`);
                }
                process.exitCode = EXIT_CODES.QUERY_ERROR;
                return;
              }
            } else if (searchOpts.directQuery && searchOpts.providers) {
              // Direct query
              const translations = [
                {
                  provider: searchOpts.providers[0]!,
                  query: searchOpts.directQuery,
                },
              ];
              if (!globalOpts.quiet) {
                console.log(formatDryRunOutput(translations));
              }
            }
            process.exitCode = EXIT_CODES.SUCCESS;
            return;
          }

          // Non-dry-run: actual search execution
          // Note: Full search execution requires provider orchestration
          // which is beyond the scope of Step 11 (wiring helpers)
          if (!globalOpts.quiet) {
            console.log(
              'Search execution not yet implemented. Use --dry-run to preview queries.'
            );
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
        options?: { db?: string; retryFailed?: boolean }
      ) => {
        const globalOpts = program.opts() as GlobalOptions;
        try {
          // Parse and validate options
          const resumeOpts = parseResumeOptions(sessionId, {
            db: options?.db,
            retryFailed: options?.retryFailed,
          });

          const validation = validateResumeInput(resumeOpts);
          if (!validation.valid) {
            if (!globalOpts.quiet) {
              console.error(`Error: ${validation.error}`);
            }
            process.exitCode = EXIT_CODES.SESSION_ERROR;
            return;
          }

          const sessionsDir = await getSessionsDir(globalOpts);

          // Get resumable providers
          const result = await getResumableProvidersForCommand(
            sessionId,
            sessionsDir,
            {
              providers: resumeOpts.providers,
              retryFailed: resumeOpts.retryFailed,
            }
          );

          if (!result.success) {
            if (!globalOpts.quiet) {
              console.error(`Error: ${result.error}`);
            }
            process.exitCode = EXIT_CODES.SESSION_ERROR;
            return;
          }

          if (!result.providers || result.providers.length === 0) {
            if (!globalOpts.quiet) {
              console.log('No providers need resuming for this session.');
            }
            process.exitCode = EXIT_CODES.SUCCESS;
            return;
          }

          // Show resumable providers
          if (!globalOpts.quiet) {
            console.log(`Session ${sessionId} has ${result.providers.length} provider(s) to resume:`);
            for (const p of result.providers) {
              const details = p.cursor
                ? `cursor: ${p.cursor}`
                : p.pageNumber
                  ? `page: ${p.pageNumber}`
                  : '';
              console.log(`  - ${p.provider}: ${p.strategy}${details ? ` (${details})` : ''}`);
            }
            console.log('\nResume execution not yet implemented.');
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
        options?: {
          format?: string;
          output?: string;
          db?: string;
          idType?: string;
        }
      ) => {
        const globalOpts = program.opts() as GlobalOptions;
        try {
          // Parse and validate options
          const exportOpts = parseExportOptions(sessionId, {
            format: options?.format,
            output: options?.output,
            db: options?.db,
            idType: options?.idType,
          });

          const validation = validateExportInput(exportOpts);
          if (!validation.valid) {
            if (!globalOpts.quiet) {
              console.error(`Error: ${validation.error}`);
            }
            process.exitCode = EXIT_CODES.SESSION_ERROR;
            return;
          }

          const sessionsDir = await getSessionsDir(globalOpts);

          // Load session
          let session;
          try {
            session = await loadSession(sessionId, sessionsDir);
          } catch (error) {
            if (!globalOpts.quiet) {
              console.error(
                `Error: ${error instanceof Error ? error.message : 'Failed to load session'}`
              );
            }
            process.exitCode = EXIT_CODES.SESSION_ERROR;
            return;
          }

          // Collect articles from result files
          const { readFile } = await import('node:fs/promises');
          const { join } = await import('node:path');
          const articles: import('../providers/base/types.js').Article[] = [];

          // Determine which providers to export
          const providersToExport = exportOpts.providers
            ? exportOpts.providers
            : (Object.keys(session.databases) as ProviderName[]);

          for (const provider of providersToExport) {
            const dbStatus = session.databases[provider];
            if (!dbStatus || !dbStatus.files?.results) continue;

            const resultsPath = join(sessionsDir, sessionId, dbStatus.files.results);
            try {
              const content = await readFile(resultsPath, 'utf-8');
              const lines = content.trim().split('\n').filter((line) => line);
              for (const line of lines) {
                try {
                  articles.push(JSON.parse(line));
                } catch {
                  // Skip invalid JSON lines
                }
              }
            } catch {
              // Results file may not exist yet
            }
          }

          // Format output
          let output: string;
          if (exportOpts.format === 'ids') {
            output = formatIds(articles, exportOpts.idType ?? 'all');
          } else if (exportOpts.format === 'json') {
            output = formatJson(articles);
          } else {
            output = formatJsonl(articles);
          }

          // Write to file or stdout
          if (exportOpts.outputPath) {
            await writeFile(exportOpts.outputPath, output, 'utf-8');
            if (!globalOpts.quiet) {
              console.log(`Exported ${articles.length} articles to ${exportOpts.outputPath}`);
            }
          } else {
            console.log(output);
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
const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] === currentFile) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(EXIT_CODES.GENERAL_ERROR);
  });
}
