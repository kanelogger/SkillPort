import { join } from "node:path";

export function publishedInstallEnvironment(baseEnvironment, root, attempt) {
  return {
    ...baseEnvironment,
    npm_config_cache: join(root, "npm-cache", `install-${attempt}`),
    npm_config_prefer_online: "true"
  };
}
