import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [
    dts({
      include: ["src/**/*"],
      exclude: ["src/**/*.test.ts"],
    }),
  ],
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, "src/index.ts"),
        "cli/index": resolve(__dirname, "src/cli/index.ts"),
      },
      formats: ["es"],
    },
    rollupOptions: {
      external: [
        /^node:/,
        "@iarna/toml",
        "commander",
        "ora",
        "yaml",
        "zod",
      ],
      output: {
        preserveModules: true,
        preserveModulesRoot: "src",
        entryFileNames: "[name].js",
      },
    },
    target: "node22",
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
  },
});
