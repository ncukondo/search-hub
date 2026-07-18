import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { UpgradeBinaryOptions, UpgradeResult } from '../../upgrade/apply-binary.js';
import type { UpgradeNpmOptions } from '../../upgrade/apply-npm.js';
import {
  type RunUpgradeDeps,
  type UpgradeCommandOptions,
  formatUpgradeResult,
  runUpgrade,
} from './upgrade.js';

function captureStream(): { stream: NodeJS.WritableStream; output: () => string } {
  const stream = new PassThrough();
  let buf = '';
  stream.on('data', (chunk) => {
    buf += String(chunk);
  });
  return { stream, output: () => buf };
}

function okResult(overrides: Partial<UpgradeResult> = {}): UpgradeResult {
  return {
    status: 'success',
    fromVersion: '0.23.1',
    toVersion: '0.24.0',
    ...overrides,
  };
}

function defaultDeps(overrides: Partial<RunUpgradeDeps> = {}): RunUpgradeDeps {
  const { stream: stdout } = captureStream();
  const { stream: stderr } = captureStream();
  return {
    installMethod: 'binary',
    argv1: '/home/user/.local/bin/search-hub',
    currentVersion: '0.23.1',
    upgradeBinaryFn: vi.fn(async () => okResult()),
    upgradeNpmFn: vi.fn(async () => okResult()),
    stdout,
    stderr,
    ...overrides,
  };
}

describe('runUpgrade', () => {
  it("dispatches to the binary strategy when installMethod='binary'", async () => {
    const upgradeBinaryFn = vi.fn(async () => okResult());
    const upgradeNpmFn = vi.fn(async (_o: UpgradeNpmOptions) => okResult());
    const result = await runUpgrade(
      {} as UpgradeCommandOptions,
      defaultDeps({
        installMethod: 'binary',
        upgradeBinaryFn,
        upgradeNpmFn,
      }),
    );

    expect(upgradeBinaryFn).toHaveBeenCalledTimes(1);
    expect(upgradeNpmFn).not.toHaveBeenCalled();
    expect(result.exitCode).toBe(0);
    expect(result.method).toBe('binary');
  });

  it("dispatches to the npm strategy when installMethod='npm-global'", async () => {
    const upgradeBinaryFn = vi.fn(async (_o: UpgradeBinaryOptions) => okResult());
    const upgradeNpmFn = vi.fn(async () => okResult({ status: 'guidance' }));
    const result = await runUpgrade(
      {} as UpgradeCommandOptions,
      defaultDeps({
        installMethod: 'npm-global',
        upgradeBinaryFn,
        upgradeNpmFn,
      }),
    );

    expect(upgradeBinaryFn).not.toHaveBeenCalled();
    expect(upgradeNpmFn).toHaveBeenCalledTimes(1);
    expect(result.exitCode).toBe(0);
    expect(result.method).toBe('npm-global');
  });

  it('prints guidance and exits 2 for dev install', async () => {
    const { stream: stderr, output } = captureStream();
    const upgradeBinaryFn = vi.fn(async (_o: UpgradeBinaryOptions) => okResult());
    const upgradeNpmFn = vi.fn(async (_o: UpgradeNpmOptions) => okResult());
    const result = await runUpgrade(
      {} as UpgradeCommandOptions,
      defaultDeps({
        installMethod: 'dev',
        stderr,
        upgradeBinaryFn,
        upgradeNpmFn,
      }),
    );

    expect(upgradeBinaryFn).not.toHaveBeenCalled();
    expect(upgradeNpmFn).not.toHaveBeenCalled();
    expect(result.exitCode).toBe(2);
    expect(output()).toMatch(/dev/i);
  });

  it('prints guidance and exits 2 for npx install', async () => {
    const { stream: stderr, output } = captureStream();
    const result = await runUpgrade(
      {} as UpgradeCommandOptions,
      defaultDeps({ installMethod: 'npx', stderr }),
    );

    expect(result.exitCode).toBe(2);
    expect(output()).toMatch(/npx/i);
  });

  it('passes --check through to the binary strategy without mutating anything', async () => {
    const assetUrl =
      'https://github.com/ncukondo/search-hub/releases/download/v0.24.0/search-hub-linux-x64';
    const upgradeBinaryFn = vi.fn(async (_o: UpgradeBinaryOptions) =>
      okResult({
        status: 'guidance',
        url: assetUrl,
      }),
    );
    const { stream: stdout, output } = captureStream();
    const result = await runUpgrade(
      { check: true } as UpgradeCommandOptions,
      defaultDeps({ installMethod: 'binary', upgradeBinaryFn, stdout }),
    );

    expect(upgradeBinaryFn).toHaveBeenCalledTimes(1);
    const [firstCallArgs] = upgradeBinaryFn.mock.calls;
    expect(firstCallArgs?.[0]).toMatchObject({ check: true });
    expect(result.exitCode).toBe(0);
    expect(output()).toContain(assetUrl);
  });

  it('passes --version and --yes through to the npm strategy', async () => {
    const upgradeNpmFn = vi.fn(async (_o: UpgradeNpmOptions) => okResult());
    await runUpgrade(
      { version: 'v0.25.0', yes: true } as UpgradeCommandOptions,
      defaultDeps({ installMethod: 'npm-global', upgradeNpmFn }),
    );

    const [firstCall] = upgradeNpmFn.mock.calls;
    expect(firstCall?.[0]).toMatchObject({ version: 'v0.25.0', yes: true });
  });

  it('resolves destPath for the binary strategy from argv1 (realpath)', async () => {
    const upgradeBinaryFn = vi.fn(async (_o: UpgradeBinaryOptions) => okResult());
    await runUpgrade(
      {} as UpgradeCommandOptions,
      defaultDeps({
        installMethod: 'binary',
        argv1: '/home/user/.local/bin/search-hub',
        upgradeBinaryFn,
      }),
    );

    const [firstCall] = upgradeBinaryFn.mock.calls;
    // destPath should be the resolved argv1 by default.
    expect(firstCall?.[0].destPath).toContain('search-hub');
  });

  it('honors --install-dir override for the binary strategy', async () => {
    const upgradeBinaryFn = vi.fn(async (_o: UpgradeBinaryOptions) => okResult());
    await runUpgrade(
      { installDir: '/opt/custom' } as UpgradeCommandOptions,
      defaultDeps({ installMethod: 'binary', upgradeBinaryFn }),
    );

    const [firstCall] = upgradeBinaryFn.mock.calls;
    const expected = join(
      '/opt/custom',
      process.platform === 'win32' ? 'search-hub.exe' : 'search-hub',
    );
    expect(firstCall?.[0].destPath).toBe(expected);
  });

  it("exits 1 when the strategy returns status='error'", async () => {
    const upgradeBinaryFn = vi.fn(
      async (): Promise<UpgradeResult> => ({
        status: 'error',
        fromVersion: '0.23.1',
        error: 'boom',
      }),
    );
    const result = await runUpgrade(
      {} as UpgradeCommandOptions,
      defaultDeps({ installMethod: 'binary', upgradeBinaryFn }),
    );

    expect(result.exitCode).toBe(1);
  });

  it('exits 0 when the strategy returns already-up-to-date', async () => {
    const upgradeBinaryFn = vi.fn(async () => ({
      status: 'already-up-to-date' as const,
      fromVersion: '0.24.0',
      toVersion: '0.24.0',
    }));
    const result = await runUpgrade(
      {} as UpgradeCommandOptions,
      defaultDeps({
        installMethod: 'binary',
        currentVersion: '0.24.0',
        upgradeBinaryFn,
      }),
    );

    expect(result.exitCode).toBe(0);
  });
});

