/**
 * E2E Tests for Query Iteration Log
 *
 * Tests the full iteration log lifecycle:
 * - Auto-logging count-only results
 * - Recording assessments via query assess
 * - Viewing the log via query log
 * - Auto-logging preview results
 * - query_hash changes when query file is modified
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  appendLogEntry,
  readLogEntries,
  getLogFilePath,
  computeQueryHash,
  buildCountLogEntry,
  buildPreviewLogEntry,
  type CountLogEntry,
  type PreviewLogEntry,
  type AssessmentLogEntry,
} from './iteration-log.js';
import { executeQueryAssess } from './assess.js';
import { formatLogOutput } from './log.js';
import type { CountResult, PreviewResult } from '../search.js';

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'iteration-log-e2e-'));
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe('query iteration log E2E', () => {
  it('should complete the full iteration lifecycle', async () => {
    // 1. Create a query file
    const queryFile = join(testDir, 'my-search.yaml');
    const queryContent =
      'name: diabetes-search\nquery:\n  - field: title_abstract\n    terms:\n      keywords: ["diabetes", "mellitus"]\n    operator: AND\n';
    await writeFile(queryFile, queryContent, 'utf-8');

    // 2. Simulate search --count-only (auto-log)
    const queryHash = computeQueryHash(queryContent);
    const countResults: CountResult[] = [
      { provider: 'pubmed', count: 50000 },
      { provider: 'scopus', count: 42000 },
    ];
    const countEntry = buildCountLogEntry(queryHash, countResults);
    await appendLogEntry(queryFile, countEntry);

    // Verify log file created
    const logPath = getLogFilePath(queryFile);
    const logContent = await readFile(logPath, 'utf-8');
    expect(logContent).toContain('# Search iteration log for my-search.yaml');
    expect(logContent).toContain('type: count');

    // 3. Record assessment via query assess
    const assessResult = await executeQueryAssess(queryFile, {
      verdict: 'reject',
      comment: 'Too broad, need more specific MeSH terms',
    });
    expect(assessResult.success).toBe(true);

    // 4. View log via query log
    const entries = await readLogEntries(queryFile);
    expect(entries).toHaveLength(2);

    const output = formatLogOutput(entries);
    expect(output).toContain('count');
    expect(output).toContain('assessment');
    expect(output).toContain('reject');
    expect(output).toContain('Too broad');

    // 5. Simulate search --preview (auto-log)
    const previewResults: PreviewResult[] = [
      {
        provider: 'pubmed',
        count: 50000,
        titles: ['Diabetes and AI', 'Type 2 Diabetes Management', 'Mellitus Overview'],
      },
    ];
    const previewEntry = buildPreviewLogEntry(queryHash, previewResults);
    await appendLogEntry(queryFile, previewEntry);

    // Verify preview entry appended
    const allEntries = await readLogEntries(queryFile);
    expect(allEntries).toHaveLength(3);
    expect(allEntries[2]!.type).toBe('preview');

    // 6. Verify query_hash changes when query file is modified
    const modifiedContent = queryContent + '    mesh: ["Diabetes Mellitus, Type 2"]\n';
    const newHash = computeQueryHash(modifiedContent);
    expect(newHash).not.toBe(queryHash);
  });

  it('should handle JSON output correctly for full lifecycle', async () => {
    const queryFile = join(testDir, 'search.yaml');
    await writeFile(queryFile, 'name: test\n', 'utf-8');

    // Add count entry
    const hash = computeQueryHash('name: test\n');
    await appendLogEntry(queryFile, buildCountLogEntry(hash, [{ provider: 'pubmed', count: 100 }]));

    // Add assessment
    await executeQueryAssess(queryFile, { verdict: 'good', precision: '~60%' });

    // JSON output
    const entries = await readLogEntries(queryFile);
    const jsonOutput = formatLogOutput(entries, { json: true });
    const parsed = JSON.parse(jsonOutput);

    expect(parsed).toHaveLength(2);
    expect(parsed[0].type).toBe('count');
    expect(parsed[0].query_hash).toBe(hash);
    expect(parsed[1].type).toBe('assessment');
    expect(parsed[1].verdict).toBe('good');
  });

  it('should preserve log across multiple query iterations', async () => {
    const queryFile = join(testDir, 'iterating.yaml');

    // Iteration 1
    const v1Content = 'name: v1\n';
    await writeFile(queryFile, v1Content, 'utf-8');
    const h1 = computeQueryHash(v1Content);
    await appendLogEntry(queryFile, buildCountLogEntry(h1, [{ provider: 'pubmed', count: 10000 }]));
    await executeQueryAssess(queryFile, { verdict: 'reject', comment: 'Too few results' });

    // Iteration 2 — modify query
    const v2Content = 'name: v2\n';
    await writeFile(queryFile, v2Content, 'utf-8');
    const h2 = computeQueryHash(v2Content);
    await appendLogEntry(queryFile, buildCountLogEntry(h2, [{ provider: 'pubmed', count: 50000 }]));
    await executeQueryAssess(queryFile, { verdict: 'good', precision: '~55%' });

    // Verify all entries preserved
    const entries = await readLogEntries(queryFile);
    expect(entries).toHaveLength(4);

    // First iteration entries
    expect((entries[0] as CountLogEntry).query_hash).toBe(h1);
    expect((entries[1] as AssessmentLogEntry).verdict).toBe('reject');

    // Second iteration entries — different hash
    expect((entries[2] as CountLogEntry).query_hash).toBe(h2);
    expect(h1).not.toBe(h2);
    expect((entries[3] as AssessmentLogEntry).verdict).toBe('good');

    // Verify full output
    const output = formatLogOutput(entries);
    expect(output).toContain(h1);
    expect(output).toContain(h2);
  });
});
