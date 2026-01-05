/**
 * arXiv Provider E2E Tests
 *
 * These tests call the actual arXiv API and should be run separately:
 *   npm run test:e2e
 *
 * Requirements:
 * - Network access to arXiv API (export.arxiv.org)
 */
import { describe, it, expect } from "vitest";

describe("arXiv Provider E2E", () => {
  it.todo("should search arXiv and return results");
  it.todo("should fetch paper details by arXiv ID");
  it.todo("should handle rate limiting gracefully");
});
