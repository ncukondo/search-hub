import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateQueryCommand } from './validate.js';
import * as fs from 'node:fs/promises';

vi.mock('node:fs/promises');

const validYaml = `
name: test-query
description: A test query
query:
  - field: title_abstract
    terms:
      keywords:
        - diabetes
        - insulin
    operator: OR
`;

const invalidYaml = `
name: 123
query:
  - field: invalid_field
    terms: not_an_object
`;

const malformedYaml = `
name: test
query:
  - field: title
  terms:  # wrong indentation
`;

describe('query validate command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('validateQueryCommand', () => {
    it('should return success for valid query file', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(validYaml);

      const result = await validateQueryCommand('/path/to/query.yaml');

      expect(result.success).toBe(true);
      expect(result.errors).toBeUndefined();
      expect(result.queryName).toBe('test-query');
    });

    it('should return errors for invalid query structure', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(invalidYaml);

      const result = await validateQueryCommand('/path/to/invalid.yaml');

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('should return error for malformed YAML', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(malformedYaml);

      const result = await validateQueryCommand('/path/to/malformed.yaml');

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should return error when file does not exist', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(
        new Error('ENOENT: no such file or directory')
      );

      const result = await validateQueryCommand('/path/to/nonexistent.yaml');

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('no such file');
    });

    it('should include query name in result for valid queries', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(validYaml);

      const result = await validateQueryCommand('/path/to/query.yaml');

      expect(result.queryName).toBe('test-query');
    });

    it('should include block count in result for valid queries', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(validYaml);

      const result = await validateQueryCommand('/path/to/query.yaml');

      expect(result.blockCount).toBe(1);
    });
  });
});
