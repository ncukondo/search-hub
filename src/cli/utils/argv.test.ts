import { Command } from 'commander';
import { describe, expect, it } from 'vitest';
import {
  extractCommandName,
  hasNoUpdateCheckFlag,
  hasQuietFlag,
  rewriteUpgradeVersionFlag,
} from './argv.js';

function makeProgram(): Command {
  const program = new Command();
  program
    .name('search-hub')
    .version('0.0.0')
    .option('-c, --config <path>', 'path to config file')
    .option('--session-dir <path>', 'path to session directory')
    .option('-v, --verbose', 'enable verbose output', false);
  return program;
}

describe('extractCommandName', () => {
  it('returns the first non-option token after node and script', () => {
    expect(extractCommandName(['node', 'cli.js', 'status'], makeProgram())).toBe('status');
  });

  it('skips boolean flags', () => {
    expect(extractCommandName(['node', 'cli.js', '-v', 'search'], makeProgram())).toBe('search');
  });

  it('skips the value of value-taking global options', () => {
    expect(
      extractCommandName(['node', 'cli.js', '--config', 'upgrade', 'status'], makeProgram()),
    ).toBe('status');
    expect(extractCommandName(['node', 'cli.js', '--session-dir', 'upgrade'], makeProgram())).toBe(
      '',
    );
  });

  it('does not skip a value for --opt=value form', () => {
    expect(extractCommandName(['node', 'cli.js', '--config=x.toml', 'export'], makeProgram())).toBe(
      'export',
    );
  });

  it('returns empty string when no command is present', () => {
    expect(extractCommandName(['node', 'cli.js'], makeProgram())).toBe('');
    expect(extractCommandName(['node', 'cli.js', '--verbose'], makeProgram())).toBe('');
  });
});

describe('hasNoUpdateCheckFlag', () => {
  it('detects --no-update-check anywhere after the script', () => {
    expect(hasNoUpdateCheckFlag(['node', 'cli.js', 'status', '--no-update-check'])).toBe(true);
    expect(hasNoUpdateCheckFlag(['node', 'cli.js', '--no-update-check', 'status'])).toBe(true);
  });

  it('returns false when absent', () => {
    expect(hasNoUpdateCheckFlag(['node', 'cli.js', 'status'])).toBe(false);
  });
});

describe('hasQuietFlag', () => {
  it('detects --quiet anywhere after the script', () => {
    expect(hasQuietFlag(['node', 'cli.js', 'status', '--quiet'])).toBe(true);
    expect(hasQuietFlag(['node', 'cli.js', '--quiet', 'status'])).toBe(true);
  });

  it('returns false when absent', () => {
    expect(hasQuietFlag(['node', 'cli.js', 'status'])).toBe(false);
  });
});

describe('rewriteUpgradeVersionFlag', () => {
  it('rewrites `upgrade --version <tag>` to `--version=<tag>`', () => {
    expect(
      rewriteUpgradeVersionFlag(
        ['node', 'cli.js', 'upgrade', '--version', 'v1.2.3'],
        makeProgram(),
      ),
    ).toEqual(['node', 'cli.js', 'upgrade', '--version=v1.2.3']);
  });

  it('leaves a bare `upgrade --version` (no value) alone', () => {
    expect(
      rewriteUpgradeVersionFlag(['node', 'cli.js', 'upgrade', '--version'], makeProgram()),
    ).toEqual(['node', 'cli.js', 'upgrade', '--version']);
  });

  it('does not rewrite for other commands', () => {
    expect(
      rewriteUpgradeVersionFlag(['node', 'cli.js', 'status', '--version', 'x'], makeProgram()),
    ).toEqual(['node', 'cli.js', 'status', '--version', 'x']);
  });

  it('does not consume a following option as the tag value', () => {
    expect(
      rewriteUpgradeVersionFlag(
        ['node', 'cli.js', 'upgrade', '--version', '--check'],
        makeProgram(),
      ),
    ).toEqual(['node', 'cli.js', 'upgrade', '--version', '--check']);
  });
});
