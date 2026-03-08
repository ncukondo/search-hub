#!/usr/bin/env node
/**
 * CLI entry point for search-hub.
 */
import { config as loadDotenv } from 'dotenv';

// Load .env file as early as possible, before any config loading
loadDotenv({ quiet: true });
import { Command, Option } from 'commander';
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
  formatVocabValidationOutput,
  hasVocabErrors,
  detectSchemaLink,
} from './commands/query/validate.js';
import { MeSHLookupClient } from '../query/mesh-lookup.js';
import { RateLimiter } from '../providers/base/rate-limiter.js';
import { VocabCache } from '../query/vocab-cache.js';
import {
  createEricCountValidator,
  createEmtreeCountValidator,
  type CountVocabValidator,
} from '../query/vocab-validator.js';
import { createProviderInstance } from './commands/search-executor.js';
import {
  translateQueryCommand,
  formatTranslateResult,
} from './commands/query/translate.js';
import {
  inspectQueryCommand,
  formatInspectOutput,
} from './commands/query/inspect.js';
import {
  writeQueryTemplate,
} from './commands/query/init.js';
import { resolveQueryFile } from './commands/query/resolve.js';
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
  type JsonExportMetadata,
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
import { filterByQuery } from './commands/query-filter.js';
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
  mergeArticles,
  validateMergeSources,
  createMergedSession,
  formatMergeOutput as formatSessionMergeOutput,
  formatMergeJson as formatSessionMergeJson,
} from './commands/merge.js';
import {
  parseRelatedOptions,
  validateRelatedInput,
  resolveSeeds,
  createRelatedSession,
  formatRelatedOutput,
} from './commands/related.js';

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
import {
  executeReviewFinalize,
  formatFinalizeOutput,
  type ReviewFinalizeOptions,
} from './commands/review/finalize.js';
import { type ReviewStatus } from './commands/review/types.js';
import { registerFulltextCommands } from './commands/fulltext/index.js';

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
  formatLibraryPath,
  formatDefaultLibraryHint,
} from './commands/register.js';
import { formatSuggestion } from './suggestions/index.js';
import { getSuggestion } from './suggestions/rules.js';
import {
  appendLogEntry,
  readLogEntries,
  computeQueryHash,
  buildCountLogEntry,
  buildPreviewLogEntry,
} from './commands/query/iteration-log.js';
import { executeQueryAssess } from './commands/query/assess.js';
import { formatLogOutput } from './commands/query/log.js';
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
import { parseIdentifierFile, checkCoverage, formatCheckResult, formatCheckResultJson } from './commands/check.js';
import { PubMedClient } from '../providers/pubmed/client.js';
import type { PubMedConfig } from '../providers/pubmed/types.js';

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
    .option('--quiet', 'suppress all output except errors', false)
    .option('--no-color', 'disable color output')
    .addHelpText('after', `
Workflow:
  1. query init → edit → validate / --dry-run        Query preparation
  2. search --preview → search                       Preview & execute
  3. results / summary / diff / check                Inspect & verify
  4. review init → extract → merge → status          Systematic review
  5. register / export                               Output

  Iterate: search → results -q → check → diff       Query refinement

Quick Start:
  $ search-hub query init "my search"            # Create query template
  $ search-hub search my-search --count-only     # Check hit counts
  $ search-hub search my-search                  # Execute search
  $ search-hub results <session>                 # Review titles`);

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
            globalOpts.config ? { explicitConfigPath: globalOpts.config } : {}
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
    .description('Validate query YAML file (auto-checks controlled vocabulary)')
    .argument('<file>', 'path to query YAML file')
    .option('--no-vocab', 'skip controlled vocabulary validation')
    .option('--no-cache', 'skip vocabulary lookup cache')
    .addHelpText('after', `
Examples:
  $ search-hub query validate ./diabetes-ai.yaml
  $ search-hub query validate ./diabetes-ai.yaml --no-vocab   # Skip MeSH check
  $ search-hub query validate ./diabetes-ai.yaml --no-cache   # Ignore cache`)
    .action(async (fileArg: string, opts: { vocab?: boolean; cache?: boolean }) => {
      const globalOpts = program.opts() as GlobalOptions;
      try {
        const file = await resolveQueryFile(fileArg);
        const noVocab = opts.vocab === false;
        const noCache = opts.cache === false;

        let cache: VocabCache | undefined;
        if (!noVocab && !noCache) {
          cache = new VocabCache();
          await cache.load();
        }

        const hasSchema = await detectSchemaLink(file);

        if (noVocab) {
          const result = await validateQueryCommand(file, { noVocab });

          if (!globalOpts.quiet) {
            let output = formatValidateResult(result, file);
            const suggestion = formatSuggestion(getSuggestion({
              command: 'query validate',
              queryFile: file,
              validationSuccess: result.success,
              hasSchemaLink: hasSchema,
            }));
            if (suggestion) output += '\n' + suggestion;
            console.log(output);
          }
          process.exitCode = !result.success
            ? EXIT_CODES.QUERY_ERROR
            : EXIT_CODES.SUCCESS;
          return;
        }

        const rateLimiter = new RateLimiter({ tokensPerSecond: 3 });
        const meshClient = new MeSHLookupClient({
          rateLimiter,
          ...(cache ? { cache } : {}),
        });

        // Create count validators for ERIC/Emtree
        const countValidators: CountVocabValidator[] = [];
        let config: Config | undefined;
        try {
          config = await loadConfig(
            globalOpts.config ? { explicitConfigPath: globalOpts.config } : {}
          );
        } catch {
          // Config not available — skip count validators
        }

        if (config) {
          const ericProvider = createProviderInstance('eric', config);
          if (ericProvider) {
            countValidators.push(
              createEricCountValidator(ericProvider, cache ? { cache } : undefined)
            );
          }

          const scopusProvider = createProviderInstance('scopus', config);
          if (scopusProvider) {
            countValidators.push(
              createEmtreeCountValidator(scopusProvider, cache ? { cache } : undefined)
            );
          }
        }

        const result = await validateQueryCommand(file, {
          meshClient,
          ...(countValidators.length > 0 ? { countValidators } : {}),
        });

        if (cache) {
          await cache.save();
        }

        if (!globalOpts.quiet) {
          let output = formatValidateResult(result, file);
          if (result.vocabResult) {
            output += formatVocabValidationOutput(result.vocabResult);
          }
          const suggestion = formatSuggestion(getSuggestion({
            command: 'query validate',
            queryFile: file,
            validationSuccess: result.success && !hasVocabErrors(result),
            hasSchemaLink: hasSchema,
          }));
          if (suggestion) output += '\n' + suggestion;
          console.log(output);
        }
        process.exitCode =
          !result.success || hasVocabErrors(result)
            ? EXIT_CODES.QUERY_ERROR
            : EXIT_CODES.SUCCESS;
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
    .action(async (fileArg: string, options: { db?: string }) => {
      const globalOpts = program.opts() as GlobalOptions;
      try {
        const file = await resolveQueryFile(fileArg);
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
    .command('inspect')
    .description('Show how a query resolves per provider (block replacements and added filters)')
    .argument('<file>', 'path to query YAML file')
    .option('--db <provider>', 'show resolution for specific provider only')
    .addHelpText('after', `
Examples:
  $ search-hub query inspect ./diabetes-ai.yaml            # All databases
  $ search-hub query inspect ./diabetes-ai.yaml --db pubmed # PubMed only`)
    .action(async (fileArg: string, options: { db?: string }) => {
      const globalOpts = program.opts() as GlobalOptions;
      try {
        const file = await resolveQueryFile(fileArg);
        const inspectOptions = options.db
          ? { providers: [options.db as ProviderName] }
          : {};
        const result = await inspectQueryCommand(file, inspectOptions);
        if (!result.success) {
          if (!globalOpts.quiet) {
            console.error(`\u2717 Failed to inspect: ${file}\n  Error: ${result.error}`);
          }
          process.exitCode = EXIT_CODES.QUERY_ERROR;
          return;
        }
        if (!globalOpts.quiet) {
          console.log(formatInspectOutput(result.result!));
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
    .command('init')
    .description('Generate a template query YAML file')
    .argument('<title>', 'query title (used for name field and filename)')
    .option('-o, --output <path>', 'write to specific file path')
    .option('--stdout', 'output to stdout instead of file')
    .option('--force', 'overwrite existing file', false)
    .addHelpText('after', `
Examples:
  $ search-hub query init "WBA pain mechanisms"              # → queries/wba-pain-mechanisms.yaml
  $ search-hub query init "WBA pain" -o ./custom-path.yaml   # Custom output path
  $ search-hub query init "WBA pain" --stdout                # Print to stdout`)
    .action(async (title: string, options: { output?: string; stdout?: boolean; force?: boolean }) => {
      const globalOpts = program.opts() as GlobalOptions;
      try {
        const result = await writeQueryTemplate({
          title,
          output: options.output,
          stdout: options.stdout,
          force: options.force,
        });
        if (!globalOpts.quiet) {
          if (result.success) {
            console.log(result.message);
            if (result.outputPath) {
              const suggestion = formatSuggestion(getSuggestion({
                command: 'query init',
                outputFile: result.outputPath,
              }));
              if (suggestion) console.log('\n' + suggestion);
              console.log('\nIterate: edit the same file and re-run step 3. Counts are logged automatically.');
            }
          } else {
            console.error(result.message);
          }
        }
        process.exitCode = result.success ? EXIT_CODES.SUCCESS : EXIT_CODES.GENERAL_ERROR;
      } catch (error) {
        if (!globalOpts.quiet) {
          console.error('Error:', error instanceof Error ? error.message : error);
        }
        process.exitCode = EXIT_CODES.GENERAL_ERROR;
      }
    });

  queryCommand
    .command('assess')
    .description('Record an assessment of the current query iteration')
    .argument('<file>', 'path to query YAML file')
    .option('--verdict <verdict>', 'assessment verdict (e.g., reject, good, refine)')
    .option('--precision <precision>', 'estimated precision (e.g., ~60%)')
    .option('--comment <comment>', 'free-text comment')
    .addHelpText('after', `
Examples:
  $ search-hub query assess query.yaml --verdict reject --comment "Too broad"
  $ search-hub query assess query.yaml --verdict good --precision "~60%"`)
    .action(async (fileArg: string, options: { verdict?: string; precision?: string; comment?: string }) => {
      const globalOpts = program.opts() as GlobalOptions;
      try {
        const file = await resolveQueryFile(fileArg);
        const result = await executeQueryAssess(file, options);
        if (result.success) {
          if (!globalOpts.quiet) {
            console.log('Assessment recorded.');
            const suggestion = formatSuggestion(getSuggestion({
              command: 'query assess',
              queryFile: file,
            }));
            if (suggestion) console.log(suggestion);
          }
          process.exitCode = EXIT_CODES.SUCCESS;
        } else {
          if (!globalOpts.quiet) {
            console.error(`Error: ${result.error}`);
          }
          process.exitCode = EXIT_CODES.GENERAL_ERROR;
        }
      } catch (error) {
        if (!globalOpts.quiet) {
          console.error('Error:', error instanceof Error ? error.message : error);
        }
        process.exitCode = EXIT_CODES.GENERAL_ERROR;
      }
    });

  queryCommand
    .command('log')
    .description('View the query iteration history')
    .argument('<file>', 'path to query YAML file')
    .option('--json', 'output as JSON')
    .addHelpText('after', `
Examples:
  $ search-hub query log query.yaml
  $ search-hub query log query.yaml --json`)
    .action(async (fileArg: string, options: { json?: boolean }) => {
      const globalOpts = program.opts() as GlobalOptions;
      try {
        const file = await resolveQueryFile(fileArg);
        const entries = await readLogEntries(file);
        if (!globalOpts.quiet) {
          console.log(formatLogOutput(entries, { json: options?.json }));
        }
        process.exitCode = EXIT_CODES.SUCCESS;
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
    .addOption(new Option('--sort <method>', 'sort results by relevance or date').choices(['relevance', 'date']))
    .option('--dry-run', 'show translated queries without executing')
    .option('--count-only', 'get hit counts without downloading results')
    .option('--preview', 'get hit counts and first 5 titles without creating session')
    .option('--skip-connection-test', 'skip API connection test during dry-run')
    .option('--no-resume', 'start fresh even if session exists')
    .option('--strict', 'require all targeted databases to succeed (exit non-zero on partial failure)')
    .addHelpText('after', `
Workflow position:
  query validate → [this command: search] → results / summary / diff

Examples:
  $ search-hub search ./diabetes-ai.yaml                # Search all databases
  $ search-hub search ./query.yaml --db pubmed,eric     # Specific databases
  $ search-hub search --db pubmed --query "diabetes[tiab]"  # Direct query
  $ search-hub search ./query.yaml --dry-run            # Preview translations
  $ search-hub search ./query.yaml --count-only         # Get hit counts only
  $ search-hub search ./query.yaml --max-results 100    # Limit results

Query features (use "query init" to see full template):
  filters:    year_from, year_to, language, publication_types
  exclude:    NOT terms per block (terms.exclude)
  mesh/eric:  controlled vocabulary (terms.mesh, terms.eric)
  providers:  per-database block replacements and filter additions`)
    .action(
      async (
        queryFile?: string,
        options?: {
          db?: string;
          query?: string;
          name?: string;
          maxResults?: string;
          sort?: string;
          dryRun?: boolean;
          countOnly?: boolean;
          preview?: boolean;
          skipConnectionTest?: boolean;
          resume?: boolean;
          strict?: boolean;
        }
      ) => {
        const globalOpts = program.opts() as GlobalOptions;
        try {
          // Resolve query file path if provided
          const resolvedQueryFile = queryFile ? await resolveQueryFile(queryFile) : undefined;

          // Parse and validate options
          const searchOpts = parseSearchOptions(resolvedQueryFile, {
            db: options?.db,
            query: options?.query,
            name: options?.name,
            maxResults: options?.maxResults,
            sort: options?.sort,
            dryRun: options?.dryRun,
            countOnly: options?.countOnly,
            preview: options?.preview,
            noResume: options?.resume === false,
            strict: options?.strict,
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
              dryRunConfig = await loadConfig(globalOpts.config ? { explicitConfigPath: globalOpts.config } : {});
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
              previewConfig = await loadConfig(globalOpts.config ? { explicitConfigPath: globalOpts.config } : {});
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

            // Auto-log preview results when using a query file
            if (searchOpts.queryFile) {
              try {
                const qContent = await readFile(searchOpts.queryFile, 'utf-8');
                const qHash = computeQueryHash(qContent);
                await appendLogEntry(searchOpts.queryFile, buildPreviewLogEntry(qHash, previews));
              } catch {
                // Logging failure should not break the command
              }
            }

            if (!globalOpts.quiet) {
              console.log(formatPreviewOutput(previews, searchOpts.queryFile));
              const suggestion = formatSuggestion(getSuggestion({
                command: 'search --preview',
                queryFile: searchOpts.queryFile,
              }));
              if (suggestion) console.log(suggestion);
            }

            const previewHasErrors = previews.some((p) => p.error);
            const previewAllFailed = previews.every((p) => p.error);
            if (previewAllFailed) {
              process.exitCode = EXIT_CODES.NETWORK_ERROR;
            } else if (previewHasErrors && searchOpts.strict) {
              process.exitCode = EXIT_CODES.NETWORK_ERROR;
            } else {
              process.exitCode = EXIT_CODES.SUCCESS;
            }
            if (previewHasErrors && !previewAllFailed && !globalOpts.quiet) {
              const failed = previews.filter((p) => p.error).map((p) => `${p.provider}: ${p.error}`);
              console.warn(`\nWarning: Some providers failed:\n  ${failed.join('\n  ')}`);
            }
            return;
          }

          // Handle count-only mode
          if (searchOpts.countOnly) {
            let countConfig;
            try {
              countConfig = await loadConfig(globalOpts.config ? { explicitConfigPath: globalOpts.config } : {});
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

            // Auto-log count results when using a query file
            if (searchOpts.queryFile) {
              try {
                const qContent = await readFile(searchOpts.queryFile, 'utf-8');
                const qHash = computeQueryHash(qContent);
                await appendLogEntry(searchOpts.queryFile, buildCountLogEntry(qHash, counts));
              } catch {
                // Logging failure should not break the command
              }
            }

            if (!globalOpts.quiet) {
              console.log(formatCountOnlyOutput(counts, searchOpts.queryFile));
              const suggestion = formatSuggestion(getSuggestion({
                command: 'search --count-only',
                queryFile: searchOpts.queryFile,
              }));
              if (suggestion) console.log(suggestion);
            }

            const countHasErrors = counts.some((c) => c.error);
            const countAllFailed = counts.every((c) => c.error);
            if (countAllFailed) {
              process.exitCode = EXIT_CODES.NETWORK_ERROR;
            } else if (countHasErrors && searchOpts.strict) {
              process.exitCode = EXIT_CODES.NETWORK_ERROR;
            } else {
              process.exitCode = EXIT_CODES.SUCCESS;
            }
            if (countHasErrors && !countAllFailed && !globalOpts.quiet) {
              const failed = counts.filter((c) => c.error).map((c) => `${c.provider}: ${c.error}`);
              console.warn(`\nWarning: Some providers failed:\n  ${failed.join('\n  ')}`);
            }
            return;
          }

          // Non-dry-run: actual search execution
          const sessionsDir = await getSessionsDir(globalOpts);
          let config;
          try {
            config = await loadConfig(
              globalOpts.config ? { explicitConfigPath: globalOpts.config } : {}
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
                  if (stats.error) {
                    console.log(`  ${provider}: FAILED - ${stats.error}`);
                  } else {
                    console.log(`  ${provider}: ${stats.retrieved} results`);
                  }
                  if (stats.warnings && stats.warnings.length > 0) {
                    for (const w of stats.warnings) {
                      console.warn(`  ⚠ ${provider}: ${w}`);
                    }
                  }
                }
              }
              // Show warning for partial success
              if (result.sessionStatus === 'partial' && result.results) {
                const failed = Object.entries(result.results)
                  .filter(([, s]) => s.error)
                  .map(([p, s]) => `${p}: ${s.error}`);
                if (failed.length > 0) {
                  console.warn(`\nWarning: Some providers failed:\n  ${failed.join('\n  ')}`);
                }
              }
              // Show next step suggestions
              if (result.sessionId) {
                const sessions = await listSessions(sessionsDir);
                const suggestionCmd = searchOpts.directQuery ? 'search --query' : 'search';
                // Find previous session with the same query name for diff suggestion
                const currentSession = sessions.find(s => s.id === result.sessionId);
                const previousSession = currentSession
                  ? sessions
                      .filter(s => s.name === currentSession.name && s.id !== result.sessionId)
                      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
                  : undefined;
                const suggestion = formatSuggestion(getSuggestion({
                  command: suggestionCmd,
                  sessionId: result.sessionId,
                  sessionStatus: result.sessionStatus,
                  sessionCount: sessions.length,
                  previousSessionId: previousSession?.id,
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
              globalOpts.config ? { explicitConfigPath: globalOpts.config } : {}
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
    .option('--id-type <type>', 'for ids format: doi, pmid, all')
    .option('--no-dedup', 'disable deduplication of results')
    .option('-q, --query <expr>', 'filter results with query expression')
    .addHelpText('after', `
Examples:
  $ search-hub export SESSION_ID                             # JSONL to stdout
  $ search-hub export SESSION_ID --format json               # JSON to stdout
  $ search-hub export SESSION_ID -q "year:2023"              # Filter by query
  $ search-hub export SESSION_ID -q "author:smith" --format ids  # Filtered IDs
  $ search-hub export SESSION_ID --format json -o results.json  # JSON to file
  $ search-hub export SESSION_ID --format ids --id-type doi  # Export DOIs to stdout
  $ search-hub export SESSION_ID --no-dedup  # Export without deduplication
  $ search-hub export SESSION_ID --format jsonl | jq '.title'  # Pipe to jq

Query syntax:
  Free text        diabetes             Search title and abstract
  title:VALUE      title:learning       Title substring
  abstract:VALUE   abstract:randomized  Abstract substring
  author:VALUE     author:tanaka        Author name substring
  journal:VALUE    journal:lancet       Journal name substring
  year:VALUE       year:2023            Exact year
  year:FROM-TO     year:2020-2024       Year range
  doi:VALUE        doi:10.1001/xxx      DOI exact match
  pmid:VALUE       pmid:12345678        PMID exact match
  source:VALUE     source:pubmed        Provider exact match

  Multiple terms: different fields = AND, same field = OR`)
    .action(
      async (
        sessionId: string,
        options?: {
          format?: string;
          output?: string;
          idType?: string;
          dedup?: boolean;
          query?: string;
        }
      ) => {
        const globalOpts = program.opts() as GlobalOptions;
        try {
          // Parse and validate options
          const exportOpts = parseExportOptions(sessionId, {
            format: options?.format,
            output: options?.output,
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
          const articles = await loadSessionArticles(session, sessionId, sessionsDir);

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

          // Apply -q filter
          const preFilterCount = exportArticles.length;
          let hasFilter = false;
          if (options?.query) {
            exportArticles = filterByQuery(exportArticles, options.query);
            hasFilter = true;
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
    .option('-q, --query <expr>', 'filter results with query expression')
    .option('--abstract', 'show abstracts with results')
    .option('--abstract-length <n>', 'maximum abstract length in characters (default: 300)')
    .addHelpText('after', `
Examples:
  $ search-hub results SESSION_ID                              # List all articles
  $ search-hub results SESSION_ID --limit 20                   # First 20 articles
  $ search-hub results SESSION_ID -q "diabetes"                # Free text filter
  $ search-hub results SESSION_ID -q "author:smith year:2023"  # Combined filter
  $ search-hub results SESSION_ID -q "doi:10.1001/xxx"         # Exact ID match
  $ search-hub results SESSION_ID --json                       # JSON output
  $ search-hub results SESSION_ID -q "source:pubmed"           # Only PubMed
  $ search-hub results SESSION_ID --abstract                   # Show abstracts

Query syntax:
  Free text        diabetes             Search title and abstract
  title:VALUE      title:learning       Title substring
  abstract:VALUE   abstract:randomized  Abstract substring
  author:VALUE     author:tanaka        Author name substring
  journal:VALUE    journal:lancet       Journal name substring
  year:VALUE       year:2023            Exact year
  year:FROM-TO     year:2020-2024       Year range
  doi:VALUE        doi:10.1001/xxx      DOI exact match
  pmid:VALUE       pmid:12345678        PMID exact match
  source:VALUE     source:pubmed        Provider exact match

  Multiple terms: different fields = AND, same field = OR`)
    .action(
      async (
        sessionId: string,
        options?: {
          limit?: string;
          offset?: string;
          json?: boolean;
          fields?: string;
          query?: string;
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
            query: options?.query,
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
          const articles = await loadSessionArticles(session, sessionId, sessionsDir);

          // Deduplicate articles
          const dedupResult = deduplicateArticles(articles);
          let displayArticles = dedupResult.articles;

          // Apply -q filter
          let filteredFrom: number | undefined;
          if (resultsOpts.query) {
            const preFilterCount = displayArticles.length;
            displayArticles = filterByQuery(displayArticles, resultsOpts.query);
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

              // Show suggestions
              const suggestion = formatSuggestion(getSuggestion({
                command: 'diff',
                sessionId: sessionId2,
                diffSession1Id: sessionId1,
                diffAddedCount: diff.added.length,
                diffRemovedCount: diff.removed.length,
              }));
              if (suggestion) {
                console.log(suggestion);
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

  // Register check command
  program
    .command('check')
    .description('Verify coverage of known articles against session results')
    .argument('<session-id>', 'session ID to check against')
    .option('--file <path>', 'file with identifiers (one per line)')
    .option('--doi <ids>', 'comma-separated DOIs to check')
    .option('--pmid <ids>', 'comma-separated PMIDs to check')
    .option('--json', 'output as JSON')
    .option('--missing-only', 'show only missing identifiers')
    .addHelpText('after', `
Examples:
  $ search-hub check SESSION --file known-dois.txt              # Check from file
  $ search-hub check SESSION --doi "10.1001/jama.2023.12345"    # Check single DOI
  $ search-hub check SESSION --pmid "37654321,36543210"         # Check PMIDs
  $ search-hub check SESSION --file refs.txt --json             # JSON output
  $ search-hub check SESSION --file refs.txt --missing-only     # Only missing

Input file format (one identifier per line):
  10.1001/jama.2023.12345          DOI (starts with "10.")
  37654321                          PMID (numeric only)
  DOI:10.1038/s41586-023-xxxxx    DOI (explicit prefix)
  PMID:36543210                    PMID (explicit prefix)
  arxiv:2301.12345                 arXiv ID (explicit prefix)
  # comment                        Comments and empty lines ignored`)
    .action(
      async (
        sessionId: string,
        options?: { file?: string; doi?: string; pmid?: string; json?: boolean; missingOnly?: boolean }
      ) => {
        const globalOpts = program.opts() as GlobalOptions;
        try {
          // Parse identifiers from input sources
          let identifiers;
          let source: string;

          if (options?.file) {
            const filePath = expandPath(options.file);
            let content: string;
            try {
              content = await readFile(filePath, 'utf-8');
            } catch {
              if (!globalOpts.quiet) {
                console.error(`Error: File not found: ${filePath}`);
              }
              process.exitCode = EXIT_CODES.GENERAL_ERROR;
              return;
            }
            try {
              identifiers = parseIdentifierFile(content);
            } catch (error) {
              if (!globalOpts.quiet) {
                console.error(`Error: ${error instanceof Error ? error.message : 'Failed to parse identifier file'}`);
              }
              process.exitCode = EXIT_CODES.GENERAL_ERROR;
              return;
            }
            source = options.file;
          } else if (options?.doi || options?.pmid) {
            const lines: string[] = [];
            if (options.doi) {
              lines.push(...options.doi.split(',').map(d => d.trim()).filter(Boolean));
            }
            if (options.pmid) {
              lines.push(...options.pmid.split(',').map(p => `PMID:${p.trim()}`).filter(Boolean));
            }
            identifiers = parseIdentifierFile(lines.join('\n'));
            source = 'command line';
          } else {
            if (!globalOpts.quiet) {
              console.error('Error: Provide --file, --doi, or --pmid');
            }
            process.exitCode = EXIT_CODES.GENERAL_ERROR;
            return;
          }

          if (identifiers.length === 0) {
            if (!globalOpts.quiet) {
              console.error('Error: No identifiers found in input');
            }
            process.exitCode = EXIT_CODES.GENERAL_ERROR;
            return;
          }

          // Load session
          const sessionsDir = await getSessionsDir(globalOpts);
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

          // Load articles and check coverage
          const articles = await loadSessionArticles(session, sessionId, sessionsDir);
          const result = checkCoverage(articles, identifiers);

          // Format output
          if (options?.json) {
            console.log(formatCheckResultJson(result, { sessionId, source }));
          } else {
            if (!globalOpts.quiet) {
              console.log(formatCheckResult(result, {
                sessionId,
                source,
                missingOnly: options?.missingOnly,
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
          process.exitCode = EXIT_CODES.GENERAL_ERROR;
        }
      }
    );

  // Register related command
  program
    .command('related')
    .description('Find related articles from seed PMIDs using PubMed ELink')
    .argument('[pmids...]', 'seed PMIDs')
    .option('-n, --name <string>', 'session name')
    .option('-m, --max-results <number>', 'max related articles to retrieve', '20')
    .option('-s, --from-session <id>', 'load seed PMIDs from existing session')
    .option('--pmid <pmids...>', 'seed PMIDs (alternative to positional args)')
    .option('-t, --term <filter>', 'additional PubMed filter (e.g., "review[filter]")')
    .addHelpText('after', `
Examples:
  $ search-hub related 12345678 23456789              # Find related articles
  $ search-hub related 12345678 --name my-related     # Custom session name
  $ search-hub related 12345678 -m 50                 # Get more results
  $ search-hub related --from-session SESSION --pmid 12345678
  $ search-hub related 12345678 -t "review[filter]"   # Filter by review type`)
    .action(
      async (
        pmidArgs: string[],
        options?: {
          name?: string;
          maxResults?: string;
          fromSession?: string;
          pmid?: string[];
          term?: string;
        }
      ) => {
        const globalOpts = program.opts() as GlobalOptions;
        try {
          const parsedOptions = parseRelatedOptions(pmidArgs, options ?? {});

          // Validate input
          const validation = validateRelatedInput(parsedOptions);
          if (!validation.valid) {
            if (!globalOpts.quiet) {
              console.error(`Error: ${validation.error}`);
            }
            process.exitCode = EXIT_CODES.GENERAL_ERROR;
            return;
          }

          const sessionsDir = await getSessionsDir(globalOpts);

          // Resolve seed PMIDs
          let seedPmids: string[];
          try {
            seedPmids = await resolveSeeds(parsedOptions, sessionsDir);
          } catch (error) {
            if (!globalOpts.quiet) {
              console.error(
                `Error: ${error instanceof Error ? error.message : 'Failed to resolve seeds'}`
              );
            }
            process.exitCode = EXIT_CODES.SESSION_ERROR;
            return;
          }

          if (seedPmids.length === 0) {
            if (!globalOpts.quiet) {
              console.error('Error: No PMIDs found to use as seeds.');
            }
            process.exitCode = EXIT_CODES.GENERAL_ERROR;
            return;
          }

          // Load config and create PubMed client
          const config = await loadConfig(
            globalOpts.config ? { explicitConfigPath: globalOpts.config } : {}
          );
          const providerConfig = config.providers.pubmed;
          const pubmedConfig: PubMedConfig = {
            email: providerConfig.email ?? 'search-hub@example.com',
            rateLimit: providerConfig.rate_limit,
            timeout: providerConfig.timeout,
            retries: providerConfig.retries,
          };
          if (providerConfig.api_key) {
            pubmedConfig.apiKey = providerConfig.api_key;
          }
          const rateLimiter = new RateLimiter({
            tokensPerSecond: pubmedConfig.rateLimit ?? (pubmedConfig.apiKey ? 10 : 3),
          });
          const client = new PubMedClient(pubmedConfig, rateLimiter);

          if (!globalOpts.quiet) {
            console.log(`Finding related articles for ${seedPmids.length} seed PMIDs...`);
          }

          // Call ELink to find related PMIDs (merged across seeds, deduplicated)
          const relatedArticles = await client.findRelatedMerged({
            ids: seedPmids,
            maxResults: parsedOptions.maxResults,
            ...(parsedOptions.term && { term: parsedOptions.term }),
          });

          const totalRelated = relatedArticles.length;

          if (totalRelated === 0) {
            if (!globalOpts.quiet) {
              console.log('No related articles found.');
            }
            process.exitCode = EXIT_CODES.SUCCESS;
            return;
          }

          const relatedPmids = relatedArticles.map(a => a.id);

          // Fetch full article records
          const articles = await client.fetch(relatedPmids);

          // Generate session name
          const sessionName = parsedOptions.name
            ?? `related-${new Date().toISOString().slice(0, 10)}`;

          // Create session
          const sessionFile = await createRelatedSession({
            name: sessionName,
            seeds: {
              ids: seedPmids,
              ...(parsedOptions.fromSession && { sourceSession: parsedOptions.fromSession }),
            },
            articles,
            sessionsDir,
          });

          // Display output
          if (!globalOpts.quiet) {
            console.log(formatRelatedOutput({
              sessionId: sessionFile.id,
              seedCount: seedPmids.length,
              totalRelated,
              retrievedCount: articles.length,
              articles,
            }));

            // Show suggestions
            const suggestion = getSuggestion({
              command: 'related',
              sessionId: sessionFile.id,
            });
            const suggestionText = formatSuggestion(suggestion);
            if (suggestionText) {
              console.log(suggestionText);
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

  // Register merge command
  program
    .command('merge')
    .description('Merge results from multiple search sessions')
    .argument('<session-ids...>', 'two or more session IDs to merge')
    .option('--name <string>', 'name for merged session')
    .option('--dry-run', 'show what would be merged without creating session')
    .option('--json', 'output as JSON')
    .addHelpText('after', `
Examples:
  $ search-hub merge session-v4 session-v9                  # Merge two sessions
  $ search-hub merge session-v4 session-v9 --name combined  # Merge with custom name
  $ search-hub merge session-a session-b session-c          # Merge three sessions
  $ search-hub merge session-v4 session-v9 --dry-run        # Preview merge`)
    .action(
      async (
        sessionIds: string[],
        options?: { name?: string; dryRun?: boolean; json?: boolean }
      ) => {
        const globalOpts = program.opts() as GlobalOptions;
        try {
          if (sessionIds.length < 2) {
            if (!globalOpts.quiet) {
              console.error('Error: At least two session IDs are required for merge');
            }
            process.exitCode = EXIT_CODES.GENERAL_ERROR;
            return;
          }

          const sessionsDir = await getSessionsDir(globalOpts);

          // Load all source sessions
          const sessions = new Map<string, ReturnType<typeof loadSession> extends Promise<infer T> ? T : never>();
          for (const sessionId of sessionIds) {
            try {
              const session = await loadSession(sessionId, sessionsDir);
              sessions.set(sessionId, session);
            } catch (error) {
              if (!globalOpts.quiet) {
                console.error(
                  `Error loading session '${sessionId}': ${error instanceof Error ? error.message : 'Failed to load session'}`
                );
              }
              process.exitCode = EXIT_CODES.SESSION_ERROR;
              return;
            }
          }

          // Validate sources
          const validation = validateMergeSources(sessions);
          if (!validation.valid) {
            if (!globalOpts.quiet) {
              console.error(`Error: ${validation.error}`);
            }
            process.exitCode = EXIT_CODES.SESSION_ERROR;
            return;
          }

          // Load articles from all sessions
          const sessionArticles = new Map<string, Awaited<ReturnType<typeof loadSessionArticles>>>();
          for (const [sessionId, session] of sessions) {
            const articles = await loadSessionArticles(session, sessionId, sessionsDir);
            sessionArticles.set(sessionId, articles);
          }

          // Merge articles
          const mergeResult = mergeArticles(sessionArticles);

          // Build output data
          const sources = [...sessions.entries()].map(([id, session]) => ({
            id,
            name: session.name,
            count: mergeResult.perSession.get(id) ?? 0,
          }));

          const byProviderCounts = new Map<string, number>();
          for (const [provider, articles] of mergeResult.byProvider) {
            byProviderCounts.set(provider, articles.length);
          }

          // Auto-generate name if not provided
          const firstSession = sessions.values().next().value;
          const mergeName = options?.name ?? (firstSession ? firstSession.name + '-merged' : 'merged');

          if (options?.dryRun) {
            // Dry run - show preview without creating session
            const outputData = {
              sessionId: '(dry-run)',
              totalBefore: mergeResult.totalBefore,
              totalAfter: mergeResult.totalAfter,
              duplicatesRemoved: mergeResult.duplicatesRemoved,
              sources,
              byProvider: byProviderCounts,
            };
            if (options.json) {
              console.log(formatSessionMergeJson(outputData));
            } else if (!globalOpts.quiet) {
              console.log(formatSessionMergeOutput(outputData));
            }
            process.exitCode = EXIT_CODES.SUCCESS;
            return;
          }

          // Create merged session
          const sessionSources = [...sessions.entries()].map(([id, session]) => ({
            id,
            name: session.name,
          }));

          const mergedSession = await createMergedSession({
            name: mergeName,
            sources: sessionSources,
            byProvider: mergeResult.byProvider,
            totalRetrieved: mergeResult.totalAfter,
            sessionsDir,
            sourceSessionIds: sessionIds,
          });

          // Format output
          const outputData = {
            sessionId: mergedSession.id,
            totalBefore: mergeResult.totalBefore,
            totalAfter: mergeResult.totalAfter,
            duplicatesRemoved: mergeResult.duplicatesRemoved,
            sources,
            byProvider: byProviderCounts,
          };

          if (options?.json) {
            console.log(formatSessionMergeJson(outputData));
          } else if (!globalOpts.quiet) {
            console.log(formatSessionMergeOutput(outputData));

            // Show suggestions
            const suggestion = getSuggestion({
              command: 'merge',
              sessionId: mergedSession.id,
            });
            const suggestionText = formatSuggestion(suggestion);
            if (suggestionText) {
              console.log(suggestionText);
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
    .option('--no-attach-fulltext', 'skip automatic fulltext attachment')
    .addHelpText('after', `
Examples:
  $ search-hub register SESSION_ID                # Register all results
  $ search-hub register SESSION_ID --with-abstracts
  $ search-hub register SESSION_ID --dry-run      # Preview only
  $ search-hub register SESSION_ID --no-attach-fulltext  # Skip fulltext attachment

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
          attachFulltext?: boolean;
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
            ...(options?.attachFulltext === false ? { noAttachFulltext: true } : {}),
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

            // Show fulltext attach summary
            if (record.fulltext) {
              const ft = record.fulltext.summary;
              console.log('\nFulltext attachment results:');
              if (ft.attached > 0) {
                const totalFiles = record.fulltext.attached.reduce((sum, a) => sum + a.files.length, 0);
                console.log(`  ✓ ${ft.attached} articles attached (${totalFiles} files)`);
              }
              if (ft.skipped > 0) {
                console.log(`  ⚠ ${ft.skipped} skipped`);
              }
              if (ft.failed > 0) {
                console.log(`  ✗ ${ft.failed} failed`);
              }
            }

            console.log(`\n${formatLibraryPath(sessionDir)}`);
            console.log(`Results saved to: ${join(sessionDir, 'registration.json')}`);
            console.log(`\n${formatDefaultLibraryHint(sessionDir)}`);

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
  $ search-hub review extract --session SESSION_ID --name title-screening  # Extract for review
  $ search-hub review merge --session SESSION_ID --name title-screening   # Merge reviews
  $ search-hub review export --session SESSION_ID --only included -o included.yaml`);

  reviewCommand
    .command('init')
    .description('Generate reviews.yaml from deduplicated search results')
    .requiredOption('--session <id>', 'session ID')
    .option('--mode <mode>', 'review mode: screening (exclusion-based) or picking (inclusion-based)')
    .option('-f, --force', 'overwrite existing reviews.yaml', false)
    .action(async (options: { session: string; mode?: string; force: boolean }) => {
      const globalOpts = program.opts() as GlobalOptions;
      try {
        if (options.mode && options.mode !== 'screening' && options.mode !== 'picking') {
          throw new Error(`Invalid mode: "${options.mode}". Must be "screening" or "picking".`);
        }
        const sessionsDir = await getSessionsDir(globalOpts);
        const initOptions: ReviewInitOptions = {
          sessionId: options.session,
          ...(options.mode && { mode: options.mode as 'screening' | 'picking' }),
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
            const suggestion = formatSuggestion(getSuggestion({
              command: 'review status',
              sessionId: options.session,
              reviewStatus: result,
            }));
            if (suggestion) console.log(suggestion);
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
    .option('--filter <type>', 'filter by status: pending, incomplete, all-uncertain, agreed-include, agreed-exclude, divided, finalized, all', 'all')
    .option('--json', 'output as JSON')
    .action(async (options: { session: string; filter?: string; json?: boolean }) => {
      const globalOpts = program.opts() as GlobalOptions;
      try {
        const validFilters: ListFilter[] = ['pending', 'incomplete', 'all-uncertain', 'agreed-include', 'agreed-exclude', 'divided', 'finalized', 'all'];
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
    .description('Extract subset to for-review/<name>/review.yaml for distributed review')
    .requiredOption('--session <id>', 'session ID')
    .requiredOption('--name <name>', 'name for the review subset (output: for-review/<name>/review.yaml)')
    .option('--filter <types>', 'filter by status (comma-separated): pending, incomplete, all-uncertain, agreed-include, agreed-exclude, divided, finalized')
    .option('--sort <method>', 'sort method: year, title, random, none', 'none')
    .option('--limit <n>', 'limit number of articles')
    .option('--offset <n>', 'skip first n articles')
    .option('--seed <n>', 'random seed for reproducible sorting')
    .option('--basis <type>', 'basis for review: title, abstract, or fulltext')
    .option('--reviewer <id>', 'reviewer identifier (e.g., "ai:claude")')
    .option('--finalize', 'extract for final decision (includes reviewHistory and finalDecision)')
    .action(async (options: {
      session: string;
      name: string;
      filter?: string;
      sort?: string;
      limit?: string;
      offset?: string;
      seed?: string;
      basis?: string;
      reviewer?: string;
      finalize?: boolean;
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
          name: options.name,
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

        // Reviewer is required for all extract modes
        if (!options.reviewer) {
          if (!globalOpts.quiet) {
            console.error('Error: --reviewer is required');
          }
          process.exitCode = EXIT_CODES.GENERAL_ERROR;
          return;
        }
        extractOptions.reviewer = options.reviewer;

        // Handle basis option
        if (options.basis) {
          const validBasis = ['title', 'abstract', 'fulltext'];
          if (!validBasis.includes(options.basis)) {
            if (!globalOpts.quiet) {
              console.error(`Error: Invalid basis '${options.basis}'. Valid values: ${validBasis.join(', ')}`);
            }
            process.exitCode = EXIT_CODES.GENERAL_ERROR;
            return;
          }
          extractOptions.basis = options.basis as 'title' | 'abstract' | 'fulltext';
        }

        if (options.finalize) {
          extractOptions.finalize = true;
        }

        const result = await executeReviewExtract(extractOptions, sessionsDir);
        if (!globalOpts.quiet) {
          console.log(`Extracted ${result.extractedCount} of ${result.totalMatching} articles to ${result.outputPath}`);
          const suggestion = formatSuggestion(getSuggestion({
            command: 'review extract',
            sessionId: options.session,
            extractName: options.name,
            extractedCount: result.extractedCount,
            totalMatching: result.totalMatching,
            extractLimit: extractOptions.limit,
            extractOffset: extractOptions.offset,
          }));
          if (suggestion) console.log(suggestion);
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
    .requiredOption('--name <name>', 'name of the review subset to merge (reads from for-review/<name>/review.yaml)')
    .option('--dry-run', 'show changes without applying', false)
    .action(async (options: { session: string; name: string; dryRun: boolean }) => {
      const globalOpts = program.opts() as GlobalOptions;
      try {
        const sessionsDir = await getSessionsDir(globalOpts);
        const mergeOptions: ReviewMergeOptions = {
          sessionId: options.session,
          name: options.name,
          ...(options.dryRun && { dryRun: options.dryRun }),
        };
        const result = await executeReviewMerge(mergeOptions, sessionsDir);
        if (!globalOpts.quiet) {
          console.log(formatMergeOutput(result, options.dryRun));
          if (!options.dryRun) {
            const statusResult = await executeReviewStatus({ sessionId: options.session }, sessionsDir);
            const suggestion = formatSuggestion(getSuggestion({
              command: 'review merge',
              sessionId: options.session,
              reviewStatus: statusResult,
            }));
            if (suggestion) console.log(suggestion);
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
    .command('mark')
    .description('Mark decisions in work files')
    .requiredOption('--file <path>', 'path to work file')
    .option('--id <id>', 'article ID to mark')
    .option('--decision <decision>', 'decision: include, exclude, or uncertain')
    .option('--comment <text>', 'optional comment')
    .action(async (options: {
      file: string;
      id?: string;
      decision?: string;
      comment?: string;
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

        // Validate required options
        if (!options.id || !options.decision) {
          if (!globalOpts.quiet) {
            console.error('Error: --id and --decision must be specified');
          }
          process.exitCode = EXIT_CODES.GENERAL_ERROR;
          return;
        }

        const markOptions: ReviewMarkOptions = {
          file: options.file,
          id: options.id,
          decision: options.decision as 'include' | 'exclude' | 'uncertain',
        };

        if (options.comment) markOptions.comment = options.comment;

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

  reviewCommand
    .command('finalize')
    .description('Auto-set finalDecision for articles with reviewer consensus')
    .requiredOption('--session <id>', 'session ID')
    .option('--dry-run', 'preview without changes', false)
    .option('--min-reviewers <n>', 'minimum agreeing reviewers needed', '1')
    .option('--decision <type>', 'only finalize this decision type (include or exclude)')
    .action(async (options: { session: string; dryRun: boolean; minReviewers: string; decision?: string }) => {
      const globalOpts = program.opts() as GlobalOptions;
      try {
        const sessionsDir = await getSessionsDir(globalOpts);
        if (options.decision && options.decision !== 'include' && options.decision !== 'exclude') {
          if (!globalOpts.quiet) {
            console.error(`Error: --decision must be "include" or "exclude", got "${options.decision}"`);
          }
          process.exitCode = EXIT_CODES.GENERAL_ERROR;
          return;
        }
        const finalizeOptions: ReviewFinalizeOptions = {
          sessionId: options.session,
          ...(options.dryRun && { dryRun: options.dryRun }),
          ...(options.decision && { decision: options.decision as 'include' | 'exclude' }),
        };
        const minReviewers = parseInt(options.minReviewers, 10);
        if (!Number.isNaN(minReviewers) && minReviewers > 1) {
          finalizeOptions.minReviewers = minReviewers;
        }
        const result = await executeReviewFinalize(finalizeOptions, sessionsDir);
        if (!globalOpts.quiet) {
          console.log(formatFinalizeOutput(result, {
            dryRun: options.dryRun,
            ...(finalizeOptions.decision && { decision: finalizeOptions.decision }),
          }));
          if (!options.dryRun) {
            const statusResult = await executeReviewStatus({ sessionId: options.session }, sessionsDir);
            const suggestion = formatSuggestion(getSuggestion({
              command: 'review finalize',
              sessionId: options.session,
              reviewStatus: statusResult,
            }));
            if (suggestion) console.log(suggestion);
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

        if (!(await sessionExists(sessionId, sessionsDir))) {
          if (!globalOpts.quiet) {
            console.error(`Error: session '${sessionId}' not found`);
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

  // Register fulltext command group (init, sync, convert, check)
  registerFulltextCommands(program, getSessionsDir);

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
  try {
    if (realpathSync(executedFile) === realpathSync(currentFile)) {
      main().catch((error) => {
        console.error('Fatal error:', error);
        process.exit(EXIT_CODES.GENERAL_ERROR);
      });
    }
  } catch (e: unknown) {
    // Bun compile uses virtual /$bunfs/ paths that realpathSync cannot resolve.
    // This is expected and safe to ignore in compiled binary context.
  }
}
