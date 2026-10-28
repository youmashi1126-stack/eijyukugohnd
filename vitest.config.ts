import path from "node:path";
import { defineConfig } from "vitest/config";

// ユニットテスト（npm test）。@/ はリポジトリの直下
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: { include: ["tests/**/*.test.ts"] },
});
