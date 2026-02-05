import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createProgram } from './index.js';
import type { GlobalOptions } from './index.js';
import { Command } from 'commander';

describe('dotenv loading', () => {
  it('calls dotenv.config({ quiet: true }) when the module is loaded', async () => {
    vi.resetModules();
    const configFn = vi.fn();
    vi.doMock('dotenv', () => ({ config: configFn }));
    await import('./index.js');
    expect(configFn).toHaveBeenCalledWith({ quiet: true });
    vi.restoreAllMocks();
  });
});

describe('CLI Entry Point', () => {
  describe('createProgram', () => {
    it('should create a program with correct name and version', () => {
      const program = createProgram();
      expect(program.name()).toBe('search-hub');
      expect(program.version()).toBeDefined();
    });

    it('should respond to help output', () => {
      const program = createProgram();
      const helpInfo = program.helpInformation();
      expect(helpInfo).toContain('--help');
      expect(helpInfo).toContain('search-hub');
    });

    it('should have --version option', () => {
      const program = createProgram();
      const versionOption = program.options.find(
        (opt) => opt.long === '--version'
      );
      expect(versionOption).toBeDefined();
    });
  });

  describe('Global Options', () => {
    let program: Command;

    beforeEach(() => {
      program = createProgram();
      program.exitOverride();
    });

    it('should support --config option', () => {
      const configOption = program.options.find(
        (opt) => opt.long === '--config'
      );
      expect(configOption).toBeDefined();
      expect(configOption?.short).toBe('-c');
    });

    it('should support --session-dir option', () => {
      const sessionDirOption = program.options.find(
        (opt) => opt.long === '--session-dir'
      );
      expect(sessionDirOption).toBeDefined();
    });

    it('should support --verbose option', () => {
      const verboseOption = program.options.find(
        (opt) => opt.long === '--verbose'
      );
      expect(verboseOption).toBeDefined();
      expect(verboseOption?.short).toBe('-v');
    });

    it('should support --quiet option', () => {
      const quietOption = program.options.find((opt) => opt.long === '--quiet');
      expect(quietOption).toBeDefined();
      expect(quietOption?.short).toBe('-q');
    });

    it('should support --no-color option', () => {
      const noColorOption = program.options.find(
        (opt) => opt.long === '--no-color'
      );
      expect(noColorOption).toBeDefined();
    });

    it('should parse global options correctly', async () => {
      const program = new Command();
      program
        .option('-c, --config <path>', 'path to config file')
        .option('--session-dir <path>', 'path to session directory')
        .option('-v, --verbose', 'enable verbose output', false)
        .option('-q, --quiet', 'suppress all output except errors', false)
        .option('--no-color', 'disable color output');

      program.exitOverride();
      await program.parseAsync([
        'node',
        'search-hub',
        '-c',
        '/custom/config.toml',
        '-v',
        '--no-color',
      ]);

      const opts = program.opts() as GlobalOptions;
      expect(opts.config).toBe('/custom/config.toml');
      expect(opts.verbose).toBe(true);
      expect(opts.color).toBe(false);
    });

    it('should have default values for global options', async () => {
      const program = new Command();
      program
        .option('-c, --config <path>', 'path to config file')
        .option('--session-dir <path>', 'path to session directory')
        .option('-v, --verbose', 'enable verbose output', false)
        .option('-q, --quiet', 'suppress all output except errors', false)
        .option('--no-color', 'disable color output');

      program.exitOverride();
      await program.parseAsync(['node', 'search-hub']);

      const opts = program.opts() as GlobalOptions;
      expect(opts.config).toBeUndefined();
      expect(opts.verbose).toBe(false);
      expect(opts.quiet).toBe(false);
      expect(opts.color).toBe(true);
    });
  });

  describe('init command', () => {
    it('should have init command registered', () => {
      const program = createProgram();
      const initCommand = program.commands.find((cmd) => cmd.name() === 'init');
      expect(initCommand).toBeDefined();
    });

    it('should have --force option on init command', () => {
      const program = createProgram();
      const initCommand = program.commands.find((cmd) => cmd.name() === 'init');
      expect(initCommand).toBeDefined();
      const forceOption = initCommand?.options.find(
        (opt) => opt.long === '--force'
      );
      expect(forceOption).toBeDefined();
    });
  });

  describe('main help sections', () => {
    /**
     * Helper to capture full help output including addHelpText sections.
     * Commander's helpInformation() only returns base help, not custom text.
     */
    function captureHelpOutput(program: Command): string {
      let output = '';
      program.configureOutput({
        writeOut: (str) => { output += str; },
        writeErr: (str) => { output += str; },
      });
      program.outputHelp();
      return output;
    }

    it('should include Quick Start section in help output', () => {
      const program = createProgram();
      const helpOutput = captureHelpOutput(program);
      expect(helpOutput).toContain('Quick Start:');
      expect(helpOutput).toContain('query init');
      expect(helpOutput).toContain('--count-only');
    });

    it('should include Workflow section in help output', () => {
      const program = createProgram();
      const helpOutput = captureHelpOutput(program);
      expect(helpOutput).toContain('Workflow:');
      expect(helpOutput).toContain('Query preparation');
      expect(helpOutput).toContain('Query refinement');
    });
  });

  describe('search command', () => {
    /**
     * Helper to capture full help output including addHelpText sections.
     */
    function captureSubcommandHelp(program: Command, commandName: string): string {
      const searchCommand = program.commands.find((cmd) => cmd.name() === commandName);
      if (!searchCommand) throw new Error(`Command ${commandName} not found`);
      let output = '';
      searchCommand.configureOutput({
        writeOut: (str) => { output += str; },
        writeErr: (str) => { output += str; },
      });
      searchCommand.outputHelp();
      return output;
    }

    it('should have --query option with improved description', () => {
      const program = createProgram();
      const helpOutput = captureSubcommandHelp(program, 'search');
      // Should mention database-native syntax and advanced usage
      expect(helpOutput).toContain('--query');
      expect(helpOutput).toContain('database-native');
      expect(helpOutput).toContain('prefer YAML');
    });
  });

  describe('command ordering', () => {
    it('should list query command before search command in help output', () => {
      const program = createProgram();
      const helpInfo = program.helpInformation();
      // Match command lines: "  query" and "  search" at the start of a line
      const commandsSection = helpInfo.split('Commands:')[1] || '';
      const queryMatch = commandsSection.match(/^\s+query\b/m);
      const searchMatch = commandsSection.match(/^\s+search\b/m);
      expect(queryMatch).not.toBeNull();
      expect(searchMatch).not.toBeNull();
      const queryIndex = queryMatch?.index ?? 0;
      const searchIndex = searchMatch?.index ?? 0;
      expect(queryIndex).toBeLessThan(searchIndex);
    });
  });

  describe('register command', () => {
    it('should have register command registered', () => {
      const program = createProgram();
      const registerCommand = program.commands.find((cmd) => cmd.name() === 'register');
      expect(registerCommand).toBeDefined();
    });

    it('should have --db option on register command', () => {
      const program = createProgram();
      const registerCommand = program.commands.find((cmd) => cmd.name() === 'register');
      expect(registerCommand).toBeDefined();
      const dbOption = registerCommand?.options.find(
        (opt) => opt.long === '--db'
      );
      expect(dbOption).toBeDefined();
    });

    it('should have --dry-run option on register command', () => {
      const program = createProgram();
      const registerCommand = program.commands.find((cmd) => cmd.name() === 'register');
      expect(registerCommand).toBeDefined();
      const dryRunOption = registerCommand?.options.find(
        (opt) => opt.long === '--dry-run'
      );
      expect(dryRunOption).toBeDefined();
    });

    it('should have --with-abstracts option on register command', () => {
      const program = createProgram();
      const registerCommand = program.commands.find((cmd) => cmd.name() === 'register');
      expect(registerCommand).toBeDefined();
      const withAbstractsOption = registerCommand?.options.find(
        (opt) => opt.long === '--with-abstracts'
      );
      expect(withAbstractsOption).toBeDefined();
    });
  });
});
