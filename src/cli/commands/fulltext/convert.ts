/**
 * Fulltext convert command - converts PMC XML to Markdown.
 */

import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { getFulltextDir, getArticleDir, getMetaPath } from '../../../fulltext/paths.js';
import { convertPmcXmlToMarkdown } from '../../../fulltext/convert/index.js';

export interface FulltextConvertOptions {
  sessionId: string;
  article?: string;
}

export interface ConvertArticleResult {
  dirName: string;
  title: string;
  status: 'converted' | 'skipped' | 'failed';
  error?: string;
}

export interface ConvertCommandResult {
  success: boolean;
  converted: number;
  skipped: number;
  failed: number;
  articles: ConvertArticleResult[];
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get list of article directory names to process.
 */
async function getArticleDirs(
  sessionDir: string,
  articleFilter?: string,
): Promise<string[]> {
  const fulltextDir = getFulltextDir(sessionDir);

  if (articleFilter) {
    // Filter to specific article
    const articlePath = getArticleDir(sessionDir, articleFilter);
    if (await fileExists(articlePath)) {
      return [articleFilter];
    }
    return [];
  }

  // List all directories in fulltext/
  try {
    const entries = await readdir(fulltextDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
}

export async function executeFulltextConvert(
  options: FulltextConvertOptions,
  sessionsDir: string,
): Promise<ConvertCommandResult> {
  const sessionDir = join(sessionsDir, options.sessionId);
  const articleDirs = await getArticleDirs(sessionDir, options.article);

  const articles: ConvertArticleResult[] = [];
  let converted = 0;
  let skipped = 0;
  let failed = 0;

  for (const dirName of articleDirs) {
    const articleDir = getArticleDir(sessionDir, dirName);
    const xmlPath = join(articleDir, 'fulltext.xml');
    const mdPath = join(articleDir, 'fulltext.md');
    const metaPath = getMetaPath(sessionDir, dirName);

    // Check if XML exists
    if (!(await fileExists(xmlPath))) {
      continue; // No XML to convert, skip silently
    }

    // Check if already converted
    if (await fileExists(mdPath)) {
      skipped++;
      articles.push({ dirName, title: dirName, status: 'skipped' });
      continue;
    }

    // Convert
    const metaPathExists = await fileExists(metaPath);
    const result = await convertPmcXmlToMarkdown(
      xmlPath,
      mdPath,
      metaPathExists ? metaPath : undefined,
    );

    if (result.success) {
      converted++;
      articles.push({
        dirName,
        title: result.title ?? dirName,
        status: 'converted',
      });
    } else {
      failed++;
      const articleResult: ConvertArticleResult = {
        dirName,
        title: dirName,
        status: 'failed',
      };
      if (result.error) articleResult.error = result.error;
      articles.push(articleResult);
    }
  }

  return {
    success: failed === 0,
    converted,
    skipped,
    failed,
    articles,
  };
}
