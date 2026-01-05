import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Expand ~ at the start of a path to the user's home directory.
 * - `~` or `~/...` expands to home directory
 * - Absolute paths are returned unchanged
 * - Relative paths are returned unchanged
 * - `~` in the middle of a path is not expanded
 */
export function expandPath(path: string): string {
  if (path === '~') {
    return homedir();
  }

  if (path.startsWith('~/')) {
    return join(homedir(), path.slice(2));
  }

  return path;
}
