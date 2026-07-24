import { posix, win32 } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveRendererFile } from "../src/path-guard.js";

describe("resolveRendererFile", () => {
  const cases = [
    { platform: "posix", path: posix, root: "/app.asar/.vite/renderer/main_window" },
    { platform: "win32", path: win32, root: "C:\\Program Files\\Skill Port\\resources\\app.asar\\.vite\\renderer\\main_window" }
  ] as const;

  for (const { platform, path, root } of cases) {
    describe(platform, () => {
      it("allows index.html", () => {
        const result = resolveRendererFile(root, "/index.html", path);
        expect(result.allowed).toBe(true);
        expect(result.filePath).toBe(path.join(root, "index.html"));
      });

      it("allows assets under the renderer root", () => {
        const result = resolveRendererFile(root, "/assets/index-abc123.js", path);
        expect(result.allowed).toBe(true);
        expect(result.filePath).toBe(path.join(root, "assets", "index-abc123.js"));
      });

      it("falls back to index.html for root requests", () => {
        const result = resolveRendererFile(root, "/", path);
        expect(result.allowed).toBe(true);
        expect(result.filePath).toBe(path.join(root, "index.html"));
      });

      it("blocks traversal outside the renderer root", () => {
        const result = resolveRendererFile(root, "/../secret.txt", path);
        expect(result.allowed).toBe(false);
      });

      it("blocks encoded traversal outside the renderer root", () => {
        const result = resolveRendererFile(root, "/%2e%2e/%2e%2e/etc/passwd", path);
        expect(result.allowed).toBe(false);
      });

      it("decodes URL-encoded paths", () => {
        const result = resolveRendererFile(root, "/assets/foo%20bar.js", path);
        expect(result.allowed).toBe(true);
        expect(result.filePath).toBe(path.join(root, "assets", "foo bar.js"));
      });
    });
  }
});
