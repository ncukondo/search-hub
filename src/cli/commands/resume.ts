import { loadSession, getResumableProviders } from '../../session/manager.js';
import type { ProviderName, ResumableProvider } from '../../session/types.js';

export interface ResumeCommandOptions {
  sessionId: string;
  providers?: ProviderName[];
  retryFailed?: boolean;
}

export interface CommandLineOptions {
  db?: string | undefined;
  retryFailed?: boolean | undefined;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface ResumeResult {
  success: boolean;
  providers?: ResumableProvider[];
  error?: string;
}

export function parseResumeOptions(
  sessionId: string,
  options: CommandLineOptions
): ResumeCommandOptions {
  const result: ResumeCommandOptions = {
    sessionId,
  };

  if (options.db) {
    result.providers = options.db.split(',').map((p) => p.trim()) as ProviderName[];
  }

  if (options.retryFailed) {
    result.retryFailed = true;
  }

  return result;
}

export function validateResumeInput(options: ResumeCommandOptions): ValidationResult {
  if (!options.sessionId || options.sessionId.trim() === '') {
    return {
      valid: false,
      error: 'A session ID is required',
    };
  }

  return { valid: true };
}

export async function getResumableProvidersForCommand(
  sessionId: string,
  sessionsDir: string,
  options: { providers?: ProviderName[] | undefined; retryFailed?: boolean | undefined }
): Promise<ResumeResult> {
  try {
    const session = await loadSession(sessionId, sessionsDir);
    let resumable = getResumableProviders(session);

    // Filter by specific providers if requested
    if (options.providers && options.providers.length > 0) {
      resumable = resumable.filter((r) => options.providers!.includes(r.provider));
    }

    // Filter to only retry strategies if retryFailed is true
    if (options.retryFailed) {
      resumable = resumable.filter((r) => r.strategy === 'retry');
    }

    return {
      success: true,
      providers: resumable,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: message,
    };
  }
}
