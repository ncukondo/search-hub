import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    watch: false,
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.e2e.test.ts", "src/**/*.d.ts"],
    },
    projects: [
      // Unit and integration tests (no external API calls)
      {
        test: {
          name: "unit",
          include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
          exclude: ["**/*.e2e.test.ts", "**/node_modules/**"],
        },
      },
      // E2E tests that call external APIs (run separately)
      {
        test: {
          name: "e2e",
          include: ["src/**/*.e2e.test.ts", "tests/**/*.e2e.test.ts"],
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
    ],
  },
});
