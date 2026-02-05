#!/usr/bin/env node
/**
 * CLI entry point for search-hub.
 */
import { config as loadDotenv } from 'dotenv';

// Load .env file as early as possible, before any config loading
loadDotenv({ quiet: true });
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
  formatCountOnlyOutput,
  formatPreviewOutput,
  formatShortKeywordWarning,
} from './commands/search.js';
import { executeSearch, executeCountOnly, executePreview } from './commands/search-executor.js';
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
  formatCslJson,
  deduplicateArticles,
  filterArticles,
  type JsonExportMetadata,
  type ExportFilter,
} from './commands/export.js';
import {
  computeSummary,
  formatSummary,
  formatSummaryJson,
} from './commands/summary.js';
import {
  parseResultsOptions,
  validateResultsInput,
  formatResultsList,
  formatResultsJson,
} from './commands/results.js';
import {
  loadNotes,
  addNote,
  addAssessment,
  formatNotesList,
  formatAllSessionNotes,
  type SessionNotes,
} from './commands/notes.js';
import {
  computeDiff,
  computeQueryDiff,
  formatDiff,
  formatDiffJson,
  type ShowFilter,
} from './commands/diff.js';

import {
  executeReviewInit,
  type ReviewInitOptions,
} from './commands/review/init.js';
import {
  executeReviewStatus,
  formatStatusOutput,
  type ReviewStatusOptions,
} from './commands/review/status.js';
import {
  executeReviewList,
  formatListOutput,
  type ReviewListOptions,
  type ListFilter,
} from './commands/review/list.js';
import {
  executeReviewExtract,
  type ReviewExtractOptions,
  type SortOption,
} from './commands/review/extract.js';
import {
  executeReviewMerge,
  formatMergeOutput,
  type ReviewMergeOptions,
} from './commands/review/merge.js';
import {
  executeReviewMark,
  type ReviewMarkOptions,
} from './commands/review/mark.js';
import {
  executeReviewExport,
  formatExportOutput,
  type ReviewExportOptions,
  type ExportFormat as ReviewExportFormat,
  type ExportFilter as ReviewExportFilter,
} from './commands/review/export.js';
import { type ReviewStatus } from './commands/review/types.js';

