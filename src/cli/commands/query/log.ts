/**
 * Query Log Command
 *
 * Formats and displays the query iteration log.
 */
import type {
  LogEntry,
  CountLogEntry,
  PreviewLogEntry,
  AssessmentLogEntry,
} from './iteration-log.js';

export interface LogOutputOptions {
  json?: boolean | undefined;
}

/**
 * Format log entries for display.
 */
export function formatLogOutput(
  entries: LogEntry[],
  options?: LogOutputOptions,
): string {
  if (options?.json) {
    return JSON.stringify(entries, null, 2);
  }

  if (entries.length === 0) {
    return 'No iteration log entries.';
  }

  const lines: string[] = [];

  for (const entry of entries) {
    switch (entry.type) {
      case 'count':
        lines.push(formatCountEntry(entry));
        break;
      case 'preview':
        lines.push(formatPreviewEntry(entry));
        break;
      case 'assessment':
        lines.push(formatAssessmentEntry(entry));
        break;
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

function formatCountEntry(entry: CountLogEntry): string {
  const parts: string[] = [];
  parts.push(`[${entry.date}] count (${entry.query_hash})`);
  for (const [provider, count] of Object.entries(entry.counts)) {
    parts.push(`  ${provider}: ${count}`);
  }
  parts.push(`  total: ${entry.total}`);
  return parts.join('\n');
}

function formatPreviewEntry(entry: PreviewLogEntry): string {
  const parts: string[] = [];
  parts.push(`[${entry.date}] preview (${entry.query_hash})`);
  for (const [provider, count] of Object.entries(entry.counts)) {
    parts.push(`  ${provider}: ${count}`);
    const providerTitles = entry.titles[provider];
    if (providerTitles) {
      for (const title of providerTitles) {
        parts.push(`    • ${title}`);
      }
    }
  }
  parts.push(`  total: ${entry.total}`);
  return parts.join('\n');
}

function formatAssessmentEntry(entry: AssessmentLogEntry): string {
  const parts: string[] = [];
  const meta: string[] = [];
  if (entry.verdict) meta.push(`verdict: ${entry.verdict}`);
  if (entry.precision) meta.push(`precision: ${entry.precision}`);
  const metaStr = meta.length > 0 ? ` ${meta.join(', ')}` : '';
  parts.push(`[${entry.date}] assessment:${metaStr}`);
  if (entry.comment) {
    parts.push(`  ${entry.comment}`);
  }
  return parts.join('\n');
}
