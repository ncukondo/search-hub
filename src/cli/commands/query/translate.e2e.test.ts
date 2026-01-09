/**
 * E2E Tests for the query translate command.
 *
 * Tests the CLI command: search-hub query translate
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createTempDir,
  cleanupTempDir,
  execCli,
  createSimpleQueryFile,
} from '../../e2e-helpers.js';

describe('search-hub query translate (E2E)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir('query-translate-e2e-');
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('should translate to all databases by default', async () => {
    const queryPath = await createSimpleQueryFile(tempDir, {
      name: 'translate-test',
      keyword: 'diabetes',
    });

    const result = await execCli(['query', 'translate', queryPath]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('PUBMED');
    expect(result.stdout).toContain('ERIC');
    expect(result.stdout).toContain('ARXIV');
    expect(result.stdout).toContain('SCOPUS');
  });

  it('should filter to specific database with --db', async () => {
    const queryPath = await createSimpleQueryFile(tempDir, {
      name: 'translate-test',
      keyword: 'cancer',
    });

    const result = await execCli(['query', 'translate', queryPath, '--db', 'pubmed']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('PUBMED');
    // Should not include other databases
    expect(result.stdout).not.toContain('ERIC');
    expect(result.stdout).not.toContain('ARXIV');
    expect(result.stdout).not.toContain('SCOPUS');
  });

  it('should show native syntax for PubMed', async () => {
    const queryPath = await createSimpleQueryFile(tempDir, {
      name: 'pubmed-test',
      keyword: 'hypertension',
    });

    const result = await execCli(['query', 'translate', queryPath, '--db', 'pubmed']);

    expect(result.exitCode).toBe(0);
    // PubMed uses [tiab] for title_abstract field
    expect(result.stdout).toContain('[tiab]');
    expect(result.stdout).toContain('hypertension');
  });

  it('should show native syntax for ERIC', async () => {
    const queryPath = await createSimpleQueryFile(tempDir, {
      name: 'eric-test',
      keyword: 'education',
    });

    const result = await execCli(['query', 'translate', queryPath, '--db', 'eric']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('ERIC');
    expect(result.stdout).toContain('education');
  });

  it('should show native syntax for arXiv', async () => {
    const queryPath = await createSimpleQueryFile(tempDir, {
      name: 'arxiv-test',
      keyword: 'quantum',
    });

    const result = await execCli(['query', 'translate', queryPath, '--db', 'arxiv']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('ARXIV');
    expect(result.stdout).toContain('quantum');
  });

  it('should show native syntax for Scopus', async () => {
    const queryPath = await createSimpleQueryFile(tempDir, {
      name: 'scopus-test',
      keyword: 'artificial intelligence',
    });

    const result = await execCli(['query', 'translate', queryPath, '--db', 'scopus']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('SCOPUS');
    expect(result.stdout).toContain('artificial intelligence');
  });

  it('should show error for invalid query file', async () => {
    const queryPath = '/nonexistent/path/query.yaml';

    const result = await execCli(['query', 'translate', queryPath]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain('Failed to translate');
  });
});
