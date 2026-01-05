/**
 * Scopus Provider E2E Tests
 *
 * These tests call the actual Scopus API and should be run separately:
 *   npm run test:e2e
 *
 * Requirements:
 * - Network access to Scopus API (api.elsevier.com)
 * - Valid Scopus API key (SCOPUS_API_KEY environment variable)
 */
import { describe, it, expect } from "vitest";

describe("Scopus Provider E2E", () => {
  it.todo("should search Scopus and return results");
  it.todo("should fetch document details by Scopus ID");
  it.todo("should handle rate limiting gracefully");
  it.todo("should handle authentication errors");
});
