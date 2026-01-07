/**
 * Sessions directory resolution utility.
 */
import { loadConfig, getDefaultConfig } from '../../config/index.js';
import type { GlobalOptions } from '../index.js';

/**
 * Resolve the sessions directory from global options or config.
 *
 * Resolution order:
 * 1. Explicit --session-dir option
 * 2. session.directory from config file
 * 3. Default config value
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
    return getDefaultConfig().session.directory;
  }
}
