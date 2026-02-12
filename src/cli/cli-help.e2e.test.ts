/**
 * E2E Tests for CLI Help Discoverability
 *
 * Tests that CLI help messages guide users toward the optimal workflow:
 * - Main help includes Quick Start and Query Refinement sections
 * - Search command help shows improved --query description
 * - Query command appears before search in help output
 */
import { describe, it, expect } from 'vitest';
import { createProgram } from './index.js';
import type { Command } from 'commander';

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

/**
 * Helper to capture full help output for a subcommand.
 */
function captureSubcommandHelp(program: Command, commandName: string): string {
  const subcommand = program.commands.find((cmd) => cmd.name() === commandName);
  if (!subcommand) throw new Error(`Command ${commandName} not found`);
  let output = '';
  subcommand.configureOutput({
    writeOut: (str) => { output += str; },
    writeErr: (str) => { output += str; },
  });
  subcommand.outputHelp();
  return output;
}

describe('CLI Help Discoverability E2E', () => {
  describe('main help output', () => {
    it('should include Quick Start section', () => {
      const program = createProgram();
      const helpOutput = captureHelpOutput(program);

      expect(helpOutput).toContain('Quick Start:');
      expect(helpOutput).toContain('query init');
      expect(helpOutput).toContain('--count-only');
      expect(helpOutput).toContain('results <session>');
    });

    it('should include Workflow section', () => {
      const program = createProgram();
      const helpOutput = captureHelpOutput(program);

      expect(helpOutput).toContain('Workflow:');
      expect(helpOutput).toContain('Query preparation');
      expect(helpOutput).toContain('Query refinement');
    });

    it('should list query command before search command', () => {
      const program = createProgram();
      const helpInfo = program.helpInformation();

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

  describe('search command help', () => {
    it('should show improved --query option description', () => {
      const program = createProgram();
      const helpOutput = captureSubcommandHelp(program, 'search');

      expect(helpOutput).toContain('--query');
      expect(helpOutput).toContain('database-native');
      expect(helpOutput).toContain('prefer YAML');
    });

    it('should indicate that --query requires --db', () => {
      const program = createProgram();
      const helpOutput = captureSubcommandHelp(program, 'search');

      expect(helpOutput).toContain('requires --db');
    });

    it('should include Workflow position', () => {
      const program = createProgram();
      const helpOutput = captureSubcommandHelp(program, 'search');

      expect(helpOutput).toContain('Workflow position:');
      expect(helpOutput).toContain('results');
    });

    it('should include Query features section', () => {
      const program = createProgram();
      const helpOutput = captureSubcommandHelp(program, 'search');

      expect(helpOutput).toContain('Query features (use "query init" to see full template):');
      expect(helpOutput).toContain('filters:');
      expect(helpOutput).toContain('year_from, year_to, language, publication_types');
      expect(helpOutput).toContain('exclude:');
      expect(helpOutput).toContain('terms.exclude');
      expect(helpOutput).toContain('mesh/eric:');
      expect(helpOutput).toContain('terms.mesh, terms.eric');
      expect(helpOutput).toContain('providers:');
    });
  });

  describe('diff command help', () => {
    it('should include Query Refinement Workflow section', () => {
      const program = createProgram();
      const helpOutput = captureSubcommandHelp(program, 'diff');

      expect(helpOutput).toContain('Query Refinement Workflow');
      expect(helpOutput).toContain('broad query');
      expect(helpOutput).toContain('refined query');
      expect(helpOutput).toContain('--show removed');
    });

    it('should include step-by-step workflow instructions', () => {
      const program = createProgram();
      const helpOutput = captureSubcommandHelp(program, 'diff');

      // Check that the workflow steps are included
      expect(helpOutput).toContain('Search with broad query');
      expect(helpOutput).toContain('refined query');
      expect(helpOutput).toContain('Compare results');
    });
  });
});
