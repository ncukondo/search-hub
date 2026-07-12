/**
 * Update-check notifier.
 *
 * Kicks off an async version check at CLI entry, then prints a one-line
 * ASCII notice to stderr after the user's command completes — but only if
 * the check has already resolved by then. The user's command is never
 * delayed, and machine-readable stdout (JSON/YAML output) is never touched:
 * the notice goes to stderr and only when stdout is a TTY.
 */
import { VERSION } from '../version.js';
import { type ReleaseInfo, getLatestVersion } from './check.js';

/**
 * Commands that never trigger the check. search-hub has no long-running or
 * completion commands; only `upgrade` itself is suppressed (redundant there).
 * Machine-facing output paths are covered by the non-TTY suppression rule.
 */
const SUPPRESSED_COMMANDS = new Set(['upgrade']);

/**
 * Abort the notifier's version check after this long. The check is fire-and
 * -forget, but an in-flight fetch keeps the event loop alive — without a
 * timeout, a hung connection would delay process exit for minutes.
 */
const CHECK_TIMEOUT_MS = 3000;

export interface NotifierOptions {
  isTty?: boolean;
  env?: NodeJS.ProcessEnv;
  currentVersion?: string;
  getLatest?: () => Promise<ReleaseInfo | null>;
  output?: NodeJS.WritableStream;
  /** When true, suppress the check (e.g. user passed `--no-update-check`). */
  noUpdateCheck?: boolean;
  /** When true, suppress the check (global `--quiet`: only errors may print). */
  quiet?: boolean;
}

interface NotifierState {
  result: ReleaseInfo | null;
  currentVersion: string;
  output: NodeJS.WritableStream;
  printed: boolean;
}

let state: NotifierState | null = null;
let exitListenerRegistered = false;

function ensureExitListener(): void {
  if (exitListenerRegistered) return;
  exitListenerRegistered = true;
  process.on('exit', () => {
    flushUpdateNotice();
  });
}

function isSuppressed(
  command: string,
  env: NodeJS.ProcessEnv,
  isTty: boolean,
  noUpdateCheckFlag: boolean,
  quiet: boolean
): boolean {
  if (!isTty) return true;
  if (noUpdateCheckFlag) return true;
  if (quiet) return true;
  if (env['SEARCH_HUB_NO_UPDATE_CHECK'] === '1') return true;
  if (SUPPRESSED_COMMANDS.has(command)) return true;
  return false;
}

/**
 * Kicks off the async update check. Returns a promise that resolves once the
 * check is done (or immediately, if the check was suppressed). Production
 * callers typically ignore the returned promise; tests can await it.
 */
export function maybeStartUpdateCheck(
  command: string,
  options: NotifierOptions = {}
): Promise<void> {
  state = null;

  const env = options.env ?? process.env;
  const isTty = options.isTty ?? process.stdout.isTTY === true;
  const noUpdateCheck = options.noUpdateCheck ?? false;
  const quiet = options.quiet ?? false;

  if (isSuppressed(command, env, isTty, noUpdateCheck, quiet)) return Promise.resolve();

  const currentVersion = options.currentVersion ?? VERSION;
  const output = options.output ?? process.stderr;
  const getLatest =
    options.getLatest ?? (() => getLatestVersion({ timeoutMs: CHECK_TIMEOUT_MS }));

  const localState: NotifierState = {
    result: null,
    currentVersion,
    output,
    printed: false,
  };
  state = localState;
  ensureExitListener();

  return getLatest().then(
    (releaseInfo) => {
      localState.result = releaseInfo;
    },
    () => {
      // Errors are silent; nothing will be printed.
    }
  );
}

interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

const SEMVER_RE =
  /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function parseSemver(version: string): ParsedVersion | null {
  const match = SEMVER_RE.exec(version);
  if (!match) return null;
  const [, major, minor, patch, prerelease] = match;
  if (major === undefined || minor === undefined || patch === undefined) return null;
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    prerelease: prerelease ? prerelease.split('.') : [],
  };
}

/** Semver precedence for prerelease identifier lists (empty = full release). */
function comparePrerelease(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  // A version without prerelease identifiers outranks one with them.
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const idA = a[i];
    const idB = b[i];
    // The longer identifier list wins once the shared prefix is equal.
    if (idA === undefined) return -1;
    if (idB === undefined) return 1;
    const numA = /^\d+$/.test(idA) ? Number(idA) : null;
    const numB = /^\d+$/.test(idB) ? Number(idB) : null;
    if (numA !== null && numB !== null) {
      if (numA !== numB) return numA < numB ? -1 : 1;
    } else if (numA !== null) {
      // Numeric identifiers rank below alphanumeric ones.
      return -1;
    } else if (numB !== null) {
      return 1;
    } else if (idA !== idB) {
      return idA < idB ? -1 : 1;
    }
  }
  return 0;
}

/**
 * True when `candidate` is a strictly newer semver than `current`. Falls back
 * to plain inequality when either side is not parseable as semver, so odd
 * tags still produce a notice rather than being silently ignored.
 */
export function isNewerVersion(candidate: string, current: string): boolean {
  const a = parseSemver(candidate);
  const b = parseSemver(current);
  if (!a || !b) return candidate !== current;
  if (a.major !== b.major) return a.major > b.major;
  if (a.minor !== b.minor) return a.minor > b.minor;
  if (a.patch !== b.patch) return a.patch > b.patch;
  return comparePrerelease(a.prerelease, b.prerelease) > 0;
}

export function flushUpdateNotice(): void {
  if (!state || state.printed) return;
  const { result, currentVersion, output } = state;
  if (!result) return;
  // Only a strictly newer release warrants a notice; a local version that is
  // ahead of the latest release (e.g. bumped but unreleased) must stay quiet.
  if (!isNewerVersion(result.latest, currentVersion)) return;
  state.printed = true;
  output.write(
    `\n>>> New version available: ${currentVersion} -> ${result.latest}\n    Run: search-hub upgrade\n`
  );
}
