import { describe, it, expect } from 'vitest';
import { formatInitOutput, formatSyncOutput } from './format.js';
import type { FulltextInitResult } from './init.js';
import type { FulltextSyncResult } from './sync.js';

describe('formatInitOutput', () => {
  it('shows created directories with DOI/PMID', () => {
    const result: FulltextInitResult = {
      created: 2,
      skipped: 0,
      entries: [
        { dirName: 'smith2024-a1b2c3d4', citationKey: 'smith2024', title: 'Article 1', doi: '10.1234/example' },
        { dirName: 'jones2023-e5f6g7h8', citationKey: 'jones2023', title: 'Article 2', pmid: '12345678' },
      ],
    };

    const output = formatInitOutput(result);

    expect(output).toContain('Created: 2 directories');
    expect(output).toContain('smith2024-a1b2c3d4/');
    expect(output).toContain('(DOI: 10.1234/example)');
    expect(output).toContain('jones2023-e5f6g7h8/');
    expect(output).toContain('(PMID: 12345678)');
  });

  it('shows "Next steps" guidance', () => {
    const result: FulltextInitResult = {
      created: 1,
      skipped: 0,
      entries: [
        { dirName: 'smith2024-a1b2c3d4', citationKey: 'smith2024', title: 'Article 1' },
      ],
    };

    const output = formatInitOutput(result);

    expect(output).toContain('Next steps:');
    expect(output).toContain('fulltext.pdf');
    expect(output).toContain('fulltext sync');
  });

  it('shows skipped count for idempotent runs', () => {
    const result: FulltextInitResult = {
      created: 0,
      skipped: 3,
      entries: [],
    };

    const output = formatInitOutput(result);

    expect(output).toContain('3 directories already exist');
  });

  it('shows dry-run prefix', () => {
    const result: FulltextInitResult = {
      created: 1,
      skipped: 0,
      entries: [
        { dirName: 'smith2024-a1b2c3d4', citationKey: 'smith2024', title: 'Article 1' },
      ],
      dryRun: true,
    };

    const output = formatInitOutput(result);

    expect(output).toContain('[Dry Run]');
  });

  it('handles no included articles', () => {
    const result: FulltextInitResult = {
      created: 0,
      skipped: 0,
      entries: [],
    };

    const output = formatInitOutput(result);

    expect(output).toContain('No included articles found');
  });
});

describe('formatSyncOutput', () => {
  it('shows found files with sizes', () => {
    const result: FulltextSyncResult = {
      synced: 2,
      articlesUpdated: 1,
      entries: [
        { dirName: 'smith2024-a1b2c3d4', files: ['fulltext.pdf', 'fulltext.md'], sizes: [2_400_000, 45_000] },
      ],
    };

    const output = formatSyncOutput(result);

    expect(output).toContain('smith2024-a1b2c3d4/fulltext.pdf');
    expect(output).toContain('2.3 MB');
    expect(output).toContain('smith2024-a1b2c3d4/fulltext.md');
    expect(output).toContain('43.9 KB');
  });

  it('shows summary (X files synced, Y articles updated)', () => {
    const result: FulltextSyncResult = {
      synced: 4,
      articlesUpdated: 3,
      entries: [
        { dirName: 'smith2024-a1b2c3d4', files: ['fulltext.pdf'], sizes: [100] },
        { dirName: 'jones2023-e5f6g7h8', files: ['fulltext.pdf', 'fulltext.md'], sizes: [200, 300] },
        { dirName: 'chen2024-i9j0k1l2', files: ['fulltext.md'], sizes: [400] },
      ],
    };

    const output = formatSyncOutput(result);

    expect(output).toContain('4 files synced');
    expect(output).toContain('2 PDFs');
    expect(output).toContain('2 Markdowns');
    expect(output).toContain('3 articles updated');
  });

  it('shows dry-run prefix', () => {
    const result: FulltextSyncResult = {
      synced: 1,
      articlesUpdated: 1,
      entries: [
        { dirName: 'smith2024-a1b2c3d4', files: ['fulltext.pdf'], sizes: [100] },
      ],
      dryRun: true,
    };

    const output = formatSyncOutput(result);

    expect(output).toContain('[Dry Run]');
  });

  it('handles no new files', () => {
    const result: FulltextSyncResult = {
      synced: 0,
      articlesUpdated: 0,
      entries: [],
    };

    const output = formatSyncOutput(result);

    expect(output).toContain('No new files to sync');
  });
});
