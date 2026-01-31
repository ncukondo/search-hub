import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    watch: false,
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.e2e.test.ts", "src/**/*.api.test.ts", "src/**/*.d.ts"],
    },
    projects: [
      // Unit and integration tests (no external API calls)
      {
        test: {
          name: "unit",
          include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
          exclude: ["**/*.e2e.test.ts", "**/*.api.test.ts", "**/node_modules/**"],
        },
      },
      // E2E tests with mocked APIs (run in CI)
      {
        test: {
          name: "e2e",
          include: ["src/**/*.e2e.test.ts", "tests/**/*.e2e.test.ts"],
          exclude: ["**/*.api.test.ts", "**/node_modules/**"],
          // Longer timeout for external API calls
          testTimeout: 30000,
          // Run tests sequentially to avoid rate limiting issues
          sequence: {
            concurrent: false,
          },
          // Retry failed tests once (network issues)
          retry: 1,
        },
      },
      // Real API tests (run separately, not in CI)
      {
        test: {
          name: "api",
          include: ["src/**/*.api.test.ts"],
          testTimeout: 60000,
          hookTimeout: 30000,
          sequence: {
            concurrent: false,
          },
          retry: 2,
        },
      },
    ],
  },
});
