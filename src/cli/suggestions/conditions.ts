import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Check if there are other sessions in the sessions directory.
 * Returns the count of sessions.
 */
export function countSessions(sessionsDir: string): number {
  try {
    const entries = readdirSync(sessionsDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).length;
  } catch {
    return 0;
  }
}

/**
 * Check if a review file exists for a session.
 */
export function hasReviewFile(sessionsDir: string, sessionId: string): boolean {
  const reviewsPath = join(sessionsDir, sessionId, '.internal', 'reviews.yaml');
  return existsSync(reviewsPath);
}
