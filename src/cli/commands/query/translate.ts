/**
 * Query translate command implementation.
 *
 * Translates a YAML query file to native database query syntax for each provider.
 */
import { readFile } from 'node:fs/promises';
import { parseQueryString } from '../../../query/index.js';
import type { TranslatedQuery, ProviderName } from '../../../providers/base/types.js';
import { translateQuery as translatePubmed } from '../../../providers/pubmed/translator.js';
import { translateQuery as translateEric } from '../../../providers/eric/translator.js';
import { translateQuery as translateArxiv } from '../../../providers/arxiv/translator.js';
import { translateQuery as translateScopus } from '../../../providers/scopus/translator.js';
import { resolveForProvider } from '../../../query/resolver.js';

/**
 * Available translators by provider name.
 */
const translators: Record<string, (ast: Parameters<typeof translatePubmed>[0]) => TranslatedQuery> =
  {
    pubmed: translatePubmed,
    eric: translateEric,
    arxiv: translateArxiv,
    scopus: translateScopus,
  };

/**
 * Default providers to translate for.
 */
const DEFAULT_PROVIDERS: ProviderName[] = ['pubmed', 'eric', 'arxiv', 'scopus'];

/**
 * Options for translate command.
 */
export interface TranslateOptions {
  /** Specific providers to translate for */
  providers?: ProviderName[];
}

/**
 * Result of query translation.
 */
export interface TranslateResult {
  /** Whether translation succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Translations by provider name */
  translations?: Record<string, TranslatedQuery>;
}

/**
 * Translate a query YAML file to native syntax for each provider.
 *
 * @param filePath - Path to the query file
 * @param options - Translation options
 * @returns Translation result
 */
export async function translateQueryCommand(
  filePath: string,
  options: TranslateOptions = {},
): Promise<TranslateResult> {
  // Read file
  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read file';
    return {
      success: false,
      error: message,
    };
  }

  // Parse and validate
  let ast;
  try {
    ast = parseQueryString(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to parse query file';
    return {
      success: false,
      error: message,
    };
  }

  // Determine which providers to translate for
  const providers = options.providers ?? DEFAULT_PROVIDERS;

  // Translate for each provider
  const translations: Record<string, TranslatedQuery> = {};

  for (const provider of providers) {
    const translator = translators[provider];
    if (translator) {
      try {
        const resolved = resolveForProvider(ast, provider as ProviderName);
        translations[provider] = translator(resolved);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : `Failed to translate for ${provider}`;
        return {
          success: false,
          error: `${provider}: ${message}`,
        };
      }
    }
  }

  return {
    success: true,
    translations,
  };
}

/**
 * Format translation result for display.
 */
export function formatTranslateResult(result: TranslateResult, filePath: string): string {
  if (!result.success) {
    return `✗ Failed to translate: ${filePath}\n  Error: ${result.error}`;
  }

  const lines = [`Translations for: ${filePath}`, ''];

  if (result.translations) {
    for (const [provider, translation] of Object.entries(result.translations)) {
      lines.push(`[${provider.toUpperCase()}]`);
      lines.push(translation.native);
      if (translation.warnings && translation.warnings.length > 0) {
        for (const warning of translation.warnings) {
          lines.push(`⚠ ${warning}`);
        }
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
