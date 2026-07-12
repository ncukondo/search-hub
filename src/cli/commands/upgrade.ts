/**
 * `search-hub upgrade` command — applies a new release via the detected
 * install method.
 *
 * Exit codes: 0 = success / already up to date, 1 = upgrade failed,
 * 2 = install method cannot be upgraded automatically (dev/npx).
 */
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import {
  type UpgradeBinaryOptions,
  type UpgradeResult,
  upgradeBinary,
} from '../../upgrade/apply-binary.js';
import { type UpgradeNpmOptions, upgradeNpmGlobal } from '../../upgrade/apply-npm.js';
import {
  type InstallMethod,
  detectInstallMethod,
  resolveInvocationPath,
} from '../../upgrade/detect.js';
import { VERSION } from '../../version.js';

export interface UpgradeCommandOptions {
  check?: boolean;
  version?: string;
  yes?: boolean;
  installDir?: string;
}

export interface RunUpgradeDeps {
  installMethod?: InstallMethod;
  argv1?: string;
  currentVersion?: string;
  upgradeBinaryFn?: (options: UpgradeBinaryOptions) => Promise<UpgradeResult>;
  upgradeNpmFn?: (options: UpgradeNpmOptions) => Promise<UpgradeResult>;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
}

export interface RunUpgradeResult {
  exitCode: 0 | 1 | 2;
  method: InstallMethod;
  result?: UpgradeResult;
}

function resolveDestPath(argv1: string, installDir: string | undefined): string {
  if (installDir) {
    const basename = process.platform === 'win32' ? 'search-hub.exe' : 'search-hub';
    return join(installDir, basename);
  }
  try {
    return realpathSync(argv1);
  } catch {
    return argv1;
  }
}

function devGuidance(method: 'dev' | 'npx'): string {
  if (method === 'npx') {
    return (
      'Detected an npx invocation (cache-resident copy). `search-hub upgrade` does nothing here — ' +
      'npx fetches the latest on each run, or pin a version with `npx @ncukondo/search-hub@<tag>`.\n'
    );
  }
  return (
    'Detected a dev install (npm link or in-tree). `search-hub upgrade` does not modify dev trees. ' +
    'Use `git pull && npm run build` in the source checkout, or reinstall with `install.sh` ' +
    'or `npm i -g @ncukondo/search-hub`.\n'
  );
}

function exitCodeFor(status: UpgradeResult['status']): 0 | 1 {
  return status === 'error' ? 1 : 0;
}

export function formatUpgradeResult(result: UpgradeResult): string {
  const from = result.fromVersion ?? '?';
  const to = result.toVersion ?? '?';
  switch (result.status) {
    case 'success':
      return `Upgraded search-hub ${from} -> ${to}`;
    case 'already-up-to-date':
      return `Already up to date (${to})`;
    case 'guidance': {
      const base = result.message ?? `Update available: ${from} -> ${to}`;
      return result.url ? `${base} (${result.url})` : base;
    }
    case 'error':
      return `Error: ${result.error ?? 'upgrade failed'}`;
  }
}

function buildBinaryOptions(
  options: UpgradeCommandOptions,
  argv1: string,
  currentVersion: string
): UpgradeBinaryOptions {
  const destPath = resolveDestPath(argv1, options.installDir);
  const out: UpgradeBinaryOptions = { destPath, currentVersion };
  if (options.check !== undefined) out.check = options.check;
  if (options.version !== undefined) out.version = options.version;
  return out;
}

function buildNpmOptions(
  options: UpgradeCommandOptions,
  currentVersion: string
): UpgradeNpmOptions {
  const out: UpgradeNpmOptions = { currentVersion };
  if (options.check !== undefined) out.check = options.check;
  if (options.yes !== undefined) out.yes = options.yes;
  if (options.version !== undefined) out.version = options.version;
  return out;
}

export async function runUpgrade(
  options: UpgradeCommandOptions,
  deps: RunUpgradeDeps = {}
): Promise<RunUpgradeResult> {
  // resolveInvocationPath handles the Bun-compiled binary case where
  // process.argv[1] is a virtual bunfs path (see src/upgrade/detect.ts).
  const argv1 = deps.argv1 ?? resolveInvocationPath();
  const installMethod = deps.installMethod ?? detectInstallMethod(deps.argv1);
  const currentVersion = deps.currentVersion ?? VERSION;
  const upgradeBinaryFn = deps.upgradeBinaryFn ?? upgradeBinary;
  const upgradeNpmFn = deps.upgradeNpmFn ?? upgradeNpmGlobal;
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;

  if (installMethod === 'dev' || installMethod === 'npx') {
    stderr.write(devGuidance(installMethod));
    return { exitCode: 2, method: installMethod };
  }

  const result =
    installMethod === 'binary'
      ? await upgradeBinaryFn(buildBinaryOptions(options, argv1, currentVersion))
      : await upgradeNpmFn(buildNpmOptions(options, currentVersion));

  const target = result.status === 'error' ? stderr : stdout;
  target.write(`${formatUpgradeResult(result)}\n`);

  return { exitCode: exitCodeFor(result.status), method: installMethod, result };
}

export function registerUpgradeCommand(program: Command): void {
  program
    .command('upgrade')
    .description('Upgrade search-hub to the latest release (or a pinned version)')
    .option('--check', 'Report current vs. latest without applying any upgrade')
    .option('--version <tag>', 'Pin to a specific release tag (e.g. v0.23.1)')
    .option('-y, --yes', 'Skip confirmation prompts (applies to npm-global strategy)')
    .option('--install-dir <path>', 'Override install directory for the single-binary strategy')
    .addHelpText('after', `
Exit codes:
  0  Already up to date, or upgrade completed successfully
  1  Upgrade failed (network, permissions, verification)
  2  Install method cannot be upgraded automatically (dev/npx)

Examples:
  $ search-hub upgrade                   # Upgrade to the latest release
  $ search-hub upgrade --check           # Report current vs. latest only
  $ search-hub upgrade --version v0.23.1 # Pin to a specific release
  $ search-hub upgrade -y                # npm-global: run npm without prompting`)
    .action(async (options: UpgradeCommandOptions) => {
      const result = await runUpgrade(options);
      process.exitCode = result.exitCode;
    });
}
