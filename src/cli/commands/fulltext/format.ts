/**
 * Output formatting for fulltext init and sync commands.
 */

import type { FulltextInitResult } from './init.js';
import type { FulltextSyncResult } from './sync.js';

/** Format the output of fulltext init command. */
export function formatInitOutput(result: FulltextInitResult): string {
  const lines: string[] = [];

  if (result.dryRun) {
    lines.push('[Dry Run] Would create directories for included articles:');
    lines.push('');
  }

  if (result.created === 0 && result.skipped === 0) {
    lines.push('No included articles found.');
    return lines.join('\n');
  }

  if (result.created > 0) {
    lines.push(`Created: ${result.created} director${result.created === 1 ? 'y' : 'ies'}`);
    if (result.skipped > 0) {
      lines.push(`Skipped: ${result.skipped} (already exist)`);
    }
    lines.push('');

    for (const entry of result.entries) {
      const id = entry.doi ? `DOI: ${entry.doi}` : entry.pmid ? `PMID: ${entry.pmid}` : '';
      lines.push(`  ${entry.dirName}/  ${id ? `(${id})` : ''}`);
    }

    lines.push('');
    lines.push('Next steps:');
    lines.push('  1. Add fulltext.pdf or fulltext.md to each directory');
    lines.push('  2. Run `fulltext sync <session-id>` to register added files');
  } else {
    lines.push(`All ${result.skipped} directories already exist.`);
  }

  return lines.join('\n');
}

/** Format the output of fulltext sync command. */
export function formatSyncOutput(result: FulltextSyncResult): string {
  const lines: string[] = [];

  if (result.dryRun) {
    lines.push('[Dry Run] Would sync the following files:');
    lines.push('');
  }

  if (result.synced === 0) {
    lines.push('No new files to sync.');
    return lines.join('\n');
  }

  lines.push('Found new files:');
  for (const entry of result.entries) {
    for (let i = 0; i < entry.files.length; i++) {
      const file = entry.files[i]!;
      const size = entry.sizes[i];
      const sizeStr = size !== undefined ? ` (${formatSize(size)})` : '';
      lines.push(`  ${entry.dirName}/${file}${sizeStr}`);
    }
  }

  lines.push('');

  // Count file types
  const allFiles = result.entries.flatMap((e) => e.files);
  const pdfs = allFiles.filter((f) => f === 'fulltext.pdf').length;
  const mds = allFiles.filter((f) => f === 'fulltext.md').length;
  const xmls = allFiles.filter((f) => f === 'fulltext.xml').length;

  const typeParts: string[] = [];
  if (pdfs > 0) typeParts.push(`${pdfs} PDF${pdfs > 1 ? 's' : ''}`);
  if (mds > 0) typeParts.push(`${mds} Markdown${mds > 1 ? 's' : ''}`);
  if (xmls > 0) typeParts.push(`${xmls} XML${xmls > 1 ? 's' : ''}`);

  lines.push('Summary:');
  lines.push(
    `  ${result.synced} file${result.synced === 1 ? '' : 's'} synced (${typeParts.join(', ')})`,
  );
  lines.push(
    `  ${result.articlesUpdated} article${result.articlesUpdated === 1 ? '' : 's'} updated`,
  );

  return lines.join('\n');
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
