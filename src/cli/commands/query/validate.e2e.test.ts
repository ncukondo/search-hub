/**
 * E2E Tests for the query validate command.
 *
 * Tests the CLI command: search-hub query validate
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  createTempDir,
  cleanupTempDir,
  execCli,
  createSimpleQueryFile,
  createInvalidQueryFile,
} from '../../e2e-helpers.js';

describe('search-hub query validate (E2E)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir('query-validate-e2e-');
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('should validate valid query file passes', async () => {
    const queryPath = await createSimpleQueryFile(tempDir, {
      name: 'test-query',
      keyword: 'diabetes',
    });

    const result = await execCli(['query', 'validate', queryPath]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Valid query file');
    expect(result.stdout).toContain('test-query');
    expect(result.stdout).toContain('Blocks');
  });

  it('should show errors for invalid query file', async () => {
    const queryPath = await createInvalidQueryFile(tempDir);

    const result = await execCli(['query', 'validate', queryPath]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain('Invalid query file');
    expect(result.stdout).toContain('Error');
  });

  it('should show error for missing file', async () => {
    const nonexistentPath = join(tempDir, 'nonexistent.yaml');

    const result = await execCli(['query', 'validate', nonexistentPath]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('ENOENT');
  });

  it('should show helpful error for common mistakes - missing name', async () => {
    const queryPath = join(tempDir, 'no-name.yaml');
    // Query without required 'name' field
    await writeFile(
      queryPath,
      `
query:
  - field: title_abstract
    terms:
      keywords:
        - test
    operator: AND
filters:
  year_from: 2024
`,
      'utf-8'
    );

    const result = await execCli(['query', 'validate', queryPath]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain('Invalid');
    // Should mention the missing field
    expect(result.stdout.toLowerCase()).toContain('name');
  });

  it('should validate query with multiple blocks', async () => {
    const queryPath = join(tempDir, 'multi-block.yaml');
    await writeFile(
      queryPath,
      `
name: multi-block-query
query:
  - field: title
    terms:
      keywords:
        - cancer
    operator: AND
  - field: abstract
    terms:
      keywords:
        - treatment
    operator: OR
filters:
  year_from: 2020
  year_to: 2024
`,
      'utf-8'
    );

    const result = await execCli(['query', 'validate', queryPath]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Valid query file');
    expect(result.stdout).toContain('multi-block-query');
    expect(result.stdout).toContain('2'); // 2 blocks
  });

  it('should show helpful error for invalid field type', async () => {
    const queryPath = join(tempDir, 'invalid-field.yaml');
    await writeFile(
      queryPath,
      `
name: invalid-field-query
query:
  - field: invalid_field_type
    terms:
      keywords:
        - test
    operator: AND
`,
      'utf-8'
    );

    const result = await execCli(['query', 'validate', queryPath]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain('Invalid');
  });
});
