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
  OverrideBlock,
  QueryAST,
} from './types.js';

// Parser exports
export { parseQueryFile, parseQueryString } from './parser.js';

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
  overrideBlockSchema,
  queryFileSchema,
} from './validator.js';