describe('formatUpgradeResult', () => {
  it('formats a success result', () => {
    const text = formatUpgradeResult({
      status: 'success',
      fromVersion: '0.23.1',
      toVersion: '0.24.0',
    });
    expect(text).toMatch(/0\.23\.1/);
    expect(text).toMatch(/0\.24\.0/);
    expect(text).toMatch(/upgrade|upgraded/i);
  });

  it('formats an already-up-to-date result', () => {
    const text = formatUpgradeResult({
      status: 'already-up-to-date',
      fromVersion: '0.24.0',
      toVersion: '0.24.0',
    });
    expect(text).toMatch(/up.to.date/i);
  });

  it('formats a guidance result with the command', () => {
    const text = formatUpgradeResult({
      status: 'guidance',
      fromVersion: '0.23.1',
      toVersion: '0.24.0',
      message: 'npm i -g @ncukondo/search-hub@latest',
    });
    expect(text).toContain('npm i -g @ncukondo/search-hub@latest');
  });

  it('appends the asset url for a binary guidance result (no message)', () => {
    const url =
      'https://github.com/ncukondo/search-hub/releases/download/v0.24.0/search-hub-linux-x64';
    const text = formatUpgradeResult({
      status: 'guidance',
      fromVersion: '0.23.1',
      toVersion: '0.24.0',
      url,
    });
    expect(text).toContain('0.23.1');
    expect(text).toContain('0.24.0');
    expect(text).toContain(url);
  });

  it('formats an error result', () => {
    const text = formatUpgradeResult({
      status: 'error',
      fromVersion: '0.23.1',
      error: 'network down',
    });
    expect(text).toMatch(/error/i);
    expect(text).toContain('network down');
  });
});
