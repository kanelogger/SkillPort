import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "e2e.test.ts",
  workers: 1,
  timeout: 180_000,
  reporter: "line",
  use: { trace: "retain-on-failure" }
});
