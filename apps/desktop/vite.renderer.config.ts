import react from "@vitejs/plugin-react";
import { randomBytes } from "node:crypto";
import { defineConfig, type UserConfig } from "vite";

export function applyDevelopmentStyleNonce(html: string, nonce: string): string {
  return html.replace("style-src 'self'", `style-src 'self' 'nonce-${nonce}'`);
}

export function createRendererConfig(command: "serve" | "build", nonce = randomBytes(16).toString("base64")): UserConfig {
  const development = command === "serve";
  return {
    html: development ? { cspNonce: nonce } : undefined,
    plugins: [
      react(),
      ...(development ? [{
        name: "skill-port-development-csp",
        transformIndexHtml: (html: string) => applyDevelopmentStyleNonce(html, nonce)
      }] : [])
    ]
  };
}

export default defineConfig(({ command }) => createRendererConfig(command));
