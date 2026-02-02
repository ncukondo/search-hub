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
