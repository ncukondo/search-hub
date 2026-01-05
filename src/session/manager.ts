/**
 * Session manager for search-hub.
 *
 * Handles session CRUD operations including:
 * - Session ID generation
 * - Session creation and persistence
 * - Session loading and listing
 * - Session updates and status management
 */

/**
 * Sanitize a name for use in session ID.
 * Converts to lowercase, replaces spaces with dashes, removes special characters.
 */
export function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-') // Replace spaces with dashes
    .replace(/[^a-z0-9-]/g, '') // Remove non-alphanumeric except dashes
    .replace(/-+/g, '-') // Collapse multiple dashes
    .replace(/^-|-$/g, ''); // Trim dashes from start/end
}

/**
 * Generate a session ID in the format: {date}_{name}_{hash}
 * - date: YYYYMMDD format
 * - name: Sanitized query name
 * - hash: First 6 characters of query hash
 */
export function generateSessionId(queryName: string, queryHash: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const name = sanitizeName(queryName);
  const hash = queryHash.slice(0, 6);
  return `${date}_${name}_${hash}`;
}
