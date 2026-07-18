/**
 * Query Module
 *
 * Provides YAML query parsing and validation for the search-hub CLI.
 * Parses YAML query files into validated QueryAST structures.
 *
 * @module query
 */

// Type exports
export type {
  FieldType,
  Operator,
  ProviderName,
  TermBlock,
  QueryBlock,
  Filters,
  PublicationTypeFilter,
  ProviderSection,
  QueryAST,
  ResolvedAST,
} from './types.js';

// Parser exports
export { parseQueryFile, parseQueryString } from './parser.js';

// Resolver exports
export { resolveForProvider } from './resolver.js';

// Validator exports
export {
  validateQueryFile,
  formatValidationErrors,
  ValidationError,
  // Schema exports for advanced use cases
  fieldTypeSchema,
  termBlockSchema,
  queryBlockSchema,
  filtersSchema,
  providerSectionSchema,
  queryFileSchema,
} from './validator.js';

// Vocabulary validation exports
export { MeSHLookupClient } from './mesh-lookup.js';
export type { MeSHLookupResult } from './mesh-lookup.js';
export { extractControlledVocabTerms, validateControlledVocab } from './vocab-validator.js';
export type {
  VocabTerm,
  VocabTermError,
  VocabTermResult,
  VocabValidationResult,
} from './vocab-validator.js';
