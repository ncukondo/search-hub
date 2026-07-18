/**
 * E2E tests for the self-upgrade feature.
 *
 * Covers the full `upgrade --check` flow against a mocked GitHub API,
 * the binary replace flow with a temp dir standing in for the install dir,
 * the notifier end-to-end with a fake cache file, and the compiled CLI via
 * subprocess (dev-install guidance, no notice on piped output).
 * No real network calls are made.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execCli } from '../cli/e2e-helpers.js';
import { runUpgrade } from '../cli/commands/upgrade.js';
import { upgradeBinary } from './apply-binary.js';
import { getLatestVersion } from './check.js';

function captureStream(): { stream: NodeJS.WritableStream; output: () => string } {
  const stream = new PassThrough();
  let buf = '';
  stream.on('data', (chunk) => {
    buf += String(chunk);
  });
  return { stream, output: () => buf };
}

function makeGitHubApiFetch(tag: string): typeof globalThis.fetch {
  return vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          tag_name: tag,
          html_url: `https://github.com/ncukondo/search-hub/releases/tag/${tag}`,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
  ) as unknown as typeof globalThis.fetch;
}

describe('upgrade e2e', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `upgrade-e2e-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  it('runs the full `upgrade --check` flow against a mocked GitHub API', async () => {
    const cachePath = join(testDir, 'update-check.json');
    const apiFetch = makeGitHubApiFetch('v9.9.9');
    const destPath = join(testDir, 'search-hub');
    writeFileSync(destPath, 'current binary\n', { mode: 0o755 });

    const { stream: stdout, output } = captureStream();
    const { stream: stderr } = captureStream();

    // Real command wiring -> real binary strategy -> real check module; only
    // the HTTP layer is mocked and the cache redirected to a temp file.
    const result = await runUpgrade(
      { check: true },
      {
        installMethod: 'binary',
        argv1: destPath,
        currentVersion: '0.23.1',
        upgradeBinaryFn: (options) =>
          upgradeBinary({
            ...options,
            platform: 'linux',
            arch: 'x64',
            getLatest: () => getLatestVersion({ cachePath, fetch: apiFetch }),
          }),
        stdout,
        stderr,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.result?.status).toBe('guidance');
    expect(result.result?.toVersion).toBe('9.9.9');
    expect(output()).toContain(
      'https://github.com/ncukondo/search-hub/releases/download/v9.9.9/search-hub-linux-x64',
    );
    // The check wrote the cache; a second run must not hit the network again.
    expect(existsSync(cachePath)).toBe(true);
    await getLatestVersion({ cachePath, fetch: apiFetch });
    expect(apiFetch).toHaveBeenCalledTimes(1);
    // --check must not touch the binary.
    expect(readFileSync(destPath, 'utf-8')).toBe('current binary\n');
  });

  it('replaces the binary in a temp install dir (download -> verify -> atomic replace)', async () => {
    const installDir = join(testDir, 'install');
    mkdirSync(installDir, { recursive: true });
    const destPath = join(installDir, 'search-hub');
    writeFileSync(destPath, '#!/bin/sh\necho "search-hub 0.23.1"\n', { mode: 0o755 });

    // The "downloaded asset" is a real executable script so the default
    // verifier (`{tmp} --version`) genuinely runs it.
    const newBinary = '#!/bin/sh\necho "search-hub 9.9.9"\n';
    const assetFetch = vi.fn(
      async () =>
        new Response(new TextEncoder().encode(newBinary), {
          status: 200,
          headers: { 'content-type': 'application/octet-stream' },
        }),
    ) as unknown as typeof globalThis.fetch;

    const result = await upgradeBinary({
      destPath,
      currentVersion: '0.23.1',
      version: 'v9.9.9',
      platform: 'linux',
      arch: 'x64',
      fetch: assetFetch,
    });

    expect(result.status).toBe('success');
    expect(result.toVersion).toBe('9.9.9');
    expect(result.message).toBe('search-hub 9.9.9');
    expect(readFileSync(destPath, 'utf-8')).toBe(newBinary);
    // No temp files left behind.
    expect(existsSync(`${destPath}.tmp.${process.pid}`)).toBe(false);
  });

  it('notifier end-to-end: fresh fake cache file produces a notice without network', async () => {
    const cachePath = join(testDir, 'update-check.json');
    writeFileSync(
      cachePath,
      JSON.stringify({
        checkedAt: new Date().toISOString(),
        latest: '9.9.9',
        url: 'https://github.com/ncukondo/search-hub/releases/tag/v9.9.9',
      }),
    );
    const networkFetch = vi.fn(async () => {
      throw new Error('network must not be hit when cache is fresh');
    }) as unknown as typeof globalThis.fetch;

    vi.resetModules();
    const { maybeStartUpdateCheck, flushUpdateNotice } = await import('./notifier.js');
    const { stream, output } = captureStream();

    await maybeStartUpdateCheck('status', {
      isTty: true,
      env: {},
      currentVersion: '0.23.1',
      getLatest: () => getLatestVersion({ cachePath, fetch: networkFetch }),
      output: stream,
    });
    flushUpdateNotice();

    expect(networkFetch).not.toHaveBeenCalled();
    const text = output();
    expect(text).toContain('>>> New version available: 0.23.1 -> 9.9.9');
    expect(text).toContain('Run: search-hub upgrade');
  });

  it('subprocess: `upgrade --check` from the repo checkout prints dev guidance and exits 2', async () => {
    const result = await execCli(['upgrade', '--check'], {
      env: { SEARCH_HUB_NO_UPDATE_CHECK: '1' },
    });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/dev install/i);
    expect(result.stderr).toContain('search-hub upgrade');
  });

  it('subprocess: piped output never contains the update notice', async () => {
    const result = await execCli(['--help']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('>>>');
    expect(result.stderr).not.toContain('>>>');
    // The upgrade command is registered and shows up in help.
    expect(result.stdout).toContain('upgrade');
  });
});
