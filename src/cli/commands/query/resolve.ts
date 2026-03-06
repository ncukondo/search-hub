/**
 * Smart query file resolution.
 *
 * Resolution order:
 * 1. Exact path exists → use it
 * 2. <arg>.yaml exists → use it
 * 3. queries/<arg>.yaml exists → use it
 * 4. Error with tried paths
 */
import { stat } from 'node:fs/promises';

async function isFile(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    if (!s.isFile()) {
      throw new Error(`Path is not a file: ${path}`);
    }
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Path is not a file')) {
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

  // 3. queries/<arg>.yaml
  const basename = arg.endsWith('.yaml') || arg.endsWith('.yml') ? arg : `${arg}.yaml`;
  const inQueries = `queries/${basename}`;
  candidates.push(inQueries);
  if (await isFile(inQueries)) {
    return inQueries;
  }

  // 4. Error
  const tried = [`./${arg}`, ...candidates.map(c => `./${c}`)];
  throw new Error(
    `Query file not found: "${arg}"\n` +
    `  Tried:\n` +
    tried.map(p => `    ${p}`).join('\n') + '\n' +
    `  Create a new query: search-hub query init "${arg}"`
  );
}
