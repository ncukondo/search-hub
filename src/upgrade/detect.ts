/**
 * Install-method detection for `search-hub upgrade`.
 *
 * Resolves the invocation path (normally `process.argv[1]`) through
 * `realpathSync` and pattern-matches the resolved path to determine how the
 * user installed search-hub.
 *
 * Bun-compiled binaries (`bun build --compile`, entry `src/cli/entry-bun.ts`)
 * are a special case: `process.argv[1]` is a virtual bunfs path
 * (`/$bunfs/root/...` on Unix, `B:\~BUN\root\...` on Windows) that does not
 * exist on disk and cannot be resolved with `realpathSync`. In that case the
 * real on-disk location of the running executable is `process.execPath`, so
 * detection falls back to it (see {@link resolveInvocationPath}).
 */
import { existsSync, realpathSync, statSync } from 'node:fs';
import { dirname, sep } from 'node:path';

export type InstallMethod = 'binary' | 'npm-global' | 'dev' | 'npx';

/**
 * Typical install locations for the single-binary `search-hub`. Matched as an
 * embedded path chain so a resolved path like `/home/user/.local/bin/search-hub`
 * wins over a `.git` directory in an ancestor (e.g. a dotfiles repo at $HOME).
 */
const BINARY_PATH_CHAINS: readonly string[][] = [
  ['.local', 'bin'],
  ['usr', 'local', 'bin'],
  ['opt', 'homebrew', 'bin'],
  ['opt', 'local', 'bin'],
];

/**
 * True when `path` is a virtual path inside a Bun-compiled executable's
 * embedded filesystem. Verified against Bun 1.x behavior: `process.argv[1]`
 * is `/$bunfs/root/<outfile>` on Unix and `B:\~BUN\root\<outfile>.exe` on
 * Windows, while `process.execPath` points at the real compiled binary.
 */
export function isBunVirtualPath(path: string): boolean {
  return path.startsWith('/$bunfs/') || /^[A-Za-z]:\\~BUN\\/.test(path) || path.includes('/~BUN/');
}

/**
 * Resolve the effective on-disk invocation path: `argv1` for regular node
 * invocations, `execPath` when running inside a Bun-compiled binary (where
 * `argv1` is a virtual bunfs path) or when `argv1` is missing.
 */
export function resolveInvocationPath(
  argv1: string | undefined = process.argv[1],
  execPath: string = process.execPath,
): string {
  if (!argv1 || isBunVirtualPath(argv1)) return execPath;
  return argv1;
}

function safeRealpath(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

function containsSegment(path: string, segment: string): boolean {
  const wrapped = `${sep}${segment}${sep}`;
  return path.includes(wrapped) || path.endsWith(`${sep}${segment}`);
}

function containsPathChain(path: string, chain: readonly string[]): boolean {
  const wrapped = `${sep}${chain.join(sep)}${sep}`;
  return path.includes(wrapped);
}

function isTypicalBinaryPath(path: string): boolean {
  return BINARY_PATH_CHAINS.some((chain) => containsPathChain(path, chain));
}

/**
 * True only when `startPath` is inside a git worktree that looks like a
 * search-hub checkout (i.e. the repo root contains `package.json`).
 *
 * The `package.json` check avoids false positives for unrelated ancestor
 * repos — e.g. a dotfiles repo at $HOME picking up a plain binary installed
 * at `~/.local/bin/search-hub`.
 */
function isInsideGitWorktree(startPath: string): boolean {
  let current: string;
  try {
    current = statSync(startPath).isDirectory() ? startPath : dirname(startPath);
  } catch {
    current = dirname(startPath);
  }
  while (true) {
    if (existsSync(`${current}${sep}.git`)) {
      return existsSync(`${current}${sep}package.json`);
    }
    const parent = dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

export function detectInstallMethod(argv1?: string, execPath?: string): InstallMethod {
  const source = resolveInvocationPath(argv1, execPath ?? process.execPath);
  if (!source) return 'binary';

  const resolved = safeRealpath(source);

  if (containsSegment(resolved, '_npx')) return 'npx';
  if (isTypicalBinaryPath(resolved)) return 'binary';
  if (isInsideGitWorktree(resolved)) return 'dev';
  if (containsSegment(resolved, 'node_modules')) return 'npm-global';
  return 'binary';
}
