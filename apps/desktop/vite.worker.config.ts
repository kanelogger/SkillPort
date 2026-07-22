import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "skill-port-cli/desktop": fileURLToPath(new URL("../../src/desktop.ts", import.meta.url))
    }
  },
  build: {
    rollupOptions: { external: ["electron", /^node:/] }
  }
});
