import { listSessions, loadSession } from '../../session/manager.js';

export interface SessionListItem {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  progress: string;
}

export interface DatabaseDetails {
  provider: string;
  status: string;
  totalHits: number;
  retrievedCount: number;
  error?: string;
}

export interface SessionDetails {
  id: string;
  name: string;
  description?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  queryFile: string;
  totalHits: number;
  totalRetrieved: number;
  databases: DatabaseDetails[];
}

export interface ListOptions {
  all: boolean;
}

export interface FormatOptions {
  json: boolean;
}

export async function listSessionsForDisplay(
  sessionsDir: string,
  options: ListOptions
): Promise<SessionListItem[]> {
  const summaries = await listSessions(sessionsDir);

  const filtered = options.all
    ? summaries
    : summaries.filter((s) => s.status !== 'completed');

  return filtered.map((s) => ({
    id: s.id,
    name: s.name,
    status: s.status,
    createdAt: s.createdAt,
    progress: `${s.totalRetrieved}/${s.totalHits}`,
  }));
}

export async function getSessionDetails(
  sessionId: string,
  sessionsDir: string
): Promise<{ success: boolean; session?: SessionDetails; error?: string }> {
  try {
    const session = await loadSession(sessionId, sessionsDir);

    const databases: DatabaseDetails[] = [];
    for (const [provider, dbStatus] of Object.entries(session.databases)) {
      if (!dbStatus) continue;
      const dbDetail: DatabaseDetails = {
        provider,
        status: dbStatus.status,
        totalHits: dbStatus.totalHits ?? 0,
        retrievedCount: dbStatus.retrievedCount ?? 0,
      };
      if (dbStatus.error?.message) {
        dbDetail.error = dbStatus.error.message;
      }
      databases.push(dbDetail);
    }

    const sessionDetails: SessionDetails = {
      id: session.id,
      name: session.name,
      status: session.summary.status,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      queryFile: session.query.file,
      totalHits: session.summary.totalHits,
      totalRetrieved: session.summary.totalRetrieved,
      databases,
    };
    if (session.description) {
      sessionDetails.description = session.description;
    }

    return {
      success: true,
      session: sessionDetails,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: message,
    };
  }
}

export function formatSessionList(
  sessions: SessionListItem[],
  options: FormatOptions
): string {
  if (options.json) {
    return JSON.stringify(sessions, null, 2);
  }

  if (sessions.length === 0) {
    return 'No sessions found.';
  }

  const header = `${'ID'.padEnd(35)} ${'NAME'.padEnd(20)} ${'STATUS'.padEnd(15)} ${'PROGRESS'.padEnd(12)} CREATED`;
  const separator = '-'.repeat(100);

  const rows = sessions.map((s) => {
    const date = new Date(s.createdAt).toLocaleDateString();
    return `${s.id.padEnd(35)} ${s.name.padEnd(20)} ${s.status.padEnd(15)} ${s.progress.padEnd(12)} ${date}`;
  });

  return [header, separator, ...rows].join('\n');
}

export function formatSessionDetails(
  details: SessionDetails,
  options: FormatOptions
): string {
  if (options.json) {
    return JSON.stringify(details, null, 2);
  }

  const lines: string[] = [];

  lines.push(`Session: ${details.name}`);
  lines.push(`ID: ${details.id}`);
  if (details.description) {
    lines.push(`Description: ${details.description}`);
  }
  lines.push(`Status: ${details.status}`);
  lines.push(`Query File: ${details.queryFile}`);
  lines.push(`Created: ${new Date(details.createdAt).toLocaleString()}`);
  lines.push(`Updated: ${new Date(details.updatedAt).toLocaleString()}`);
  lines.push('');
  lines.push(`Total: ${details.totalRetrieved}/${details.totalHits} results`);
  lines.push('');
  lines.push('Databases:');

  for (const db of details.databases) {
    const statusIcon = getStatusIcon(db.status);
    let line = `  ${statusIcon} ${db.provider.padEnd(10)} ${db.status.padEnd(12)} ${db.retrievedCount}/${db.totalHits}`;
    if (db.error) {
      line += ` (${db.error})`;
    }
    lines.push(line);
  }

  return lines.join('\n');
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'completed':
      return '\u2713'; // ✓
    case 'failed':
      return '\u2717'; // ✗
    case 'in_progress':
      return '\u280B'; // ⠋
    case 'pending':
      return '\u25FC'; // ◼
    default:
      return ' ';
  }
}
