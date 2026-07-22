import { describe, expect, it } from "vitest";
import { applyDevelopmentStyleNonce, createRendererConfig } from "../vite.renderer.config.js";

describe("renderer CSP configuration", () => {
  it("allows only the Vite development style nonce while preserving production CSP", () => {
    const html = "default-src 'self'; style-src 'self'; img-src 'self'";
    expect(applyDevelopmentStyleNonce(html, "test-nonce"))
      .toContain("style-src 'self' 'nonce-test-nonce'");
    expect(createRendererConfig("serve", "test-nonce").html?.cspNonce).toBe("test-nonce");
    expect(createRendererConfig("build", "test-nonce").html).toBeUndefined();
  });
});
