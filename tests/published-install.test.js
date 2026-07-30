import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";

import { publishedInstallEnvironment } from "../scripts/smoke/published-install-environment.mjs";

test("published install retries use fresh online npm metadata", () => {
  const root = join("tmp", "published-smoke");
  const base = {
    npm_config_cache: "shared-cache",
    npm_config_prefer_online: "false",
    SKLP_TEST_HOME: root
  };

  const first = publishedInstallEnvironment(base, root, 1);
  const second = publishedInstallEnvironment(base, root, 2);

  assert.equal(first.npm_config_cache, join(root, "npm-cache", "install-1"));
  assert.equal(second.npm_config_cache, join(root, "npm-cache", "install-2"));
  assert.notEqual(first.npm_config_cache, second.npm_config_cache);
  assert.equal(first.npm_config_prefer_online, "true");
  assert.equal(first.SKLP_TEST_HOME, root);
  assert.equal(base.npm_config_cache, "shared-cache");
  assert.equal(base.npm_config_prefer_online, "false");
});
