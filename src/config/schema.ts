import { z } from 'zod';

/**
 * Default values for provider configuration.
 */
const PROVIDER_DEFAULTS = {
  enabled: true,
  rate_limit: 3,
  timeout: 30000,
  retries: 3,
  max_results: 10000,
} as const;

/**
 * Schema for individual provider configuration.
 * Each provider (PubMed, Scopus, etc.) has similar config options.
 */
export const ProviderConfigSchema = z.object({
  enabled: z.boolean().default(PROVIDER_DEFAULTS.enabled),
  api_key: z.string().optional(),
  email: z.string().email().optional(),
  rate_limit: z.number().positive().default(PROVIDER_DEFAULTS.rate_limit),
  timeout: z.number().positive().default(PROVIDER_DEFAULTS.timeout),
  retries: z.number().int().min(0).default(PROVIDER_DEFAULTS.retries),
  max_results: z.number().int().positive().default(PROVIDER_DEFAULTS.max_results),
  inst_token: z.string().optional(),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

/**
 * Get default provider config object.
 */
function getDefaultProviderConfig(): ProviderConfig {
  return ProviderConfigSchema.parse({});
}

/**
 * Main configuration schema for search-hub.
 * All fields have defaults, so an empty object is valid input.
 */
export const ConfigSchema = z.object({
  session: z
    .object({
      directory: z.string().default('~/.search-hub/sessions'),
    })
    .default(() => ({ directory: '~/.search-hub/sessions' })),

  log: z
    .object({
      level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    })
    .default(() => ({ level: 'info' as const })),

  output: z
    .object({
      color: z.boolean().default(true),
      progress_bar: z.boolean().default(true),
    })
    .default(() => ({ color: true, progress_bar: true })),

  providers: z
    .object({
      pubmed: ProviderConfigSchema.default(getDefaultProviderConfig),
      eric: ProviderConfigSchema.default(getDefaultProviderConfig),
      arxiv: ProviderConfigSchema.default(getDefaultProviderConfig),
      scopus: ProviderConfigSchema.default(getDefaultProviderConfig),
      wos: ProviderConfigSchema.default(getDefaultProviderConfig),
      embase: ProviderConfigSchema.default(getDefaultProviderConfig),
    })
    .default(() => ({
      pubmed: getDefaultProviderConfig(),
      eric: getDefaultProviderConfig(),
      arxiv: getDefaultProviderConfig(),
      scopus: getDefaultProviderConfig(),
      wos: getDefaultProviderConfig(),
      embase: getDefaultProviderConfig(),
    })),

  integration: z
    .object({
      reference_manager: z
        .object({
          enabled: z.boolean().default(true),
          command: z.string().default('ref'),
          auto_register: z.boolean().default(false),
        })
        .default(() => ({ enabled: true, command: 'ref', auto_register: false })),
    })
    .default(() => ({
      reference_manager: { enabled: true, command: 'ref', auto_register: false },
    })),
});

export type Config = z.infer<typeof ConfigSchema>;
