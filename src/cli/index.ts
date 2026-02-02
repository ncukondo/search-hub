#!/usr/bin/env node
/**
 * CLI entry point for search-hub.
 */
import { config as loadDotenv } from 'dotenv';

// Load .env file as early as possible, before any config loading
loadDotenv();
import { Command } from 'commander';
import { VERSION } from '../version.js';
import { init } from './commands/init.js';
import { EXIT_CODES } from './exit-codes.js';
import { loadConfig, saveConfig, getDefaultConfig, type Config } from '../config/index.js';
import { getDefaultConfigPath } from '../config/paths.js';
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
import {
  generateQueryTemplate,
  writeQueryTemplate,
} from './commands/query/init.js';
import type { ProviderName } from '../providers/base/types.js';
import {
  listSessionsForDisplay,
  getSessionDetails,
  computeDeduplicationStats,
  formatSessionList,
  formatSessionDetails,
} from './commands/status.js';
import {
  parseSearchOptions,
  validateSearchInput,
  formatDryRunOutput,
} from './commands/search.js';
import { executeSearch } from './commands/search-executor.js';
import {
  parseResumeOptions,
  validateResumeInput,
  getResumableProvidersForCommand,
} from './commands/resume.js';
import { executeResume } from './commands/resume-executor.js';
import { formatVerboseProviderDetails } from './commands/search-utils.js';
import {
  parseExportOptions,
  validateExportInput,
  formatIds,
  formatJson,
  formatJsonl,
  deduplicateArticles,
} from './commands/export.js';
import {
  computeSummary,
  formatSummary,
  formatSummaryJson,
} from './commands/summary.js';
import {
  parseRegisterOptions,
  validateRegisterInput,
  formatRegistrationSummary,
  formatDryRunOutput as formatRegisterDryRunOutput,
} from './commands/register.js';
import { registerArticles, saveRegistrationRecord } from '../integration/register.js';
import { checkRefAvailable, checkNpmAvailable, installRefManager } from '../integration/ref-cli.js';
import { loadSession } from '../session/manager.js';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getSessionsDir } from './utils/sessions-dir.js';
import { expandPath } from '../utils/path.js';

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
    .version(VERSION)
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
    .addHelpText('after', `
Examples:
  $ search-hub init                 # Initialize with default settings
  $ search-hub init --force         # Overwrite existing configuration`)
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
    .addHelpText('after', `
Examples:
  $ search-hub config                              # Show all config
  $ search-hub config providers.pubmed             # Show PubMed config
  $ search-hub config providers.pubmed.api_key KEY # Set API key`)
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
            // Save the modified config to file
            const configPath = globalOpts.config ? expandPath(globalOpts.config) : getDefaultConfigPath();
            try {
              await saveConfig(config, { path: configPath });
              if (!globalOpts.quiet) {
                console.log(`Set ${key} = ${result.value}`);
                console.log(`Saved to ${configPath}`);
              }
            } catch (saveError) {
              if (!globalOpts.quiet) {
                console.error(
                  `Error saving config: ${saveError instanceof Error ? saveError.message : saveError}`
                );
              }
              process.exitCode = EXIT_CODES.CONFIG_ERROR;
              return;
            }
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
    .description('Query file utilities')
    .addHelpText('after', `
Query YAML format (minimal):
  name: my_search
  query:
    - field: title_abstract
      terms:
        keywords: ["term1", "term2"]
      operator: OR

Use "search-hub query init" to generate a template.`);

  queryCommand
    .command('validate')
    .description('Validate query YAML file')
    .argument('<file>', 'path to query YAML file')
    .addHelpText('after', `
Examples:
  $ search-hub query validate ./diabetes-ai.yaml`)
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
    .addHelpText('after', `
Examples:
  $ search-hub query translate ./diabetes-ai.yaml            # All databases
  $ search-hub query translate ./diabetes-ai.yaml --db pubmed # PubMed only`)
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

  queryCommand
    .command('init')
    .description('Generate a template query YAML file')
    .option('-o, --output <path>', 'write to file (default: stdout)')
    .option('--force', 'overwrite existing file', false)
    .action(async (options: { output?: string; force?: boolean }) => {
      const globalOpts = program.opts() as GlobalOptions;
      try {
        if (options.output) {
          const result = await writeQueryTemplate(options);
          if (!globalOpts.quiet) {
            if (result.success) {
              console.log(result.message);
            } else {
              console.error(result.message);
            }
          }
          process.exitCode = result.success ? EXIT_CODES.SUCCESS : EXIT_CODES.GENERAL_ERROR;
        } else {
          const template = generateQueryTemplate();
          console.log(template);
          process.exitCode = EXIT_CODES.SUCCESS;
        }
      } catch (error) {
        if (!globalOpts.quiet) {
          console.error('Error:', error instanceof Error ? error.message : error);
        }
        process.exitCode = EXIT_CODES.GENERAL_ERROR;
      }
    });

  // Register status command
  program
    .command('status')
    .description('Show session status and statistics')
    .argument('[session-id]', 'session ID to show details for')
    .option('--json', 'output as JSON')
    .option('--all', 'include completed sessions')
    .addHelpText('after', `
Examples:
  $ search-hub status                           # List recent sessions
  $ search-hub status 20240115_diabetes-ai_a3f2 # Show session details
  $ search-hub status --json                    # JSON output for scripting`)
    .action(async (sessionId?: string, options?: { json?: boolean; all?: boolean }) => {
      const globalOpts = program.opts() as GlobalOptions;
      try {
        const sessionsDir = await getSessionsDir(globalOpts);
        const formatOpts = { json: options?.json ?? false };

        if (sessionId) {
          // Show specific session details
          const result = await getSessionDetails(sessionId, sessionsDir);
          if (result.success && result.session) {
            // Compute deduplication stats
            try {
              const rawSession = await loadSession(sessionId, sessionsDir);
              const dedupStats = await computeDeduplicationStats(sessionId, sessionsDir, rawSession);
              result.session.uniqueArticles = dedupStats.uniqueArticles;
              result.session.duplicatesRemoved = dedupStats.duplicatesRemoved;
            } catch {
              // Dedup stats are optional - don't fail the command
            }
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
    .option('--skip-connection-test', 'skip API connection test during dry-run')
    .option('--no-resume', 'start fresh even if session exists')
    .addHelpText('after', `
Examples:
  $ search-hub search ./diabetes-ai.yaml                # Search all databases
  $ search-hub search ./query.yaml --db pubmed,eric     # Specific databases
  $ search-hub search --db pubmed --query "diabetes[tiab]"  # Direct query
  $ search-hub search ./query.yaml --dry-run            # Preview translations
  $ search-hub search ./query.yaml --max-results 100    # Limit results`)
    .action(
      async (
        queryFile?: string,
        options?: {
          db?: string;
          query?: string;
          name?: string;
          maxResults?: string;
          dryRun?: boolean;
          skipConnectionTest?: boolean;
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
            // Try to load config for provider readiness display
            let dryRunConfig: Config | undefined;
            try {
              dryRunConfig = await loadConfig(globalOpts.config ? { globalConfigPath: globalOpts.config } : {});
            } catch {
              // Config unavailable, readiness section will be omitted
            }

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
                const providers = translations.map(t => t.provider) as ProviderName[];
                if (!globalOpts.quiet) {
                  const dryRunOpts = dryRunConfig
                    ? { config: dryRunConfig, providers, skipConnectionTest: options?.skipConnectionTest }
                    : {};
                  console.log(await formatDryRunOutput(translations, dryRunOpts));
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
                const dryRunOpts = dryRunConfig
                  ? { config: dryRunConfig, providers: searchOpts.providers as ProviderName[], skipConnectionTest: options?.skipConnectionTest }
                  : {};
                console.log(await formatDryRunOutput(translations, dryRunOpts));
              }
            }
            process.exitCode = EXIT_CODES.SUCCESS;
            return;
          }

          // Non-dry-run: actual search execution
          const sessionsDir = await getSessionsDir(globalOpts);
          let config;
          try {
            config = await loadConfig(
              globalOpts.config ? { globalConfigPath: globalOpts.config } : {}
            );
          } catch {
            config = getDefaultConfig();
          }

          const showProgress = !globalOpts.quiet && process.stdout.isTTY;
          const result = await executeSearch(
            searchOpts,
            sessionsDir,
            config,
            showProgress
          );

          if (result.success) {
            if (!globalOpts.quiet) {
              console.log(`\nSearch completed. Session: ${result.sessionId}`);
              if (result.results) {
                for (const [provider, stats] of Object.entries(result.results)) {
                  console.log(`  ${provider}: ${stats.retrieved} results`);
                }
              }
            }
            process.exitCode = EXIT_CODES.SUCCESS;
          } else {
            if (!globalOpts.quiet) {
              console.error(`Error: ${result.error}`);
              if (globalOpts.verbose && result.results) {
                console.error(formatVerboseProviderDetails(result.results));
              }
            }
            process.exitCode = EXIT_CODES.NETWORK_ERROR;
          }
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
    .addHelpText('after', `
Examples:
  $ search-hub resume 20240115_diabetes-ai_a3f2   # Resume session
  $ search-hub resume SESSION_ID --retry-failed   # Retry failed databases
  $ search-hub resume SESSION_ID --db scopus      # Resume specific database`)
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
            console.log(`Resuming session ${sessionId} with ${result.providers.length} provider(s):`);
            for (const p of result.providers) {
              const details = p.cursor
                ? `cursor: ${p.cursor}`
                : p.pageNumber
                  ? `page: ${p.pageNumber}`
                  : '';
              console.log(`  - ${p.provider}: ${p.strategy}${details ? ` (${details})` : ''}`);
            }
            console.log('');
          }

          // Execute resume
          let config;
          try {
            config = await loadConfig(
              globalOpts.config ? { globalConfigPath: globalOpts.config } : {}
            );
          } catch {
            config = getDefaultConfig();
          }

          const showProgress = !globalOpts.quiet && process.stdout.isTTY;
          const execResult = await executeResume(
            resumeOpts,
            sessionsDir,
            config,
            showProgress
          );

          if (execResult.success) {
            if (!globalOpts.quiet) {
              console.log(`\nResume completed. ${execResult.resumed} provider(s) resumed.`);
              if (execResult.results) {
                for (const [provider, stats] of Object.entries(execResult.results)) {
                  console.log(`  ${provider}: ${stats.retrieved} results`);
                }
              }
            }
            process.exitCode = EXIT_CODES.SUCCESS;
          } else {
            if (!globalOpts.quiet) {
              console.error(`Error: ${execResult.error}`);
              if (globalOpts.verbose && execResult.results) {
                console.error(formatVerboseProviderDetails(execResult.results));
              }
            }
            process.exitCode = EXIT_CODES.NETWORK_ERROR;
          }
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
    .option('--no-dedup', 'disable deduplication of results')
    .addHelpText('after', `
Examples:
  $ search-hub export SESSION_ID --format ids --id-type doi  # Export DOIs
  $ search-hub export SESSION_ID --format json -o results.json
  $ search-hub export SESSION_ID --db pubmed --format jsonl
  $ search-hub export SESSION_ID --no-dedup  # Export without deduplication`)
    .action(
      async (
        sessionId: string,
        options?: {
          format?: string;
          output?: string;
          db?: string;
          idType?: string;
          dedup?: boolean;
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

          // Deduplicate articles unless --no-dedup is set
          const shouldDedup = options?.dedup !== false;
          let exportArticles: typeof articles;
          let duplicatesRemoved = 0;

          if (shouldDedup) {
            const dedupResult = deduplicateArticles(articles);
            exportArticles = dedupResult.articles;
            duplicatesRemoved = dedupResult.duplicatesRemoved;
          } else {
            exportArticles = articles;
          }

          // Format output
          let output: string;
          if (exportOpts.format === 'ids') {
            output = formatIds(exportArticles, exportOpts.idType ?? 'all');
          } else if (exportOpts.format === 'json') {
            output = formatJson(exportArticles);
          } else {
            output = formatJsonl(exportArticles);
          }

          // Write to file or stdout
          if (exportOpts.outputPath) {
            await writeFile(exportOpts.outputPath, output, 'utf-8');
            if (!globalOpts.quiet) {
              let message = `Exported ${exportArticles.length} articles to ${exportOpts.outputPath}`;
              if (duplicatesRemoved > 0) {
                message += ` (${duplicatesRemoved} duplicate${duplicatesRemoved === 1 ? '' : 's'} removed)`;
              }
              console.log(message);
            }
          } else {
            console.log(output);
            if (!globalOpts.quiet && duplicatesRemoved > 0) {
              console.error(`(${duplicatesRemoved} duplicate${duplicatesRemoved === 1 ? '' : 's'} removed)`);
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
      }
    );

  // Register summary command
  program
    .command('summary')
    .description('Show statistical summary of session results')
    .argument('<session-id>', 'session ID to summarize')
    .option('--json', 'output as JSON')
    .addHelpText('after', `\nExamples:
  $ search-hub summary 20240115_diabetes-ai_a3f2       # Human-readable summary
  $ search-hub summary 20240115_diabetes-ai_a3f2 --json # JSON output`)
    .action(
      async (
        sessionId: string,
        options?: { json?: boolean }
      ) => {
        const globalOpts = program.opts() as GlobalOptions;
        try {
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
          const allArticles: import('../providers/base/types.js').Article[] = [];

          const providers = Object.keys(session.databases) as ProviderName[];
          for (const provider of providers) {
            const dbStatus = session.databases[provider];
            if (!dbStatus || !dbStatus.files?.results) continue;

            const resultsPath = join(sessionsDir, sessionId, dbStatus.files.results);
            try {
              const content = await readFile(resultsPath, 'utf-8');
              const lines = content.trim().split('\n').filter((line) => line);
              for (const line of lines) {
                try {
                  allArticles.push(JSON.parse(line));
                } catch {
                  // Skip invalid JSON lines
                }
              }
            } catch {
              // Results file may not exist yet
            }
          }

          // Deduplicate
          const dedupResult = deduplicateArticles(allArticles);

          // Compute summary
          const summary = computeSummary(allArticles, dedupResult.articles, {
            sessionId,
            sessionName: session.name,
          });

          // Format output
          if (options?.json) {
            console.log(formatSummaryJson(summary));
          } else {
            if (!globalOpts.quiet) {
              console.log(formatSummary(summary));
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
      }
    );

  // Register register command
  program
    .command('register')
    .description('Register results with reference-manager')
    .argument('<session-id>', 'session ID to register')
    .option('--db <providers>', 'register only specific database(s)')
    .option('--dry-run', 'show what would be registered without executing', false)
    .option('--with-abstracts', 'also update abstracts via ref update', false)
    .addHelpText('after', `
Examples:
  $ search-hub register SESSION_ID                # Register all results
  $ search-hub register SESSION_ID --with-abstracts
  $ search-hub register SESSION_ID --dry-run      # Preview only`)
    .action(
      async (
        sessionId: string,
        options?: {
          db?: string;
          dryRun?: boolean;
          withAbstracts?: boolean;
        }
      ) => {
        const globalOpts = program.opts() as GlobalOptions;
        try {
          // Parse and validate options
          const registerOpts = parseRegisterOptions(sessionId, {
            db: options?.db,
            dryRun: options?.dryRun,
            withAbstracts: options?.withAbstracts,
          });

          const validation = validateRegisterInput(registerOpts);
          if (!validation.valid) {
            if (!globalOpts.quiet) {
              console.error(`Error: ${validation.error}`);
            }
            process.exitCode = EXIT_CODES.SESSION_ERROR;
            return;
          }

          // Check if ref command is available
          const refAvailable = await checkRefAvailable();
          if (!refAvailable && !registerOpts.dryRun) {
            if (!globalOpts.quiet) {
              console.error('Error: reference-manager (ref) command not found.\n');
              console.error('reference-manager is required to register search results.');
              console.error('Would you like to install it now? (npm i -g @ncukondo/reference-manager) [Y/n]: ');
            }

            // For non-interactive mode, suggest installation
            const npmAvailable = await checkNpmAvailable();
            if (!npmAvailable) {
              if (!globalOpts.quiet) {
                console.error('\nError: npm command not found.');
                console.error('Please install Node.js first: https://nodejs.org/');
              }
              process.exitCode = EXIT_CODES.GENERAL_ERROR;
              return;
            }

            // Try to install
            try {
              if (!globalOpts.quiet) {
                console.log('\nInstalling reference-manager...');
              }
              await installRefManager();
              if (!globalOpts.quiet) {
                console.log('✓ reference-manager installed successfully.\n');
              }
            } catch (installError) {
              if (!globalOpts.quiet) {
                console.error(
                  `\nFailed to install reference-manager: ${installError instanceof Error ? installError.message : 'Unknown error'}`
                );
              }
              process.exitCode = EXIT_CODES.GENERAL_ERROR;
              return;
            }
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

          // Determine which providers to register
          const providersToRegister = registerOpts.providers
            ? registerOpts.providers
            : (Object.keys(session.databases) as ProviderName[]);

          for (const provider of providersToRegister) {
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

          // Dry run mode
          if (registerOpts.dryRun) {
            if (!globalOpts.quiet) {
              console.log(formatRegisterDryRunOutput(articles));
            }
            process.exitCode = EXIT_CODES.SUCCESS;
            return;
          }

          // Register articles
          if (!globalOpts.quiet) {
            console.log(`Registering ${articles.length} references to reference-manager...`);
          }

          const sessionDir = join(sessionsDir, sessionId);
          const registerOptions: import('../integration/register.js').RegisterOptions = {
            sessionId,
            sessionDir,
            withAbstracts: registerOpts.withAbstracts,
          };
          if (!globalOpts.quiet) {
            registerOptions.onProgress = (current, total) => {
              process.stdout.write(`\rProgress: ${current}/${total}`);
            };
          }
          const record = await registerArticles(articles, registerOptions);

          // Save registration record
          await saveRegistrationRecord(sessionDir, record);

          if (!globalOpts.quiet) {
            console.log('\n');
            console.log(formatRegistrationSummary(record.summary));
            console.log(`\nResults saved to: ${join(sessionDir, 'registration.json')}`);
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
const executedFile = process.argv[1];
if (executedFile) {
  const { realpathSync } = await import('node:fs');
  if (realpathSync(executedFile) === realpathSync(currentFile)) {
    main().catch((error) => {
      console.error('Fatal error:', error);
      process.exit(EXIT_CODES.GENERAL_ERROR);
    });
  }
}
