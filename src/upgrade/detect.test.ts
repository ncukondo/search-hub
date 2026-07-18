import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detectInstallMethod, isBunVirtualPath, resolveInvocationPath } from './detect.js';

describe('detectInstallMethod', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `upgrade-detect-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("returns 'binary' for a plain path under ~/.local/bin/search-hub (no node_modules/)", () => {
    const binDir = join(testDir, 'home', 'user', '.local', 'bin');
    mkdirSync(binDir, { recursive: true });
    const binPath = join(binDir, 'search-hub');
    writeFileSync(binPath, '#!/bin/sh\n');

    expect(detectInstallMethod(binPath)).toBe('binary');
  });

  it("returns 'npm-global' for a path containing node_modules/", () => {
    const binPath = join(
      testDir,
      'usr',
      'lib',
      'node_modules',
      '@ncukondo',
      'search-hub',
      'dist',
      'cli',
      'index.js',
    );
    mkdirSync(
      join(testDir, 'usr', 'lib', 'node_modules', '@ncukondo', 'search-hub', 'dist', 'cli'),
      { recursive: true },
    );
    writeFileSync(binPath, '#!/usr/bin/env node\n');

    expect(detectInstallMethod(binPath)).toBe('npm-global');
  });

  it("returns 'dev' for a symlink that resolves into a git worktree", () => {
    const repoDir = join(testDir, 'repo');
    mkdirSync(join(repoDir, '.git'), { recursive: true });
    mkdirSync(join(repoDir, 'bin'), { recursive: true });
    writeFileSync(join(repoDir, 'package.json'), '{"name":"search-hub"}\n');
    const realCli = join(repoDir, 'bin', 'cli.js');
    writeFileSync(realCli, '#!/usr/bin/env node\n');

    // NOTE: linkDir deliberately avoids `.local/bin/` / `/usr/local/bin/` so
    // the typical-binary-path fast path doesn't short-circuit this case.
    const linkDir = join(testDir, 'home', 'user', 'custom', 'bin');
    mkdirSync(linkDir, { recursive: true });
    const linkPath = join(linkDir, 'search-hub');
    symlinkSync(realCli, linkPath);

    expect(detectInstallMethod(linkPath)).toBe('dev');
  });

  it("returns 'npx' for a path under a typical npm cache (~/.npm/_npx/)", () => {
    const npxDir = join(
      testDir,
      'home',
      'user',
      '.npm',
      '_npx',
      'abc123',
      'node_modules',
      '@ncukondo',
      'search-hub',
      'dist',
      'cli',
    );
    mkdirSync(npxDir, { recursive: true });
    const npxPath = join(npxDir, 'index.js');
    writeFileSync(npxPath, '#!/usr/bin/env node\n');

    expect(detectInstallMethod(npxPath)).toBe('npx');
  });

  it("returns 'dev' even when the symlink target is also under node_modules (npm link)", () => {
    // npm link creates a symlink in a global node_modules pointing back into the source repo.
    const repoDir = join(testDir, 'src-repo');
    mkdirSync(join(repoDir, '.git'), { recursive: true });
    mkdirSync(join(repoDir, 'bin'), { recursive: true });
    writeFileSync(join(repoDir, 'package.json'), '{"name":"search-hub"}\n');
    const realCli = join(repoDir, 'bin', 'cli.js');
    writeFileSync(realCli, '#!/usr/bin/env node\n');

    const globalNm = join(testDir, 'global', 'lib', 'node_modules', '@ncukondo');
    mkdirSync(globalNm, { recursive: true });
    const linkedPkg = join(globalNm, 'search-hub');
    symlinkSync(repoDir, linkedPkg);
    const linkPath = join(linkedPkg, 'bin', 'cli.js');

    expect(detectInstallMethod(linkPath)).toBe('dev');
  });

  it("returns 'binary' when a dotfiles repo in $HOME has .git but the binary lives in ~/.local/bin", () => {
    // Regression: a user who manages $HOME as a git repo (dotfiles) should not
    // have `~/.local/bin/search-hub` misdetected as a dev checkout.
    const home = join(testDir, 'home', 'user');
    mkdirSync(join(home, '.git'), { recursive: true });
    // Intentionally no package.json at $HOME so it's not a search-hub checkout.
    const binDir = join(home, '.local', 'bin');
    mkdirSync(binDir, { recursive: true });
    const binPath = join(binDir, 'search-hub');
    writeFileSync(binPath, '#!/bin/sh\n');

    expect(detectInstallMethod(binPath)).toBe('binary');
  });

  it("returns 'binary' even if an ancestor dotfiles repo has package.json (typical binary path wins)", () => {
    const home = join(testDir, 'home', 'user');
    mkdirSync(join(home, '.git'), { recursive: true });
    writeFileSync(join(home, 'package.json'), '{"name":"dotfiles"}\n');
    const binDir = join(home, '.local', 'bin');
    mkdirSync(binDir, { recursive: true });
    const binPath = join(binDir, 'search-hub');
    writeFileSync(binPath, '#!/bin/sh\n');

    expect(detectInstallMethod(binPath)).toBe('binary');
  });

  it('falls back to process.argv[1] when argv1 is omitted', () => {
    // We don't assert a specific value (depends on the test runner path), just
    // that the function executes and returns one of the valid enum values.
    const method = detectInstallMethod();
    expect(['binary', 'npm-global', 'dev', 'npx']).toContain(method);
  });

  it("returns 'binary' when the path does not exist (best-effort fallback)", () => {
    const nonexistent = join(testDir, 'no-such', 'search-hub');
    expect(detectInstallMethod(nonexistent)).toBe('binary');
  });

  it('resolves via execPath when argv1 is a Bun virtual path (compiled binary in ~/.local/bin)', () => {
    // In a Bun-compiled binary, process.argv[1] is a virtual bunfs path; the
    // real on-disk location is process.execPath.
    const binDir = join(testDir, 'home', 'user', '.local', 'bin');
    mkdirSync(binDir, { recursive: true });
    const execPath = join(binDir, 'search-hub');
    writeFileSync(execPath, 'binary\n');

    expect(detectInstallMethod('/$bunfs/root/search-hub', execPath)).toBe('binary');
  });

  it("returns 'dev' when argv1 is a Bun virtual path and execPath is inside a repo checkout", () => {
    const repoDir = join(testDir, 'repo');
    mkdirSync(join(repoDir, '.git'), { recursive: true });
    mkdirSync(join(repoDir, 'dist'), { recursive: true });
    writeFileSync(join(repoDir, 'package.json'), '{"name":"search-hub"}\n');
    const execPath = join(repoDir, 'dist', 'search-hub-linux-x64');
    writeFileSync(execPath, 'binary\n');

    expect(detectInstallMethod('/$bunfs/root/search-hub', execPath)).toBe('dev');
  });
});

describe('isBunVirtualPath', () => {
  it('detects the unix bunfs virtual root', () => {
    expect(isBunVirtualPath('/$bunfs/root/search-hub')).toBe(true);
  });

  it('detects the windows bunfs virtual root', () => {
    expect(isBunVirtualPath('B:\\~BUN\\root\\search-hub.exe')).toBe(true);
  });

  it('does not flag regular paths', () => {
    expect(isBunVirtualPath('/home/user/.local/bin/search-hub')).toBe(false);
    expect(isBunVirtualPath('C:\\Users\\user\\bin\\search-hub.exe')).toBe(false);
  });
});

describe('resolveInvocationPath', () => {
  it('returns argv1 for a regular node invocation', () => {
    expect(resolveInvocationPath('/usr/lib/node_modules/x/cli.js', '/usr/bin/node')).toBe(
      '/usr/lib/node_modules/x/cli.js',
    );
  });

  it('returns execPath when argv1 is a Bun virtual path', () => {
    expect(resolveInvocationPath('/$bunfs/root/search-hub', '/home/u/.local/bin/search-hub')).toBe(
      '/home/u/.local/bin/search-hub',
    );
  });

  it('returns execPath when argv1 is empty (no script argument)', () => {
    expect(resolveInvocationPath('', '/home/u/.local/bin/search-hub')).toBe(
      '/home/u/.local/bin/search-hub',
    );
  });
});
