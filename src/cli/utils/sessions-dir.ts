/**
 * Sessions directory resolution utility.
 */
import { loadConfig } from '../../config/index.js';
import { getDefaultSessionsDir } from '../../config/paths.js';
import type { GlobalOptions } from '../index.js';

/**
 * Resolve the sessions directory from global options or config.
 *
 * Resolution order:
 * 1. Explicit --session-dir option
 * 2. session.directory from config file
 * 3. Platform-specific default via getDefaultSessionsDir()
 *
 * @param globalOpts - Global CLI options
 * @returns Resolved sessions directory path
 */
export async function getSessionsDir(globalOpts: GlobalOptions): Promise<string> {
  if (globalOpts.sessionDir) {
    return globalOpts.sessionDir;
  }
  try {
    const config = await loadConfig(
      globalOpts.config ? { globalConfigPath: globalOpts.config } : {}
    );
    return config.session.directory;
  } catch {
    // loadConfig already resolves empty to platform default, but if config
    // loading fails entirely, use the platform default directly
    return getDefaultSessionsDir();
  }
}
