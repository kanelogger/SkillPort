import type { DesktopBridge } from "../shared/rpc.js";

declare global {
  interface Window {
    skillPort: DesktopBridge;
  }
}

export {};
