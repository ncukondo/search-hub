/**
 * Shared utilities for search and resume executors.
 */

/**
 * Build a detailed error message listing per-provider failures.
 */
export function buildFailureErrorMessage(
  results: Record<string, { hits: number; retrieved: number; error?: string }>
): string {
  const errorLines = Object.entries(results)
    .filter(([, r]) => r.error)
    .map(([provider, r]) => `  ${provider}: ${r.error}`);

  const suggestedActions = '\n\nSuggested actions:\n' +
    '  → Run with --dry-run to inspect translated queries\n' +
    '  → Check provider configuration: search-hub config\n' +
    '  → Use --db <provider> to test a single provider';

  if (errorLines.length === 0) {
    return 'All providers failed' + suggestedActions;
  }

  return 'All providers failed:\n' + errorLines.join('\n') + suggestedActions;
}

/**
 * Build a detailed error message for partial success (some providers failed, some succeeded).
 * Used when --strict mode is enabled.
 */
export function buildPartialErrorMessage(
  results: Record<string, { hits: number; retrieved: number; error?: string }>
): string {
  const failedLines = Object.entries(results)
    .filter(([, r]) => r.error)
    .map(([provider, r]) => `  ${provider}: ${r.error}`);

  const succeededLines = Object.entries(results)
    .filter(([, r]) => !r.error)
    .map(([provider, r]) => `  ${provider}: ${r.retrieved} results`);

  const lines: string[] = [];
  lines.push('Partial success (--strict mode: treating as failure):');
  if (failedLines.length > 0) {
    lines.push('  Failed:');
    lines.push(...failedLines.map((l) => '  ' + l));
  }
  if (succeededLines.length > 0) {
    lines.push('  Succeeded:');
    lines.push(...succeededLines.map((l) => '  ' + l));
  }

  return lines.join('\n');
}

/**
 * Format verbose per-provider details for CLI output.
 */
export function formatVerboseProviderDetails(
  results: Record<string, { hits: number; retrieved: number; error?: string; warnings?: string[] }>
): string {
  const lines: string[] = ['\nPer-provider details:'];
  for (const [provider, stats] of Object.entries(results)) {
    if (stats.error) {
      lines.push(`  ${provider}: FAILED - ${stats.error}`);
    } else {
      lines.push(`  ${provider}: ${stats.retrieved} results`);
    }
    if (stats.warnings && stats.warnings.length > 0) {
      for (const w of stats.warnings) {
        lines.push(`    warning: ${w}`);
      }
    }
  }
  return lines.join('\n');
}
