/**
 * Session event logger for search-hub.
 *
 * Logs events to a JSON Lines file for debugging and audit trails.
 */

import { appendFile } from 'node:fs/promises';
import type { LogEvent } from './types';

/**
 * Session event logger.
 *
 * Logs events to a JSON Lines file (one event per line).
 */
export class SessionLogger {
  private readonly logPath: string;

  constructor(logPath: string) {
    this.logPath = logPath;
  }

  /**
   * Log an event to the log file.
   */
  async log(event: LogEvent): Promise<void> {
    const line = JSON.stringify(event) + '\n';
    await appendFile(this.logPath, line, 'utf-8');
  }
}
