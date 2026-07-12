/**
 * Argv helpers for the update-check notifier and the `upgrade` command.
 *
 * These run before Commander parses argv (the async update check starts
 * before command dispatch), so they are best-effort token scanners.
 */
import type { Command } from 'commander';

/**
 * Collect flags (both `--long` and `-s`) for global options that take a value.
 * Used by {@link extractCommandName} so the subcommand parser can skip the
 * value after options like `--config <path>`.
 */
function collectValueTakingFlags(program: Command): Set<string> {
  const flags = new Set<string>();
  for (const opt of program.options) {
    if (!opt.required && !opt.optional) continue;
    if (opt.long) flags.add(opt.long);
    if (opt.short) flags.add(opt.short);
  }
  return flags;
}

/**
 * Extract the subcommand name from argv (best-effort).
 *
 * Skips global options that take a value so things like `--config upgrade`
 * are not misread as the `upgrade` subcommand. The set of value-taking
 * options is derived from the Commander program itself, so it stays in sync
 * with the option definitions.
 */
export function extractCommandName(argv: string[], program: Command): string {
  const valueTakingFlags = collectValueTakingFlags(program);
  let skipNext = false;
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token) continue;
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (token.startsWith('-')) {
      // `--opt=value` bundles its value, no skip needed.
      if (!token.includes('=') && valueTakingFlags.has(token)) skipNext = true;
      continue;
    }
    return token;
  }
  return '';
}

/**
 * Best-effort detection of `--no-update-check` in argv, without relying on
 * Commander having parsed yet (the async check starts before parseAsync).
 */
export function hasNoUpdateCheckFlag(argv: string[]): boolean {
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--no-update-check') return true;
  }
  return false;
}

/**
 * Best-effort detection of the global `--quiet` flag in argv, without relying
 * on Commander having parsed yet (the async check starts before parseAsync).
 * `--quiet` promises "suppress all output except errors", which includes the
 * update notice.
 */
export function hasQuietFlag(argv: string[]): boolean {
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--quiet') return true;
  }
  return false;
}

/**
 * Rewrite `search-hub upgrade --version <tag>` to `--version=<tag>`.
 *
 * The program has `.version(VERSION)` which registers a no-arg `--version`
 * flag at the root. Commander's parser consumes the root `--version` before
 * subcommand options, so the space-separated form is caught by the root
 * (prints + exits) instead of reaching `upgrade`'s `--version <tag>`. The
 * `=` form binds the value to the subcommand's option and sidesteps the
 * root flag.
 */
export function rewriteUpgradeVersionFlag(argv: string[], program: Command): string[] {
  if (extractCommandName(argv, program) !== 'upgrade') return argv;

  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--version' && i + 1 < argv.length) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        out.push(`--version=${next}`);
        i++;
        continue;
      }
    }
    if (token !== undefined) out.push(token);
  }
  return out;
}
