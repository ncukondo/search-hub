import { describe, it, expect } from 'vitest';
import { formatLogOutput } from './log.js';
import type {
  LogEntry,
  CountLogEntry,
  PreviewLogEntry,
  AssessmentLogEntry,
} from './iteration-log.js';

describe('formatLogOutput', () => {
  it('should display log entries in chronological order', () => {
    const entries: LogEntry[] = [
      {
        date: '2026-02-16 10:30',
        type: 'count',
        query_hash: 'abc123',
        counts: { pubmed: 50000, scopus: 42000 },
        total: 92000,
      } as CountLogEntry,
      {
        date: '2026-02-16 10:35',
        type: 'assessment',
        verdict: 'reject',
        comment: 'Too broad',
      } as AssessmentLogEntry,
    ];

    const output = formatLogOutput(entries);

    expect(output).toContain('[2026-02-16 10:30] count');
    expect(output).toContain('[2026-02-16 10:35] assessment');
    // count entry should come before assessment
    expect(output.indexOf('count')).toBeLessThan(output.indexOf('assessment'));
  });

  it('should format --json output', () => {
    const entries: LogEntry[] = [
      {
        date: '2026-02-16 10:30',
        type: 'count',
        query_hash: 'abc123',
        counts: { pubmed: 50000 },
        total: 50000,
      } as CountLogEntry,
    ];

    const output = formatLogOutput(entries, { json: true });
    const parsed = JSON.parse(output);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].type).toBe('count');
    expect(parsed[0].query_hash).toBe('abc123');
  });

  it('should display message when no log file exists', () => {
    const output = formatLogOutput([]);
    expect(output).toContain('No iteration log entries');
  });

  it('should display mixed entry types', () => {
    const entries: LogEntry[] = [
      {
        date: '2026-02-16 10:30',
        type: 'count',
        query_hash: 'abc123',
        counts: { pubmed: 50000 },
        total: 50000,
      } as CountLogEntry,
      {
        date: '2026-02-16 11:00',
        type: 'preview',
        query_hash: 'abc123',
        counts: { pubmed: 100 },
        total: 100,
        titles: { pubmed: ['Title A', 'Title B'] },
      } as PreviewLogEntry,
      {
        date: '2026-02-16 11:05',
        type: 'assessment',
        verdict: 'good',
        precision: '~60%',
        comment: 'Core papers captured',
      } as AssessmentLogEntry,
    ];

    const output = formatLogOutput(entries);

    // Count entry
    expect(output).toContain('[2026-02-16 10:30] count (abc123)');
    expect(output).toContain('pubmed: 50000');

    // Preview entry
    expect(output).toContain('[2026-02-16 11:00] preview (abc123)');
    expect(output).toContain('Title A');
    expect(output).toContain('Title B');

    // Assessment entry
    expect(output).toContain('[2026-02-16 11:05] assessment:');
    expect(output).toContain('verdict: good');
    expect(output).toContain('precision: ~60%');
    expect(output).toContain('Core papers captured');
  });
});
