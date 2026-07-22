import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "skill-port-cli/desktop": fileURLToPath(new URL("../../src/desktop.ts", import.meta.url))
    }
  },
  test: {
    environment: "node",
    include: ["tests/rpc.test.ts", "tests/renderer-config.test.ts"]
  }
});
