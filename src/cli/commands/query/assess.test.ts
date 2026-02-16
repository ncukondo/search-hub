import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeQueryAssess } from './assess.js';
import { readLogEntries, type AssessmentLogEntry } from './iteration-log.js';

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'assess-test-'));
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe('executeQueryAssess', () => {
  it('should append assessment with --verdict', async () => {
    const queryFile = join(testDir, 'query.yaml');
    await writeFile(queryFile, 'name: test\n', 'utf-8');

    const result = await executeQueryAssess(queryFile, { verdict: 'reject' });
    expect(result.success).toBe(true);

    const entries = await readLogEntries(queryFile);
    expect(entries).toHaveLength(1);
    const entry = entries[0] as AssessmentLogEntry;
    expect(entry.type).toBe('assessment');
    expect(entry.verdict).toBe('reject');
  });

  it('should append assessment with --precision and --comment', async () => {
    const queryFile = join(testDir, 'query.yaml');
    await writeFile(queryFile, 'name: test\n', 'utf-8');

    const result = await executeQueryAssess(queryFile, {
      precision: '~60%',
      comment: 'Core papers captured',
    });
    expect(result.success).toBe(true);

    const entries = await readLogEntries(queryFile);
    expect(entries).toHaveLength(1);
    const entry = entries[0] as AssessmentLogEntry;
    expect(entry.precision).toBe('~60%');
    expect(entry.comment).toBe('Core papers captured');
  });

  it('should return error when no options provided', async () => {
    const queryFile = join(testDir, 'query.yaml');
    await writeFile(queryFile, 'name: test\n', 'utf-8');

    const result = await executeQueryAssess(queryFile, {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('At least one of');
  });

  it('should return error when query file does not exist', async () => {
    const queryFile = join(testDir, 'nonexistent.yaml');

    const result = await executeQueryAssess(queryFile, { verdict: 'reject' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Query file not found');
  });

  it('should append multiple assessments to same log', async () => {
    const queryFile = join(testDir, 'query.yaml');
    await writeFile(queryFile, 'name: test\n', 'utf-8');

    await executeQueryAssess(queryFile, { verdict: 'reject', comment: 'Too broad' });
    await executeQueryAssess(queryFile, { verdict: 'good', precision: '~55%' });

    const entries = await readLogEntries(queryFile);
    expect(entries).toHaveLength(2);
    expect((entries[0] as AssessmentLogEntry).verdict).toBe('reject');
    expect((entries[1] as AssessmentLogEntry).verdict).toBe('good');
  });
});
