/**
 * PubMed Provider E2E Tests
 *
 * These tests call the actual PubMed API and should be run separately:
 *   npm run test:e2e
 *
 * Requirements:
 * - Network access to PubMed E-utilities
 * - Optional: NCBI API key for higher rate limits
 */
import { describe, it, expect } from "vitest";

describe("PubMed Provider E2E", () => {
  it.todo("should search PubMed and return results");
  it.todo("should fetch article details by PMID");
  it.todo("should handle rate limiting gracefully");
});
