import { describe, expect, it } from "vitest";
import forgeConfig from "../forge.config.js";
import workerViteConfig from "../vite.worker.config.js";

describe("macOS packaging configuration", () => {
  it("uses an ad-hoc signature without hardened runtime", () => {
    const osxSign = forgeConfig.packagerConfig?.osxSign;
    expect(osxSign).toMatchObject({ identity: "-", identityValidation: false });
    expect(typeof osxSign).toBe("object");
    if (typeof osxSign !== "object") throw new Error("Expected explicit macOS signing options");
    expect(osxSign.optionsForFile?.("/tmp/Skill Port.app")).toEqual({ hardenedRuntime: false });
  });
});

describe("Vite packaging configuration", () => {
  it("gives the utility worker a dedicated bundle name", () => {
    expect(workerViteConfig).toBeTypeOf("object");
    if (typeof workerViteConfig !== "object" || workerViteConfig === null) {
      throw new Error("Expected a static Vite configuration");
    }
    const library = workerViteConfig.build?.lib;
    expect(library).toBeTypeOf("object");
    if (typeof library !== "object" || library === null) {
      throw new Error("Expected an explicit worker library build");
    }
    expect(library.entry).toBe("src/worker.ts");
    expect(library.formats).toEqual(["es"]);
    expect(typeof library.fileName).toBe("function");
    if (typeof library.fileName !== "function") throw new Error("Expected a worker file-name function");
    expect(library.fileName("es", "worker")).toBe("worker.mjs");
  });
});
