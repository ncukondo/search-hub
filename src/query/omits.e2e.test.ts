/**
 * E2E Tests for `providers.<db>.omits`
 *
 * Runs the built CLI against a 4-block query where arXiv omits one block.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  setupE2EContext,
  type E2EContext,
  createRawQueryFile,
  execCli,
} from '../cli/e2e-helpers.js';

const BLOCKS = `
query:
  - id: population
    field: title_abstract
    terms:
      keywords: [diabetes]
    operator: OR
  - id: intervention
    field: title_abstract
    terms:
      keywords: [insulin]
    operator: OR
  - id: setting
    field: title_abstract
    terms:
      keywords: [hospital]
    operator: OR
  - id: outcome
    field: title_abstract
    terms:
      keywords: [mortality]
    operator: OR
`;

function queryWith(providers: string): string {
  return `name: omits_e2e\n${BLOCKS}providers:\n${providers}`;
}

describe('providers.<db>.omits E2E', () => {
  let ctx: E2EContext;

  beforeEach(async () => {
    ctx = await setupE2EContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  describe('valid omits', () => {
    let queryPath: string;

    beforeEach(async () => {
      queryPath = await createRawQueryFile(
        ctx.tempDir,
        queryWith('  arxiv:\n    omits: [setting]\n'),
      );
    });

    it('query translate drops the block for arXiv only', async () => {
      const arxiv = await execCli(['query', 'translate', queryPath, '--db', 'arxiv']);
      expect(arxiv.exitCode).toBe(0);
      const arxivQuery = arxiv.stdout.split('\n')[3]!;
      expect(arxivQuery).toContain('diabetes');
      expect(arxivQuery).toContain('insulin');
      expect(arxivQuery).toContain('mortality');
      expect(arxivQuery).not.toContain('hospital');
      expect(arxiv.stdout).toContain('Omitted blocks: setting');

      const pubmed = await execCli(['query', 'translate', queryPath, '--db', 'pubmed']);
      expect(pubmed.exitCode).toBe(0);
      for (const term of ['diabetes', 'insulin', 'hospital', 'mortality']) {
        expect(pubmed.stdout).toContain(term);
      }
      expect(pubmed.stdout).not.toContain('Omitted');
    });

    it('query inspect marks the block as omitted for arXiv', async () => {
      const result = await execCli(['query', 'inspect', queryPath]);
      expect(result.exitCode).toBe(0);
      const settingLine = result.stdout.split('\n').find((l) => l.includes('setting'))!;
      expect(settingLine).toContain('omitted');
    });

    it('search --dry-run shows the omission note under arXiv', async () => {
      const result = await execCli([
        '--config',
        ctx.configPath,
        'search',
        queryPath,
        '--dry-run',
        '--skip-connection-test',
        '--db',
        'pubmed,arxiv',
      ]);
      expect(result.exitCode).toBe(0);
      const arxivSection = result.stdout.slice(result.stdout.indexOf('[arxiv]'));
      expect(arxivSection).toContain('Omitted blocks: setting');
      expect(arxivSection.split('\n')[1]).not.toContain('hospital');
      const pubmedSection = result.stdout.slice(
        result.stdout.indexOf('[pubmed]'),
        result.stdout.indexOf('[arxiv]'),
      );
      expect(pubmedSection).toContain('hospital');
      expect(pubmedSection).not.toContain('Omitted');
    });
  });

  describe('invalid omits', () => {
    const cases: Array<[string, string, RegExp]> = [
      ['unknown id', '  arxiv:\n    omits: [nonexistent]\n', /arxiv.*nonexistent/],
      [
        'overlap with replaces',
        '  arxiv:\n    omits: [setting]\n    replaces:\n      setting:\n        field: all\n        terms:\n          keywords: [clinic]\n        operator: OR\n',
        /setting.*both replaces and omits/,
      ],
      [
        'all blocks omitted',
        '  arxiv:\n    omits: [population, intervention, setting, outcome]\n',
        /arxiv.*removes all blocks/,
      ],
    ];

    for (const [label, providers, pattern] of cases) {
      it(`query translate and validate fail for ${label}`, async () => {
        const queryPath = await createRawQueryFile(ctx.tempDir, queryWith(providers));

        const translate = await execCli(['query', 'translate', queryPath]);
        expect(translate.exitCode).not.toBe(0);
        expect(translate.stdout + translate.stderr).toMatch(pattern);

        const validate = await execCli(['query', 'validate', queryPath]);
        expect(validate.exitCode).not.toBe(0);
        expect(validate.stdout + validate.stderr).toMatch(pattern);
      });
    }
  });
});
