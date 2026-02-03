/**
 * Results I/O utilities for session management.
 *
 * Provides functions for:
 * - Converting JSONL results to human-readable YAML
 * - Loading results from YAML with JSONL fallback
 */
import { readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { Document, parse as parseYaml, isSeq, isMap, Scalar } from 'yaml';
import type { Article, ProviderName } from '../providers/base/types.js';

/**
 * Metadata for YAML conversion.
 */
export interface ConversionMetadata {
  provider: ProviderName;
  queryName: string;
}

/**
 * Remove null/undefined values and rawResponse from an article for YAML output.
 */
function cleanArticleForYaml(article: Article): Omit<Article, 'rawResponse'> {
  const cleaned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(article)) {
    // Skip rawResponse field entirely
    if (key === 'rawResponse') continue;

    // Skip null/undefined values
    if (value === null || value === undefined) continue;

    // Skip empty arrays for authors
    if (key === 'authors' && Array.isArray(value) && value.length === 0) {
      cleaned[key] = [];
      continue;
    }

    cleaned[key] = value;
  }

  return cleaned as Omit<Article, 'rawResponse'>;
}

/**
 * Convert JSONL results file to YAML format.
 *
 * The YAML output:
 * - Excludes rawResponse field (provider-internal data)
 * - Omits null/undefined fields
 * - Uses block scalars for multi-line abstracts
 * - Includes header comment with provider, count, and query name
 */
export async function convertResultsToYaml(
  jsonlPath: string,
  yamlPath: string,
  metadata: ConversionMetadata
): Promise<void> {
  // Read JSONL file
  const content = await readFile(jsonlPath, 'utf-8');
  const lines = content.trim().split('\n').filter((line) => line.length > 0);

  const articles: Array<Omit<Article, 'rawResponse'>> = [];

  for (const line of lines) {
    const article = JSON.parse(line) as Article;
    articles.push(cleanArticleForYaml(article));
  }

  // Create YAML document and set block scalar for multi-line strings
  const doc = new Document(articles);

  // Walk through the document to set block scalar type for multi-line strings
  function setBlockScalars(node: unknown): void {
    if (isSeq(node)) {
      for (const item of node.items) {
        setBlockScalars(item);
      }
    } else if (isMap(node)) {
      for (const pair of node.items) {
        const key = pair.key;
        const value = pair.value;

        // Check if this is an abstract field with multi-line content
        if (
          key instanceof Scalar &&
          key.value === 'abstract' &&
          value instanceof Scalar &&
          typeof value.value === 'string' &&
          value.value.includes('\n')
        ) {
          value.type = Scalar.BLOCK_LITERAL;
        }

        setBlockScalars(value);
      }
    }
  }

  setBlockScalars(doc.contents);

  const yamlContent = doc.toString({
    lineWidth: 0, // Disable line wrapping
    defaultStringType: 'QUOTE_DOUBLE',
    defaultKeyType: 'PLAIN',
  });

  // Build header comment
  const header = `# Results: ${metadata.provider} (${articles.length} articles)\n# Query: ${metadata.queryName}\n\n`;

  await writeFile(yamlPath, header + yamlContent, 'utf-8');
}

/**
 * Load results from a session directory for a specific provider.
 *
 * Reads from YAML when available, falls back to JSONL for
 * in-progress or legacy sessions.
 */
export async function loadResults(
  sessionDir: string,
  provider: ProviderName
): Promise<Article[]> {
  const yamlPath = join(sessionDir, `${provider}_results.yaml`);
  const jsonlPath = join(sessionDir, `${provider}_results.jsonl`);

  // Try YAML first
  try {
    await access(yamlPath);
    const content = await readFile(yamlPath, 'utf-8');
    const articles = parseYaml(content) as Article[];
    return articles ?? [];
  } catch {
    // YAML not available, fall back to JSONL
  }

  // Try JSONL
  try {
    await access(jsonlPath);
    const content = await readFile(jsonlPath, 'utf-8');
    const lines = content.trim().split('\n').filter((line) => line.length > 0);
    return lines.map((line) => JSON.parse(line) as Article);
  } catch {
    // Neither file exists
    return [];
  }
}