import {
  parseRegisterOptions,
  validateRegisterInput,
  formatRegistrationSummary,
  formatDryRunOutput as formatRegisterDryRunOutput,
  hasReviewFile,
  getReviewSummary,
  getIncludedArticles,
  formatReviewRequiredMessage,
  formatNoIncludedArticlesError,
  formatPendingWarning,
  formatIgnoringReviewsNote,
  confirmPrompt,
} from './commands/register.js';
import { formatSuggestion } from './suggestions/index.js';
import { getSuggestion } from './suggestions/rules.js';
import { registerArticles, saveRegistrationRecord } from '../integration/register.js';
import { checkRefAvailable, checkNpmAvailable, installRefManager } from '../integration/ref-cli.js';
import { loadSession, sessionExists, listSessions } from '../session/manager.js';
import { parseQueryFile, detectShortKeywords } from '../query/parser.js';
import { writeFile, readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSessionsDir } from './utils/sessions-dir.js';
import { expandPath } from '../utils/path.js';
import { loadSessionArticles, loadSessionQuery } from './commands/session-utils.js';

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
    .option('--no-color', 'disable color output')
    .addHelpText('after', `
Quick Start:
  $ search-hub query init -o search.yaml        # Create query template
  $ search-hub search search.yaml --count-only  # Check hit counts
  $ search-hub search search.yaml               # Execute search
  $ search-hub results <session>                # Review titles

Query Refinement (iterate until satisfied):
  $ cp search.yaml search-v2.yaml               # Create variant
  $ (edit search-v2.yaml)                       # Adjust terms
  $ search-hub search search-v2.yaml            # Search again
  $ search-hub diff <old> <new> --show removed  # Compare results`);

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
    .option('--query <string>', 'direct query in database-native syntax (advanced; requires --db; prefer YAML files)')
    .option('--name <string>', 'session name')
    .option('--max-results <n>', 'limit results per database')
    .option('--dry-run', 'show translated queries without executing')
    .option('--count-only', 'get hit counts without downloading results')
    .option('--preview', 'get hit counts and first 5 titles without creating session')
    .option('--skip-connection-test', 'skip API connection test during dry-run')
    .option('--no-resume', 'start fresh even if session exists')
    .addHelpText('after', `
Examples:
  $ search-hub search ./diabetes-ai.yaml                # Search all databases
  $ search-hub search ./query.yaml --db pubmed,eric     # Specific databases
  $ search-hub search --db pubmed --query "diabetes[tiab]"  # Direct query
  $ search-hub search ./query.yaml --dry-run            # Preview translations
  $ search-hub search ./query.yaml --count-only         # Get hit counts only
  $ search-hub search ./query.yaml --max-results 100    # Limit results

Query Refinement:
  After running a search, use 'diff' to compare query versions:
    1. Create a refined query file (e.g., query-v2.yaml)
    2. Run search with the new query
    3. Compare: search-hub diff <old-session> <new-session> --show removed`)
    .action(
      async (
        queryFile?: string,
        options?: {
          db?: string;
          query?: string;
          name?: string;
          maxResults?: string;
          dryRun?: boolean;
          countOnly?: boolean;
          preview?: boolean;
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
            countOnly: options?.countOnly,
            preview: options?.preview,
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

          // Check for short keywords and display warning
          if (searchOpts.queryFile && !globalOpts.quiet) {
            try {
              const ast = await parseQueryFile(searchOpts.queryFile);
              const shortKeywords = detectShortKeywords(ast);
              if (shortKeywords.length > 0) {
                console.error(formatShortKeywordWarning(shortKeywords));
                console.error('');
              }
            } catch {
              // Ignore parse errors here - they'll be caught later during execution
            }
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

          // Handle preview mode
          if (searchOpts.preview) {
            let previewConfig;
            try {
              previewConfig = await loadConfig(globalOpts.config ? { globalConfigPath: globalOpts.config } : {});
            } catch {
              previewConfig = getDefaultConfig();
            }

            const previews = await executePreview(searchOpts, previewConfig);

            if (previews.length === 0) {
              if (!globalOpts.quiet) {
                console.error('Error: No providers enabled or selected');
              }
              process.exitCode = EXIT_CODES.GENERAL_ERROR;
              return;
            }

            if (!globalOpts.quiet) {
              console.log(formatPreviewOutput(previews, searchOpts.queryFile));
            }

            const hasErrors = previews.some((p) => p.error);
            process.exitCode = hasErrors ? EXIT_CODES.NETWORK_ERROR : EXIT_CODES.SUCCESS;
            return;
          }

          // Handle count-only mode
          if (searchOpts.countOnly) {
            let countConfig;
            try {
              countConfig = await loadConfig(globalOpts.config ? { globalConfigPath: globalOpts.config } : {});
            } catch {
              countConfig = getDefaultConfig();
            }

            const counts = await executeCountOnly(searchOpts, countConfig);

            if (counts.length === 0) {
              if (!globalOpts.quiet) {
                console.error('Error: No providers enabled or selected');
              }
              process.exitCode = EXIT_CODES.GENERAL_ERROR;
              return;
            }

            if (!globalOpts.quiet) {
              console.log(formatCountOnlyOutput(counts, searchOpts.queryFile));
              const suggestion = formatSuggestion(getSuggestion({
                command: 'search --count-only',
                queryFile: searchOpts.queryFile,
              }));
              if (suggestion) console.log(suggestion);
            }

            const hasErrors = counts.some((c) => c.error);
            process.exitCode = hasErrors ? EXIT_CODES.NETWORK_ERROR : EXIT_CODES.SUCCESS;
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
              // Show next step suggestions
              if (result.sessionId) {
                const sessions = await listSessions(sessionsDir);
                const suggestionCmd = searchOpts.directQuery ? 'search --query' : 'search';
                const suggestion = formatSuggestion(getSuggestion({
                  command: suggestionCmd,
                  sessionId: result.sessionId,
                  sessionStatus: 'completed',
                  sessionCount: sessions.length,
                }));
                if (suggestion) console.log(suggestion);
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
    .option('--format <fmt>', 'output format: ids, json, jsonl, csl-json', 'jsonl')
    .option('-o, --output <path>', 'output file path (default: stdout)')
    .option('--db <providers>', 'export only specific database(s)')
    .option('--id-type <type>', 'for ids format: doi, pmid, all')
    .option('--no-dedup', 'disable deduplication of results')
    .option('--filter-year <range>', 'year range filter (e.g., "2023-2025")')
    .option('--filter-title <keywords>', 'title keyword filter (comma-separated)')
    .option('--filter-abstract <keywords>', 'abstract keyword filter (comma-separated)')
    .addHelpText('after', `
Examples:
  $ search-hub export SESSION_ID                             # JSONL to stdout
  $ search-hub export SESSION_ID --format json               # JSON to stdout
  $ search-hub export SESSION_ID --format json -o results.json  # JSON to file
  $ search-hub export SESSION_ID --format ids --id-type doi  # Export DOIs to stdout
  $ search-hub export SESSION_ID --format csl-json -o refs.json  # CSL-JSON to file
  $ search-hub export SESSION_ID --db pubmed --format jsonl
  $ search-hub export SESSION_ID --no-dedup  # Export without deduplication
  $ search-hub export SESSION_ID --format jsonl | jq '.title'  # Pipe to jq
  $ search-hub export SESSION_ID --filter-year 2023-2025     # Filter by year
  $ search-hub export SESSION_ID --filter-title "machine learning,AI"  # Filter by title`)
    .action(
      async (
        sessionId: string,
        options?: {
          format?: string;
          output?: string;
          db?: string;
          idType?: string;
          dedup?: boolean;
          filterYear?: string;
          filterTitle?: string;
          filterAbstract?: string;
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
          const articles = await loadSessionArticles(session, sessionId, sessionsDir, exportOpts.providers);

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

          // Apply filters
          const filter: ExportFilter = {};
          if (options?.filterYear) {
            const parts = options.filterYear.split('-');
            if (parts.length === 2) {
              const from = parseInt(parts[0]!, 10);
              const to = parseInt(parts[1]!, 10);
              if (!Number.isNaN(from)) filter.yearFrom = from;
              if (!Number.isNaN(to)) filter.yearTo = to;
            } else if (parts.length === 1) {
              const year = parseInt(parts[0]!, 10);
              if (!Number.isNaN(year)) {
                filter.yearFrom = year;
                filter.yearTo = year;
              }
            }
          }
          if (options?.filterTitle) {
            filter.titleKeywords = options.filterTitle.split(',').map((s) => s.trim()).filter(Boolean);
          }
          if (options?.filterAbstract) {
            filter.abstractKeywords = options.filterAbstract.split(',').map((s) => s.trim()).filter(Boolean);
          }

          const preFilterCount = exportArticles.length;
          const hasFilter = filter.yearFrom !== undefined || filter.yearTo !== undefined
            || (filter.titleKeywords && filter.titleKeywords.length > 0)
            || (filter.abstractKeywords && filter.abstractKeywords.length > 0);

          if (hasFilter) {
            exportArticles = filterArticles(exportArticles, filter);
          }

          // Format output
          let output: string;
          if (exportOpts.format === 'ids') {
            output = formatIds(exportArticles, exportOpts.idType ?? 'all');
          } else if (exportOpts.format === 'json') {
            // Build per-database article counts
            const databases: Record<string, number> = {};
            for (const article of exportArticles) {
              databases[article.source] = (databases[article.source] ?? 0) + 1;
            }
            const metadata: JsonExportMetadata = {
              sessionId: session.id,
              sessionName: session.name,
              createdAt: session.createdAt,
              databases,
            };
            output = formatJson(exportArticles, metadata);
          } else if (exportOpts.format === 'csl-json') {
            output = formatCslJson(exportArticles);
          } else {
            output = formatJsonl(exportArticles);
          }

          // Write to file or stdout
          if (exportOpts.outputPath) {
            await writeFile(exportOpts.outputPath, output, 'utf-8');
            if (!globalOpts.quiet) {
              let message: string;
              if (hasFilter) {
                message = `Exported ${exportArticles.length} articles (filtered from ${preFilterCount}) to ${exportOpts.outputPath}`;
              } else {
                message = `Exported ${exportArticles.length} articles to ${exportOpts.outputPath}`;
              }
              if (duplicatesRemoved > 0) {
                message += ` (${duplicatesRemoved} duplicate${duplicatesRemoved === 1 ? '' : 's'} removed)`;
              }
              console.error(message);
            }
          } else {
            process.stdout.write(output + '\n');
            if (!globalOpts.quiet) {
              const parts: string[] = [];
              if (hasFilter) {
                parts.push(`filtered from ${preFilterCount} to ${exportArticles.length} articles`);
              }
              if (duplicatesRemoved > 0) {
                parts.push(`${duplicatesRemoved} duplicate${duplicatesRemoved === 1 ? '' : 's'} removed`);
              }
              if (parts.length > 0) {
                console.error(`(${parts.join(', ')})`);
              }
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
          const allArticles = await loadSessionArticles(session, sessionId, sessionsDir);

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

  // Register results command
  program
    .command('results')
    .description('List articles from a session with title, year, and journal')
    .argument('<session-id>', 'session ID to list results from')
    .option('--limit <n>', 'maximum number of results to show')
    .option('--offset <n>', 'skip first n results')
    .option('--json', 'output as JSON array')
    .option('--fields <fields>', 'fields to display (comma-separated)')
    .option('--db <providers>', 'filter by database(s), comma-separated')
    .option('--filter-year <range>', 'year range filter (e.g., "2023-2025")')
    .option('--filter-title <keywords>', 'title keyword filter (comma-separated)')
    .option('--filter-abstract <keywords>', 'abstract keyword filter (comma-separated)')
    .option('--abstract', 'show abstracts with results')
    .option('--abstract-length <n>', 'maximum abstract length in characters (default: 300)')
    .addHelpText('after', `
Examples:
  $ search-hub results SESSION_ID                         # List all articles
  $ search-hub results SESSION_ID --limit 20              # First 20 articles
  $ search-hub results SESSION_ID --limit 20 --offset 40  # Articles 41-60
  $ search-hub results SESSION_ID --json                  # JSON output for scripting
  $ search-hub results SESSION_ID --db pubmed             # Only PubMed articles
  $ search-hub results SESSION_ID --filter-year 2023-2025 # Filter by year
  $ search-hub results SESSION_ID --abstract              # Show with abstracts`)
    .action(
      async (
        sessionId: string,
        options?: {
          limit?: string;
          offset?: string;
          json?: boolean;
          fields?: string;
          db?: string;
          filterYear?: string;
          filterTitle?: string;
          filterAbstract?: string;
          abstract?: boolean;
          abstractLength?: string;
        }
      ) => {
        const globalOpts = program.opts() as GlobalOptions;
        try {
          // Parse and validate options
          const resultsOpts = parseResultsOptions(sessionId, {
            limit: options?.limit,
            offset: options?.offset,
            json: options?.json,
            fields: options?.fields,
            db: options?.db,
            filterYear: options?.filterYear,
            filterTitle: options?.filterTitle,
            filterAbstract: options?.filterAbstract,
            abstract: options?.abstract,
            abstractLength: options?.abstractLength,
          });

          const validation = validateResultsInput(resultsOpts);
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
          const articles = await loadSessionArticles(session, sessionId, sessionsDir, resultsOpts.providers);

          // Deduplicate articles
          const dedupResult = deduplicateArticles(articles);
          let displayArticles = dedupResult.articles;

          // Apply filters
          let filteredFrom: number | undefined;
          if (resultsOpts.filter) {
            const preFilterCount = displayArticles.length;
            displayArticles = filterArticles(displayArticles, resultsOpts.filter);
            if (displayArticles.length !== preFilterCount) {
              filteredFrom = preFilterCount;
            }
          }

          // Apply pagination
          const total = displayArticles.length;
          const offset = resultsOpts.offset ?? 0;
          if (offset > 0) {
            displayArticles = displayArticles.slice(offset);
          }
          if (resultsOpts.limit !== undefined && resultsOpts.limit > 0) {
            displayArticles = displayArticles.slice(0, resultsOpts.limit);
          }

          // Format output
          if (resultsOpts.json) {
            console.log(formatResultsJson(displayArticles));
          } else {
            if (!globalOpts.quiet) {
              console.log(formatResultsList(displayArticles, {
                sessionId,
                sessionName: session.name,
                total,
                offset,
                filteredFrom,
                showAbstract: resultsOpts.showAbstract,
                abstractLength: resultsOpts.abstractLength,
              }));
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

  // Register diff command
  program
    .command('diff')
    .description('Compare results between two sessions')
    .argument('<session-id-1>', 'first session ID')
    .argument('<session-id-2>', 'second session ID')
    .option('--show <section>', 'show only specific section: added, removed, or common')
    .option('--json', 'output as JSON')
    .option('--no-query-diff', 'hide query changes section')
    .addHelpText('after', `
Examples:
  $ search-hub diff session-v1 session-v2                # Compare two sessions
  $ search-hub diff session-v1 session-v2 --show added   # Show only added articles
  $ search-hub diff session-v1 session-v2 --show removed # Show only removed articles
  $ search-hub diff session-v1 session-v2 --json         # JSON output for scripting
  $ search-hub diff session-v1 session-v2 --no-query-diff # Hide query changes

Query Refinement Workflow:
  1. Search with broad query:    search-hub search v1.yaml --max-results 100
  2. Create refined query:       cp v1.yaml v2.yaml && edit v2.yaml
  3. Search with refined query:  search-hub search v2.yaml --max-results 100
  4. Compare results:            search-hub diff <session-v1> <session-v2> --show removed
  5. Review excluded articles to verify refinement quality`)
    .action(
      async (
        sessionId1: string,
        sessionId2: string,
        options?: { show?: string; json?: boolean; queryDiff?: boolean }
      ) => {
        const globalOpts = program.opts() as GlobalOptions;
        try {
          // Validate --show option
          const validShowValues: ShowFilter[] = ['added', 'removed', 'common'];
          let showFilter: ShowFilter | undefined;
          if (options?.show) {
            if (!validShowValues.includes(options.show as ShowFilter)) {
              if (!globalOpts.quiet) {
                console.error(`Error: Invalid --show value: ${options.show}. Valid values are: ${validShowValues.join(', ')}`);
              }
              process.exitCode = EXIT_CODES.GENERAL_ERROR;
              return;
            }
            showFilter = options.show as ShowFilter;
          }

          const sessionsDir = await getSessionsDir(globalOpts);
          const noQueryDiff = options?.queryDiff === false;

          // Load both sessions
          let session1, session2;
          try {
            session1 = await loadSession(sessionId1, sessionsDir);
          } catch (error) {
            if (!globalOpts.quiet) {
              console.error(
                `Error loading session 1: ${error instanceof Error ? error.message : 'Failed to load session'}`
              );
            }
            process.exitCode = EXIT_CODES.SESSION_ERROR;
            return;
          }

          try {
            session2 = await loadSession(sessionId2, sessionsDir);
          } catch (error) {
            if (!globalOpts.quiet) {
              console.error(
                `Error loading session 2: ${error instanceof Error ? error.message : 'Failed to load session'}`
              );
            }
            process.exitCode = EXIT_CODES.SESSION_ERROR;
            return;
          }

          // Collect articles from both sessions
          const articles1 = await loadSessionArticles(session1, sessionId1, sessionsDir);
          const articles2 = await loadSessionArticles(session2, sessionId2, sessionsDir);

          // Deduplicate each session's articles before diffing
          const dedup1 = deduplicateArticles(articles1);
          const dedup2 = deduplicateArticles(articles2);

          // Compute article diff
          const diff = computeDiff(dedup1.articles, dedup2.articles);

          // Load and compute query diff (unless disabled)
          let queryDiff;
          let showQueryDiffPlaceholder = false;
          if (!noQueryDiff) {
            const query1 = await loadSessionQuery(sessionId1, sessionsDir);
            const query2 = await loadSessionQuery(sessionId2, sessionsDir);
            if (query1 && query2) {
              queryDiff = computeQueryDiff(query1, query2);
            } else {
              // At least one query is missing - show placeholder
              showQueryDiffPlaceholder = true;
            }
          }

          // Format and output
          const formatOptions = { queryDiff, noQueryDiff, showQueryDiffPlaceholder };
          if (options?.json) {
            console.log(formatDiffJson(diff, sessionId1, sessionId2, showFilter, formatOptions));
          } else {
            if (!globalOpts.quiet) {
              console.log(formatDiff(diff, sessionId1, sessionId2, showFilter, formatOptions));
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
    .option('--reviewed', 'register only articles with finalDecision=include', false)
    .option('--all', 'register all articles (ignore reviews)', false)
    .option('--force', 'skip confirmation prompts', false)
    .addHelpText('after', `
Examples:
  $ search-hub register SESSION_ID                # Register all results
  $ search-hub register SESSION_ID --with-abstracts
  $ search-hub register SESSION_ID --dry-run      # Preview only

With review workflow:
  $ search-hub register SESSION_ID --reviewed     # Register only included articles
  $ search-hub register SESSION_ID --all          # Register all (ignore reviews)`)
    .action(
      async (
        sessionId: string,
        options?: {
          db?: string;
          dryRun?: boolean;
          withAbstracts?: boolean;
          reviewed?: boolean;
          all?: boolean;
          force?: boolean;
        }
      ) => {
        const globalOpts = program.opts() as GlobalOptions;
        try {
          // Parse and validate options
          const registerOpts = parseRegisterOptions(sessionId, {
            db: options?.db,
            dryRun: options?.dryRun,
            withAbstracts: options?.withAbstracts,
            reviewed: options?.reviewed,
            all: options?.all,
            force: options?.force,
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

          // Check for review file and handle --reviewed/--all flags
          const reviewExists = await hasReviewFile(sessionId, sessionsDir);
          let articles: import('../providers/base/types.js').Article[];

          if (registerOpts.reviewed) {
            // --reviewed: only include reviewed articles
            if (!reviewExists) {
              if (!globalOpts.quiet) {
                console.error('Error: No reviews.yaml found for this session.');
                console.error('Run "search-hub review init --session ' + sessionId + '" first.');
              }
              process.exitCode = EXIT_CODES.SESSION_ERROR;
              return;
            }

            const summary = await getReviewSummary(sessionId, sessionsDir);
            if (summary.included === 0) {
              if (!globalOpts.quiet) {
                console.error(formatNoIncludedArticlesError(summary, sessionId));
              }
              process.exitCode = EXIT_CODES.SESSION_ERROR;
              return;
            }

            // Warn about pending articles (unless --force or --dry-run)
            if (summary.pending > 0 && !registerOpts.force && !registerOpts.dryRun) {
              if (!globalOpts.quiet) {
                console.log(formatPendingWarning(summary));
              }
              // Wait for user confirmation
              const confirmed = await confirmPrompt();
              if (!confirmed) {
                process.exitCode = EXIT_CODES.SUCCESS;
                return;
              }
            }

            articles = await getIncludedArticles(sessionId, sessionsDir);
          } else if (reviewExists && !registerOpts.all) {
            // reviews.yaml exists but no flag specified
            const summary = await getReviewSummary(sessionId, sessionsDir);
            if (!globalOpts.quiet) {
              console.log(formatReviewRequiredMessage(summary, sessionId));
            }
            process.exitCode = EXIT_CODES.GENERAL_ERROR;
            return;
          } else {
            // --all or no reviews.yaml: collect all articles from result files
            if (reviewExists && !globalOpts.quiet) {
              const summary = await getReviewSummary(sessionId, sessionsDir);
              console.log(formatIgnoringReviewsNote(summary.total));
            }
            articles = await loadSessionArticles(session, sessionId, sessionsDir, registerOpts.providers);
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

            // Show next step suggestions
            const suggestion = formatSuggestion(getSuggestion({
              command: 'register',
              sessionId,
              hasReviews: reviewExists,
            }));
            if (suggestion) console.log(suggestion);
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

  // Register review command group
  const reviewCommand = program
    .command('review')
    .description('Article review workflow for systematic literature review')
    .addHelpText('after', `
Examples:
  $ search-hub review init --session SESSION_ID           # Initialize reviews.yaml
  $ search-hub review status --session SESSION_ID         # Show review progress
  $ search-hub review list --session SESSION_ID --filter pending  # List articles
  $ search-hub review extract --session SESSION_ID -o batch.yaml  # Extract for review
  $ search-hub review merge --session SESSION_ID batch.yaml       # Merge reviews
  $ search-hub review export --session SESSION_ID --only included -o included.yaml`);

  reviewCommand
    .command('init')
    .description('Generate reviews.yaml from deduplicated search results')
    .requiredOption('--session <id>', 'session ID')
    .option('-f, --force', 'overwrite existing reviews.yaml', false)
    .action(async (options: { session: string; force: boolean }) => {
      const globalOpts = program.opts() as GlobalOptions;
      try {
        const sessionsDir = await getSessionsDir(globalOpts);
        const initOptions: ReviewInitOptions = {
          sessionId: options.session,
          ...(options.force && { force: options.force }),
        };
        const result = await executeReviewInit(initOptions, sessionsDir);
        if (!globalOpts.quiet) {
          console.log(`Created ${result.reviewsPath}`);
          console.log(`  Articles: ${result.articleCount}`);
          if (result.duplicatesRemoved > 0) {
            console.log(`  Duplicates removed: ${result.duplicatesRemoved}`);
          }
        }
        process.exitCode = EXIT_CODES.SUCCESS;
      } catch (error) {
        if (!globalOpts.quiet) {
          console.error('Error:', error instanceof Error ? error.message : error);
        }
        process.exitCode = EXIT_CODES.SESSION_ERROR;
      }
    });

  reviewCommand
    .command('status')
    .description('Show review progress summary')
    .requiredOption('--session <id>', 'session ID')
    .option('--json', 'output as JSON')
    .action(async (options: { session: string; json?: boolean }) => {
      const globalOpts = program.opts() as GlobalOptions;
      try {
        const sessionsDir = await getSessionsDir(globalOpts);
        const statusOptions: ReviewStatusOptions = {
          sessionId: options.session,
        };
        const result = await executeReviewStatus(statusOptions, sessionsDir);
        if (!globalOpts.quiet) {
          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            console.log(formatStatusOutput(result));
          }
        }
        process.exitCode = EXIT_CODES.SUCCESS;
      } catch (error) {
        if (!globalOpts.quiet) {
          console.error('Error:', error instanceof Error ? error.message : error);
        }
        process.exitCode = EXIT_CODES.SESSION_ERROR;
      }
    });

  reviewCommand
    .command('list')
    .description('List articles with optional filtering')
    .requiredOption('--session <id>', 'session ID')
    .option('--filter <type>', 'filter by status: pending, conflicting, needs-final, finalized, all', 'all')
    .option('--json', 'output as JSON')
    .action(async (options: { session: string; filter?: string; json?: boolean }) => {
      const globalOpts = program.opts() as GlobalOptions;
      try {
        const validFilters: ListFilter[] = ['pending', 'conflicting', 'needs-final', 'finalized', 'all'];
        const filter = (options.filter ?? 'all') as ListFilter;
        if (!validFilters.includes(filter)) {
          if (!globalOpts.quiet) {
            console.error(`Error: Invalid filter '${options.filter}'. Valid values: ${validFilters.join(', ')}`);
          }
          process.exitCode = EXIT_CODES.GENERAL_ERROR;
          return;
        }

        const sessionsDir = await getSessionsDir(globalOpts);
        const listOptions: ReviewListOptions = {
          sessionId: options.session,
          filter,
        };
        const result = await executeReviewList(listOptions, sessionsDir);
        if (!globalOpts.quiet) {
          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            console.log(formatListOutput(result));
          }
        }
        process.exitCode = EXIT_CODES.SUCCESS;
      } catch (error) {
        if (!globalOpts.quiet) {
          console.error('Error:', error instanceof Error ? error.message : error);
        }
        process.exitCode = EXIT_CODES.SESSION_ERROR;
      }
    });

  reviewCommand
    .command('extract')
    .description('Extract subset to separate file for distributed review')
    .requiredOption('--session <id>', 'session ID')
    .requiredOption('-o, --output <path>', 'output file path')
    .option('--filter <types>', 'filter by status (comma-separated): pending, conflicting, needs-final')
    .option('--sort <method>', 'sort method: year, title, random, none', 'none')
    .option('--limit <n>', 'limit number of articles')
    .option('--offset <n>', 'skip first n articles')
    .option('--seed <n>', 'random seed for reproducible sorting')
    .option('--basis <type>', 'basis for review: title or abstract (outputs work file format)')
    .option('--reviewer <id>', 'reviewer identifier (e.g., "ai:claude")')
    .action(async (options: {
      session: string;
      output: string;
      filter?: string;
      sort?: string;
      limit?: string;
      offset?: string;
      seed?: string;
      basis?: string;
      reviewer?: string;
    }) => {
      const globalOpts = program.opts() as GlobalOptions;
      try {
        const validSorts: SortOption[] = ['year', 'title', 'random', 'none'];
        const sort = (options.sort ?? 'none') as SortOption;
        if (!validSorts.includes(sort)) {
          if (!globalOpts.quiet) {
            console.error(`Error: Invalid sort '${options.sort}'. Valid values: ${validSorts.join(', ')}`);
          }
          process.exitCode = EXIT_CODES.GENERAL_ERROR;
          return;
        }

        const sessionsDir = await getSessionsDir(globalOpts);
        const extractOptions: ReviewExtractOptions = {
          sessionId: options.session,
          output: options.output,
          sort,
        };

        if (options.filter) {
          extractOptions.filter = options.filter.split(',').map(s => s.trim()) as ReviewStatus[];
        }
        if (options.limit) {
          extractOptions.limit = parseInt(options.limit, 10);
        }
        if (options.offset) {
          extractOptions.offset = parseInt(options.offset, 10);
        }
        if (options.seed) {
          extractOptions.seed = parseInt(options.seed, 10);
        }

        // Handle basis and reviewer options
        if (options.basis) {
          const validBasis = ['title', 'abstract'];
          if (!validBasis.includes(options.basis)) {
            if (!globalOpts.quiet) {
              console.error(`Error: Invalid basis '${options.basis}'. Valid values: ${validBasis.join(', ')}`);
            }
            process.exitCode = EXIT_CODES.GENERAL_ERROR;
            return;
          }
          extractOptions.basis = options.basis as 'title' | 'abstract';

          // Reviewer is required when basis is specified
          if (!options.reviewer) {
            if (!globalOpts.quiet) {
              console.error('Error: --reviewer is required when --basis is specified');
            }
            process.exitCode = EXIT_CODES.GENERAL_ERROR;
            return;
          }
          extractOptions.reviewer = options.reviewer;
        }

        const result = await executeReviewExtract(extractOptions, sessionsDir);
        if (!globalOpts.quiet) {
          console.log(`Extracted ${result.extractedCount} of ${result.totalMatching} articles to ${result.outputPath}`);
        }
        process.exitCode = EXIT_CODES.SUCCESS;
      } catch (error) {
        if (!globalOpts.quiet) {
          console.error('Error:', error instanceof Error ? error.message : error);
        }
        process.exitCode = EXIT_CODES.SESSION_ERROR;
      }
    });

  reviewCommand
    .command('merge')
    .description('Merge edited file back into main reviews.yaml')
    .requiredOption('--session <id>', 'session ID')
    .argument('<file>', 'file to merge')
    .option('--dry-run', 'show changes without applying', false)
    .action(async (file: string, options: { session: string; dryRun: boolean }) => {
      const globalOpts = program.opts() as GlobalOptions;
      try {
        const sessionsDir = await getSessionsDir(globalOpts);
        const mergeOptions: ReviewMergeOptions = {
          sessionId: options.session,
          file,
          ...(options.dryRun && { dryRun: options.dryRun }),
        };
        const result = await executeReviewMerge(mergeOptions, sessionsDir);
        if (!globalOpts.quiet) {
          console.log(formatMergeOutput(result, options.dryRun));
        }
        process.exitCode = EXIT_CODES.SUCCESS;
      } catch (error) {
        if (!globalOpts.quiet) {
          console.error('Error:', error instanceof Error ? error.message : error);
        }
        process.exitCode = EXIT_CODES.SESSION_ERROR;
      }
    });

  reviewCommand
    .command('mark')
    .description('Mark decisions in work files')
    .requiredOption('--file <path>', 'path to work file')
    .option('--id <id>', 'article ID to mark')
    .option('--decision <decision>', 'decision: include, exclude, or uncertain')
    .option('--comment <text>', 'optional comment')
    .option('--input <path>', 'path to JSON file with decisions for batch marking')
    .action(async (options: {
      file: string;
      id?: string;
      decision?: string;
      comment?: string;
      input?: string;
    }) => {
      const globalOpts = program.opts() as GlobalOptions;
      try {
        // Validate decision if provided
        const validDecisions = ['include', 'exclude', 'uncertain'];
        if (options.decision && !validDecisions.includes(options.decision)) {
          if (!globalOpts.quiet) {
            console.error(`Error: Invalid decision '${options.decision}'. Valid values: ${validDecisions.join(', ')}`);
          }
          process.exitCode = EXIT_CODES.GENERAL_ERROR;
          return;
        }

        // Validate options
        if (!options.input && (!options.id || !options.decision)) {
          if (!globalOpts.quiet) {
            console.error('Error: Either --id with --decision, or --input must be specified');
          }
          process.exitCode = EXIT_CODES.GENERAL_ERROR;
          return;
        }

        const markOptions: ReviewMarkOptions = {
          file: options.file,
        };

        if (options.id) markOptions.id = options.id;
        if (options.decision) markOptions.decision = options.decision as 'include' | 'exclude' | 'uncertain';
        if (options.comment) markOptions.comment = options.comment;
        if (options.input) markOptions.input = options.input;

        const result = await executeReviewMark(markOptions);
        if (!globalOpts.quiet) {
          console.log(`Marked ${result.marked} article(s)`);
          for (const warning of result.warnings) {
            console.warn(`Warning: ${warning}`);
          }
        }
        process.exitCode = EXIT_CODES.SUCCESS;
      } catch (error) {
        if (!globalOpts.quiet) {
          console.error('Error:', error instanceof Error ? error.message : error);
        }
        process.exitCode = EXIT_CODES.SESSION_ERROR;
      }
    });

  reviewCommand
    .command('export')
    .description('Export articles based on final decision')
    .requiredOption('--session <id>', 'session ID')
    .requiredOption('--only <filter>', 'export filter: included or excluded')
    .requiredOption('-o, --output <path>', 'output file path')
    .option('--format <fmt>', 'output format: yaml, json, jsonl', 'yaml')
    .action(async (options: {
      session: string;
      only: string;
      output: string;
      format?: string;
    }) => {
      const globalOpts = program.opts() as GlobalOptions;
      try {
        const validOnlyValues: ReviewExportFilter[] = ['included', 'excluded'];
        const only = options.only as ReviewExportFilter;
        if (!validOnlyValues.includes(only)) {
          if (!globalOpts.quiet) {
            console.error(`Error: Invalid --only value '${options.only}'. Valid values: ${validOnlyValues.join(', ')}`);
          }
          process.exitCode = EXIT_CODES.GENERAL_ERROR;
          return;
        }

        const validFormats: ReviewExportFormat[] = ['yaml', 'json', 'jsonl'];
        const format = (options.format ?? 'yaml') as ReviewExportFormat;
        if (!validFormats.includes(format)) {
          if (!globalOpts.quiet) {
            console.error(`Error: Invalid format '${options.format}'. Valid values: ${validFormats.join(', ')}`);
          }
          process.exitCode = EXIT_CODES.GENERAL_ERROR;
          return;
        }

        const sessionsDir = await getSessionsDir(globalOpts);
        const exportOptions: ReviewExportOptions = {
          sessionId: options.session,
          only,
          output: options.output,
          format,
        };
        const result = await executeReviewExport(exportOptions, sessionsDir);
        if (!globalOpts.quiet) {
          console.log(formatExportOutput(result));
        }
        process.exitCode = EXIT_CODES.SUCCESS;
      } catch (error) {
        if (!globalOpts.quiet) {
          console.error('Error:', error instanceof Error ? error.message : error);
        }
        process.exitCode = EXIT_CODES.SESSION_ERROR;
      }
    });

  // Register notes command group
  const notesCommand = program
    .command('notes')
    .description('Manage session notes and assessments')
    .addHelpText('after', `
Examples:
  $ search-hub notes list SESSION_ID             # List notes for a session
  $ search-hub notes add SESSION_ID "my note"    # Add a note
  $ search-hub notes add SESSION_ID --file assessment.md  # Add from file
  $ search-hub notes assess SESSION_ID --precision "~54%" --verdict good --comment "Good results"
  $ search-hub notes list --all                  # Show notes from all sessions`);

  notesCommand
    .command('list')
    .description('List notes for a session or all sessions')
    .argument('[session-id]', 'session ID')
    .option('--all', 'show notes from all sessions')
    .option('--json', 'output as JSON')
    .action(async (sessionId?: string, options?: { all?: boolean; json?: boolean }) => {
      const globalOpts = program.opts() as GlobalOptions;
      try {
        const sessionsDir = await getSessionsDir(globalOpts);
        const formatOpts = { json: options?.json ?? false };

        if (options?.all) {
          // Cross-session notes view
          const summaries = await listSessions(sessionsDir);
          const allNotes: SessionNotes[] = [];

          for (const summary of summaries) {
            const sessionNotesDir = join(sessionsDir, summary.id);
            const notes = await loadNotes(sessionNotesDir);
            allNotes.push({
              sessionId: summary.id,
              sessionName: summary.name,
              notes,
            });
          }

          if (!globalOpts.quiet) {
            console.log(formatAllSessionNotes(allNotes, formatOpts));
          }
          process.exitCode = EXIT_CODES.SUCCESS;
          return;
        }

        if (!sessionId) {
          if (!globalOpts.quiet) {
            console.error('Error: session-id is required (or use --all)');
          }
          process.exitCode = EXIT_CODES.SESSION_ERROR;
          return;
        }

        // List notes for a specific session
        const sessionDir = join(sessionsDir, sessionId);
        const notes = await loadNotes(sessionDir);
        if (!globalOpts.quiet) {
          console.log(formatNotesList(notes, formatOpts));
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

  notesCommand
    .command('add')
    .description('Add a note to a session')
    .argument('<session-id>', 'session ID')
    .argument('[text]', 'note text')
    .option('--file <path>', 'read note text from a file instead')
    .action(async (sessionId: string, text?: string, options?: { file?: string }) => {
      const globalOpts = program.opts() as GlobalOptions;
      try {
        const sessionsDir = await getSessionsDir(globalOpts);
        const sessionDir = join(sessionsDir, sessionId);

        if (!(await sessionExists(sessionId, sessionsDir))) {
          if (!globalOpts.quiet) {
            console.error(`Error: session '${sessionId}' not found`);
          }
          process.exitCode = EXIT_CODES.SESSION_ERROR;
          return;
        }

        let noteText: string;
        if (options?.file) {
          noteText = (await readFile(options.file, 'utf-8')).trim();
        } else if (text) {
          noteText = text;
        } else {
          if (!globalOpts.quiet) {
            console.error('Error: note text or --file is required');
          }
          process.exitCode = EXIT_CODES.GENERAL_ERROR;
          return;
        }

        await addNote(sessionDir, noteText);

        if (!globalOpts.quiet) {
          console.log('Note added.');
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

  notesCommand
    .command('assess')
    .description('Add a structured assessment to a session')
    .argument('<session-id>', 'session ID')
    .option('--precision <value>', 'estimated precision (e.g., "~54%", "15/28")')
    .option('--verdict <value>', 'quality judgment: good, refine, reject')
    .option('--comment <text>', 'free text explanation')
    .action(async (sessionId: string, options?: { precision?: string; verdict?: string; comment?: string }) => {
      const globalOpts = program.opts() as GlobalOptions;
      try {
        if (!options?.precision && !options?.verdict && !options?.comment) {
          if (!globalOpts.quiet) {
            console.error('Error: at least one of --precision, --verdict, or --comment is required');
          }
          process.exitCode = EXIT_CODES.GENERAL_ERROR;
          return;
        }

        const sessionsDir = await getSessionsDir(globalOpts);
        const sessionDir = join(sessionsDir, sessionId);

        if (!(await sessionExists(sessionId, sessionsDir))) {
          if (!globalOpts.quiet) {
            console.error(`Error: session '${sessionId}' not found`);
          }
          process.exitCode = EXIT_CODES.SESSION_ERROR;
          return;
        }

        await addAssessment(sessionDir, {
          precision: options?.precision,
          verdict: options?.verdict,
          comment: options?.comment,
        });

        if (!globalOpts.quiet) {
          console.log('Assessment added.');
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
  if (realpathSync(executedFile) === realpathSync(currentFile)) {
    main().catch((error) => {
      console.error('Fatal error:', error);
      process.exit(EXIT_CODES.GENERAL_ERROR);
    });
  }
}
