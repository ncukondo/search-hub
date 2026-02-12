/**
 * Coverage check command - verifies known articles are present in session results.
 */

export interface ParsedIdentifier {
  type: 'doi' | 'pmid' | 'arxiv';
  value: string;
  raw: string;
}

export function parseIdentifierFile(content: string): ParsedIdentifier[] {
  const results: ParsedIdentifier[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const parsed = parseLine(trimmed, i + 1);
    results.push(parsed);
  }

  return results;
}

function parseLine(line: string, lineNumber: number): ParsedIdentifier {
  // Check for explicit prefix (case-insensitive)
  const prefixMatch = line.match(/^(doi|pmid|arxiv):(.+)$/i);
  if (prefixMatch) {
    const prefix = prefixMatch[1]!.toLowerCase() as 'doi' | 'pmid' | 'arxiv';
    return { type: prefix, value: prefixMatch[2]!, raw: line };
  }

  // Auto-detect: starts with "10." → DOI
  if (line.startsWith('10.')) {
    return { type: 'doi', value: line, raw: line };
  }

  // Auto-detect: all digits → PMID
  if (/^\d+$/.test(line)) {
    return { type: 'pmid', value: line, raw: line };
  }

  throw new Error(`Unrecognizable identifier at line ${lineNumber}: ${line}`);
}
