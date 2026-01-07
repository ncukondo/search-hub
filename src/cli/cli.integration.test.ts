import { describe, it, expect, beforeEach } from 'vitest';
import { createProgram } from './index.js';
import { EXIT_CODES, EXIT_CODE_DESCRIPTIONS } from './exit-codes.js';
import type { Command } from 'commander';

describe('CLI Integration', () => {
  let program: Command;

  beforeEach(() => {
    program = createProgram();
    program.exitOverride();
  });

  describe('Exit Codes', () => {
    it('should define SUCCESS as 0', () => {
      expect(EXIT_CODES.SUCCESS).toBe(0);
    });

    it('should define GENERAL_ERROR as 1', () => {
      expect(EXIT_CODES.GENERAL_ERROR).toBe(1);
    });

    it('should define CONFIG_ERROR as 2', () => {
      expect(EXIT_CODES.CONFIG_ERROR).toBe(2);
    });

    it('should define QUERY_ERROR as 3', () => {
      expect(EXIT_CODES.QUERY_ERROR).toBe(3);
    });

    it('should define NETWORK_ERROR as 4', () => {
      expect(EXIT_CODES.NETWORK_ERROR).toBe(4);
    });

    it('should define SESSION_ERROR as 5', () => {
      expect(EXIT_CODES.SESSION_ERROR).toBe(5);
    });

    it('should have descriptions for all exit codes', () => {
      expect(EXIT_CODE_DESCRIPTIONS[EXIT_CODES.SUCCESS]).toBeDefined();
      expect(EXIT_CODE_DESCRIPTIONS[EXIT_CODES.GENERAL_ERROR]).toBeDefined();
      expect(EXIT_CODE_DESCRIPTIONS[EXIT_CODES.CONFIG_ERROR]).toBeDefined();
      expect(EXIT_CODE_DESCRIPTIONS[EXIT_CODES.QUERY_ERROR]).toBeDefined();
      expect(EXIT_CODE_DESCRIPTIONS[EXIT_CODES.NETWORK_ERROR]).toBeDefined();
      expect(EXIT_CODE_DESCRIPTIONS[EXIT_CODES.SESSION_ERROR]).toBeDefined();
    });
  });

  describe('Command Registration', () => {
    it('should have init command', () => {
      const cmd = program.commands.find((c) => c.name() === 'init');
      expect(cmd).toBeDefined();
    });

    it('should have config command', () => {
      const cmd = program.commands.find((c) => c.name() === 'config');
      expect(cmd).toBeDefined();
    });

    it('should have query command group', () => {
      const cmd = program.commands.find((c) => c.name() === 'query');
      expect(cmd).toBeDefined();
    });

    it('should have query validate subcommand', () => {
      const queryCmd = program.commands.find((c) => c.name() === 'query');
      const validateCmd = queryCmd?.commands.find((c) => c.name() === 'validate');
      expect(validateCmd).toBeDefined();
    });

    it('should have query translate subcommand', () => {
      const queryCmd = program.commands.find((c) => c.name() === 'query');
      const translateCmd = queryCmd?.commands.find((c) => c.name() === 'translate');
      expect(translateCmd).toBeDefined();
    });

    it('should have status command', () => {
      const cmd = program.commands.find((c) => c.name() === 'status');
      expect(cmd).toBeDefined();
    });

    it('should have search command', () => {
      const cmd = program.commands.find((c) => c.name() === 'search');
      expect(cmd).toBeDefined();
    });

    it('should have resume command', () => {
      const cmd = program.commands.find((c) => c.name() === 'resume');
      expect(cmd).toBeDefined();
    });

    it('should have export command', () => {
      const cmd = program.commands.find((c) => c.name() === 'export');
      expect(cmd).toBeDefined();
    });
  });

  describe('Help Output', () => {
    it('should include all commands in help', () => {
      const helpInfo = program.helpInformation();
      expect(helpInfo).toContain('init');
      expect(helpInfo).toContain('config');
      expect(helpInfo).toContain('query');
      expect(helpInfo).toContain('status');
      expect(helpInfo).toContain('search');
      expect(helpInfo).toContain('resume');
      expect(helpInfo).toContain('export');
    });

    it('should have description for each command', () => {
      const helpInfo = program.helpInformation();
      expect(helpInfo).toContain('Initialize');
      expect(helpInfo).toContain('configuration');
    });
  });
});
