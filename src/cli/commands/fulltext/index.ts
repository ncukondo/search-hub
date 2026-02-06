/**
 * Fulltext command group registration.
 */

import type { Command } from 'commander';
import { executeFulltextInit } from './init.js';
import { executeFulltextSync } from './sync.js';
import { executeFulltextConvert } from './convert.js';
import { executeFulltextCheck } from './check.js';
import { formatInitOutput, formatSyncOutput } from './format.js';
import type { GlobalOptions } from '../../index.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { sessionExists } from '../../../session/manager.js';
import { loadConfig } from '../../../config/index.js';
import { join } from 'node:path';

export function registerFulltextCommands(
  program: Command,
  getSessionsDir: (opts: GlobalOptions) => Promise<string>,
): void {
  const fulltextCommand = program
    .command('fulltext')
    .description('Fulltext management: retrieval, conversion, attachment')
    .addHelpText('after', `
Examples:
  $ search-hub fulltext init SESSION_ID               # Create directories for included articles
  $ search-hub fulltext init SESSION_ID --dry-run     # Preview what would be created
  $ search-hub fulltext sync SESSION_ID               # Detect and register added files
  $ search-hub fulltext sync SESSION_ID --dry-run     # Preview what would be synced
  $ search-hub fulltext convert SESSION_ID            # Convert PMC XML to Markdown
  $ search-hub fulltext check --session SESSION_ID   # Check OA availability`);

  fulltextCommand
    .command('init')
    .description('Create directories for included articles with meta.json and README')
    .argument('<session-id>', 'session ID')
    .option('--dry-run', 'show what would be created without creating', false)
    .action(async (sessionId: string, options: { dryRun: boolean }) => {
      const globalOpts = program.opts() as GlobalOptions;
      try {
        const sessionsDir = await getSessionsDir(globalOpts);

        const result = await executeFulltextInit({
          sessionId,
          sessionsDir,
          dryRun: options.dryRun,
        });

        if (!globalOpts.quiet) {
          console.log(formatInitOutput(result));
        }

        process.exitCode = EXIT_CODES.SUCCESS;
      } catch (error) {
        if (!globalOpts.quiet) {
          console.error(
            'Error:',
            error instanceof Error ? error.message : error,
          );
        }
        process.exitCode = EXIT_CODES.SESSION_ERROR;
      }
    });

  fulltextCommand
    .command('sync')
    .description('Detect and register manually added fulltext files')
    .argument('<session-id>', 'session ID')
    .option('--dry-run', 'show what would be synced without modifying', false)
    .action(async (sessionId: string, options: { dryRun: boolean }) => {
      const globalOpts = program.opts() as GlobalOptions;
      try {
        const sessionsDir = await getSessionsDir(globalOpts);

        const result = await executeFulltextSync({
          sessionId,
          sessionsDir,
          dryRun: options.dryRun,
        });

        if (!globalOpts.quiet) {
          console.log(formatSyncOutput(result));
        }

        process.exitCode = EXIT_CODES.SUCCESS;
      } catch (error) {
        if (!globalOpts.quiet) {
          console.error(
            'Error:',
            error instanceof Error ? error.message : error,
          );
        }
        process.exitCode = EXIT_CODES.SESSION_ERROR;
      }
    });

  fulltextCommand
    .command('convert')
    .description('Convert PMC XML files to Markdown')
    .argument('<session-id>', 'session ID')
    .option('--article <dir>', 'convert specific article directory')
    .action(async (sessionId: string, options?: { article?: string }) => {
      const globalOpts = program.opts() as GlobalOptions;
      try {
        const sessionsDir = await getSessionsDir(globalOpts);

        if (!(await sessionExists(sessionId, sessionsDir))) {
          if (!globalOpts.quiet) {
            console.error(`Error: session '${sessionId}' not found`);
          }
          process.exitCode = EXIT_CODES.SESSION_ERROR;
          return;
        }

        const convertOpts: Parameters<typeof executeFulltextConvert>[0] = { sessionId };
        if (options?.article) convertOpts.article = options.article;
        const result = await executeFulltextConvert(convertOpts, sessionsDir);

        if (!globalOpts.quiet) {
          console.log(`Converted: ${result.converted}  Skipped: ${result.skipped}  Failed: ${result.failed}`);
          for (const article of result.articles) {
            const icon = article.status === 'converted' ? '+' : article.status === 'skipped' ? '-' : '!';
            console.log(`  [${icon}] ${article.dirName}: ${article.title}`);
          }
        }

        process.exitCode = result.success ? EXIT_CODES.SUCCESS : EXIT_CODES.SESSION_ERROR;
      } catch (error) {
        if (!globalOpts.quiet) {
          console.error('Error:', error instanceof Error ? error.message : error);
        }
        process.exitCode = EXIT_CODES.SESSION_ERROR;
      }
    });

  fulltextCommand
    .command('check')
    .description('Check Open Access availability for included articles')
    .requiredOption('--session <id>', 'session ID')
    .option('--format <format>', 'output format (table or json)', 'table')
    .action(async (options: { session: string; format: string }) => {
      const globalOpts = program.opts() as GlobalOptions;
      try {
        const sessionsDir = await getSessionsDir(globalOpts);
        const sessionDir = join(sessionsDir, options.session);
        const config = await loadConfig(
          globalOpts.config ? { globalConfigPath: globalOpts.config } : {}
        );
        const result = await executeFulltextCheck({
          sessionDir,
          config: {
            unpaywallEmail: config.fulltext?.sources?.unpaywall_email ?? '',
            coreApiKey: config.fulltext?.sources?.core_api_key ?? '',
            preferSources: config.fulltext?.sources?.prefer_sources ?? ['pmc', 'arxiv', 'unpaywall', 'core'],
          },
        });

        if (options.format === 'json') {
          console.log(JSON.stringify(result, null, 2));
        } else if (!globalOpts.quiet) {
          console.log(`\nOA Status Summary:`);
          console.log(`  Open Access:    ${result.summary.open}`);
          console.log(`  Closed Access:  ${result.summary.closed}`);
          console.log(`  Unknown:        ${result.summary.unknown}`);
          console.log(`  Total:          ${result.summary.total}`);
          if (result.summary.open > 0) {
            console.log(`\nRun \`fulltext fetch\` to download available OA articles.`);
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
}
