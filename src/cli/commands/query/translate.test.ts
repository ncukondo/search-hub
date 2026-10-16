import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { translateQueryCommand, formatTranslateResult } from './translate.js';
import * as fs from 'node:fs/promises';

vi.mock('node:fs/promises');

const validYaml = `
name: test-query
description: A test query
query:
  - id: concept-1
    field: title_abstract
    terms:
      keywords:
        - diabetes
        - insulin
    operator: OR
`;

describe('query translate command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('translateQueryCommand', () => {
    it('should translate query for all providers', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(validYaml);

      const result = await translateQueryCommand('/path/to/query.yaml');

      expect(result.success).toBe(true);
      expect(result.translations).toBeDefined();
      expect(Object.keys(result.translations!)).toContain('pubmed');
      expect(Object.keys(result.translations!)).toContain('eric');
      expect(Object.keys(result.translations!)).toContain('arxiv');
      expect(Object.keys(result.translations!)).toContain('scopus');
    });

    it('should translate query for specific provider', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(validYaml);

      const result = await translateQueryCommand('/path/to/query.yaml', {
        providers: ['pubmed'],
      });

      expect(result.success).toBe(true);
      expect(result.translations).toBeDefined();
      expect(Object.keys(result.translations!)).toEqual(['pubmed']);
    });

    it('should translate query for multiple specific providers', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(validYaml);

      const result = await translateQueryCommand('/path/to/query.yaml', {
        providers: ['pubmed', 'scopus'],
      });

      expect(result.success).toBe(true);
      expect(result.translations).toBeDefined();
      expect(Object.keys(result.translations!).sort()).toEqual(['pubmed', 'scopus']);
    });

    it('should return error for file read failure', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT: no such file or directory'));

      const result = await translateQueryCommand('/path/to/nonexistent.yaml');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('no such file');
    });

    it('should return error for invalid YAML', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('not: valid: yaml: content');

      const result = await translateQueryCommand('/path/to/invalid.yaml');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should include native query string in translations', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(validYaml);

      const result = await translateQueryCommand('/path/to/query.yaml', {
        providers: ['pubmed'],
      });

      expect(result.success).toBe(true);
      expect(result.translations).toBeDefined();
      const pubmedTranslation = result.translations!['pubmed'];
      expect(pubmedTranslation).toBeDefined();
      expect(pubmedTranslation!.native).toBeDefined();
      expect(typeof pubmedTranslation!.native).toBe('string');
    });
  });
});

const omitsYaml = `
name: omits-query
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
providers:
  arxiv:
    omits: [setting]
`;

describe('query translate with omits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should exclude omitted blocks and report them per provider', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(omitsYaml);

    const result = await translateQueryCommand('/path/to/query.yaml', {
      providers: ['pubmed', 'arxiv'],
    });

    expect(result.success).toBe(true);
    expect(result.translations!['arxiv']!.native).not.toContain('hospital');
    expect(result.translations!['pubmed']!.native).toContain('hospital');
    expect(result.omittedBlocks).toEqual({ arxiv: ['setting'] });
  });

  it('should show an omission note under the provider in formatted output', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(omitsYaml);

    const result = await translateQueryCommand('/path/to/query.yaml', {
      providers: ['pubmed', 'arxiv'],
    });
    const output = formatTranslateResult(result, 'q.yaml');

    const arxivSection = output.slice(output.indexOf('[ARXIV]'));
    expect(arxivSection).toContain('Omitted blocks: setting');
    const pubmedSection = output.slice(output.indexOf('[PUBMED]'), output.indexOf('[ARXIV]'));
    expect(pubmedSection).not.toContain('Omitted');
  });
});
