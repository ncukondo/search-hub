/**
 * Smart query file resolution.
 *
 * Resolution order:
 * 1. Exact path exists → use it
 * 2. <arg>.yaml exists → use it
 * 3. queries/<arg>.yaml exists → use it
 * 4. queries/<arg>.yml exists → use it
 * 5. Error with tried paths
 */
import { stat } from 'node:fs/promises';

export class NotAFileError extends Error {
  constructor(path: string) {
    super(`Path is not a file: ${path}`);
    this.name = 'NotAFileError';
  }
}

async function isFile(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    if (!s.isFile()) {
      throw new NotAFileError(path);
    }
    return true;
  } catch (error) {
    if (error instanceof NotAFileError) {
      throw error;
    }
    return false;
  }
}

export async function resolveQueryFile(arg: string): Promise<string> {
  // 1. Exact path
  if (await isFile(arg)) {
    return arg;
  }

  const candidates: string[] = [];

  // 2. arg + .yaml (skip if already ends with .yaml)
  if (!arg.endsWith('.yaml') && !arg.endsWith('.yml')) {
    const withExt = `${arg}.yaml`;
    candidates.push(withExt);
    if (await isFile(withExt)) {
      return withExt;
    }
  }

  // 3. .search-hub/queries/<arg>.yaml
  const basename = arg.endsWith('.yaml') || arg.endsWith('.yml') ? arg : `${arg}.yaml`;
  const inQueries = `.search-hub/queries/${basename}`;
  candidates.push(inQueries);
  if (await isFile(inQueries)) {
    return inQueries;
  }

  // 4. .search-hub/queries/<arg>.yml (skip if arg already has extension)
  if (!arg.endsWith('.yaml') && !arg.endsWith('.yml')) {
    const inQueriesYml = `.search-hub/queries/${arg}.yml`;
    candidates.push(inQueriesYml);
    if (await isFile(inQueriesYml)) {
      return inQueriesYml;
    }
  }

  // 5. Error
  const tried = [`./${arg}`, ...candidates.map(c => `./${c}`)];
  throw new Error(
    `Query file not found: "${arg}"\n` +
    `  Tried:\n` +
    tried.map(p => `    ${p}`).join('\n') + '\n' +
    `  Create a new query: search-hub query init "${arg}"`
  );
}
