import { describe, expect, it } from "vitest";
import forgeConfig from "../forge.config.js";

describe("macOS packaging configuration", () => {
  it("uses an ad-hoc signature without hardened runtime", () => {
    const osxSign = forgeConfig.packagerConfig?.osxSign;
    expect(osxSign).toMatchObject({ identity: "-", identityValidation: false });
    expect(typeof osxSign).toBe("object");
    if (typeof osxSign !== "object") throw new Error("Expected explicit macOS signing options");
    expect(osxSign.optionsForFile?.("/tmp/Skill Port.app")).toEqual({ hardenedRuntime: false });
  });
});
