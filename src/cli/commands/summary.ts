/**
 * Summary command - provides statistical analysis of session results.
 */
import type { Article } from '../../providers/base/types.js';

export interface SessionSummary {
  sessionId: string;
  sessionName: string;
  totalArticles: number;
  uniqueArticles: number;
  yearDistribution: Record<string, number>;
  databaseBreakdown: Record<string, number>;
  topJournals: Array<{ name: string; count: number }>;
  identifierCoverage: {
    withDoi: number;
    withPmid: number;
    noDoiOrPmid: number;
  };
}

export interface ComputeSummaryOptions {
  sessionId: string;
  sessionName: string;
  topN?: number;
}

function extractYear(dateStr: string | undefined): string {
  if (!dateStr) return 'unknown';
  const match = /^(\d{4})/.exec(dateStr);
  if (!match) return 'unknown';
  return match[1]!;
}

export function computeSummary(
  allArticles: Article[],
  uniqueArticles: Article[],
  options: ComputeSummaryOptions,
): SessionSummary {
  const topN = options.topN ?? 10;

  // Year distribution from uniqueArticles
  const yearDistribution: Record<string, number> = {};
  for (const article of uniqueArticles) {
    const year = extractYear(article.publicationDate);
    yearDistribution[year] = (yearDistribution[year] ?? 0) + 1;
  }

  // Database breakdown from uniqueArticles
  const databaseBreakdown: Record<string, number> = {};
  for (const article of uniqueArticles) {
    databaseBreakdown[article.source] = (databaseBreakdown[article.source] ?? 0) + 1;
  }

  // Top journals from uniqueArticles
  const journalCounts = new Map<string, number>();
  for (const article of uniqueArticles) {
    if (article.journal) {
      journalCounts.set(article.journal, (journalCounts.get(article.journal) ?? 0) + 1);
    }
  }
  const topJournals = [...journalCounts.entries()]
    .sort((a, b) => {
      const countDiff = b[1] - a[1];
      if (countDiff !== 0) return countDiff;
      return a[0].localeCompare(b[0]);
    })
    .slice(0, topN)
    .map(([name, count]) => ({ name, count }));

  // Identifier coverage from uniqueArticles
  let withDoi = 0;
  let withPmid = 0;
  let noDoiOrPmid = 0;
  for (const article of uniqueArticles) {
    if (article.doi) withDoi++;
    if (article.pmid) withPmid++;
    if (!article.doi && !article.pmid) noDoiOrPmid++;
  }

  return {
    sessionId: options.sessionId,
    sessionName: options.sessionName,
    totalArticles: allArticles.length,
    uniqueArticles: uniqueArticles.length,
    yearDistribution,
    databaseBreakdown,
    topJournals,
    identifierCoverage: { withDoi, withPmid, noDoiOrPmid },
  };
}

const MAX_BAR_WIDTH = 32;

function formatPercent(count: number, total: number): string {
  if (total === 0) return '0.0%';
  return `${((count / total) * 100).toFixed(1)}%`;
}

export function formatSummary(summary: SessionSummary): string {
  const lines: string[] = [];

  // Header
  lines.push(`Session: ${summary.sessionName} (${summary.sessionId})`);
  lines.push(`Total: ${summary.totalArticles} articles (${summary.uniqueArticles} unique after deduplication)`);
  lines.push('');

  // Year distribution
  lines.push('Year distribution:');
  const yearEntries = Object.entries(summary.yearDistribution);
  // Sort: numeric years ascending, "unknown" last
  yearEntries.sort((a, b) => {
    if (a[0] === 'unknown') return 1;
    if (b[0] === 'unknown') return -1;
    return a[0].localeCompare(b[0]);
  });

  if (yearEntries.length > 0) {
    const maxCount = Math.max(...yearEntries.map(([, c]) => c));
    const maxCountWidth = Math.max(...yearEntries.map(([, c]) => String(c).length));
    const maxLabelWidth = Math.max(...yearEntries.map(([y]) => y.length));

    for (const [year, count] of yearEntries) {
      const barLength = maxCount > 0 ? Math.round((count / maxCount) * MAX_BAR_WIDTH) : 0;
      const bar = '█'.repeat(barLength);
      const paddedYear = year.padStart(maxLabelWidth);
      const paddedCount = String(count).padStart(maxCountWidth);
      lines.push(`  ${paddedYear}: ${paddedCount} ${bar}`);
    }
  }
  lines.push('');

  // Database breakdown
  lines.push('Database breakdown:');
  const dbEntries = Object.entries(summary.databaseBreakdown)
    .sort((a, b) => b[1] - a[1]);

  if (dbEntries.length > 0) {
    const maxDbLabelWidth = Math.max(...dbEntries.map(([name]) => name.length));
    const maxDbCountWidth = Math.max(...dbEntries.map(([, c]) => String(c).length));

    for (const [name, count] of dbEntries) {
      const paddedName = name.padEnd(maxDbLabelWidth);
      const paddedCount = String(count).padStart(maxDbCountWidth);
      lines.push(`  ${paddedName}: ${paddedCount} (${formatPercent(count, summary.uniqueArticles)})`);
    }
  }
  lines.push('');

  // Top journals
  lines.push('Top journals (by article count):');
  if (summary.topJournals.length > 0) {
    const maxJournalWidth = Math.max(...summary.topJournals.map((j) => j.name.length));
    const maxJournalCountWidth = Math.max(...summary.topJournals.map((j) => String(j.count).length));

    for (const journal of summary.topJournals) {
      const paddedName = journal.name.padEnd(maxJournalWidth);
      const paddedCount = String(journal.count).padStart(maxJournalCountWidth);
      lines.push(`  ${paddedName}: ${paddedCount}`);
    }
  }
  lines.push('');

  // Identifier coverage
  lines.push('Identifier coverage:');
  const idEntries: Array<[string, number]> = [
    ['With DOI', summary.identifierCoverage.withDoi],
    ['With PMID', summary.identifierCoverage.withPmid],
    ['No DOI/PMID', summary.identifierCoverage.noDoiOrPmid],
  ];
  const maxIdLabelWidth = Math.max(...idEntries.map(([label]) => label.length));
  const maxIdCountWidth = Math.max(...idEntries.map(([, c]) => String(c).length));

  for (const [label, count] of idEntries) {
    const paddedLabel = label.padEnd(maxIdLabelWidth);
    const paddedCount = String(count).padStart(maxIdCountWidth);
    lines.push(`  ${paddedLabel}: ${paddedCount} (${formatPercent(count, summary.uniqueArticles)})`);
  }

  return lines.join('\n');
}

export function formatSummaryJson(summary: SessionSummary): string {
  return JSON.stringify(summary, null, 2);
}
