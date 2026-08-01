import { describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import { authorizeRpcPaths } from "../src/path-authority.js";
import { createSerialDispatcher, dispatchRpc, type DesktopOperations } from "../src/rpc-handler.js";
import { parseRpcRequest, type RpcRequest } from "../src/shared/rpc.js";

describe("desktop RPC contract", () => {
  it("validates method-specific parameters", () => {
    expect(parseRpcRequest({ id: "1", method: "getSkill", params: { name: "sample-skill" } })).toEqual({
      id: "1",
      method: "getSkill",
      params: { name: "sample-skill" }
    });
    expect(() => parseRpcRequest({ id: "2", method: "getSkill", params: {} })).toThrow();
    expect(() => parseRpcRequest({ id: "3", method: "unknown", params: {} })).toThrow();
    expect(() => parseRpcRequest({ id: "4", method: "remove", params: { name: "skill", force: "yes" } })).toThrow();
    expect(parseRpcRequest({ id: "5", method: "updateTags", params: { name: "skill", tags: ["video"] } })).toEqual({
      id: "5",
      method: "updateTags",
      params: { name: "skill", tags: ["video"] }
    });
    expect(() => parseRpcRequest({ id: "6", method: "updateTags", params: { name: "skill", tags: [""] } })).toThrow();
    expect(() => parseRpcRequest({ id: "7", method: "updateTags", params: { name: "skill", tags: Array(33).fill("tag") } })).toThrow();
    expect(parseRpcRequest({ id: "8", method: "checkUpdate", params: { name: "skill" } })).toEqual({
      id: "8",
      method: "checkUpdate",
      params: { name: "skill" }
    });
    expect(parseRpcRequest({ id: "9", method: "update", params: { name: "skill", ref: "main" } })).toEqual({
      id: "9",
      method: "update",
      params: { name: "skill", ref: "main" }
    });
    expect(parseRpcRequest({ id: "10", method: "updateAll", params: { ref: "main" } })).toEqual({
      id: "10",
      method: "updateAll",
      params: { ref: "main" }
    });
    expect(() => parseRpcRequest({ id: "11", method: "updateAll", params: { unexpected: true } })).toThrow();
    expect(parseRpcRequest({
      id: "12",
      method: "exportCatalog",
      params: { output: "/tmp/catalog.html", language: "zh-CN" }
    })).toEqual({
      id: "12",
      method: "exportCatalog",
      params: { output: "/tmp/catalog.html", language: "zh-CN" }
    });
    expect(() => parseRpcRequest({
      id: "13",
      method: "exportCatalog",
      params: { output: "/tmp/catalog.html", language: "fr" }
    })).toThrow();
    expect(() => parseRpcRequest({
      id: "14",
      method: "exportCatalog",
      params: { output: "/tmp/catalog.html", language: "en", force: true }
    })).toThrow();
    expect(parseRpcRequest({ id: "15", method: "previewSyncAll", params: { prune: true } })).toEqual({
      id: "15",
      method: "previewSyncAll",
      params: { prune: true }
    });
    expect(parseRpcRequest({ id: "16", method: "syncAllSources", params: { prune: true, force: true } })).toEqual({
      id: "16",
      method: "syncAllSources",
      params: { prune: true, force: true }
    });
    expect(() => parseRpcRequest({ id: "17", method: "syncAllSources", params: { force: true } })).toThrow();
    expect(() => parseRpcRequest({ id: "18", method: "previewSyncAll", params: { prune: true, ref: "main" } })).toThrow();
  });

  it("dispatches tag updates through the allowlisted facade", async () => {
    const updateTags = vi.fn(() => ({ name: "sample-skill", tags: ["video"] }));
    const desktop = { updateTags } as unknown as DesktopOperations;
    const value = await dispatchRpc({
      id: "1",
      method: "updateTags",
      params: { name: "sample-skill", tags: ["video"] }
    }, desktop);
    expect(value).toEqual({ name: "sample-skill", tags: ["video"] });
    expect(updateTags).toHaveBeenCalledWith("sample-skill", ["video"]);
  });

  it("dispatches update operations through the allowlisted facade", async () => {
    const checkUpdate = vi.fn(() => ({ name: "sample-skill", status: "outdated" }));
    const checkAllUpdates = vi.fn(() => [{ name: "sample-skill", status: "outdated" }]);
    const previewUpdate = vi.fn(() => ({ planned: [{ name: "sample-skill", revision: "abc" }], skipped: [], failed: [] }));
    const previewAllUpdates = vi.fn(() => ({ planned: [{ name: "sample-skill", revision: "abc" }], skipped: [], failed: [] }));
    const update = vi.fn(() => ({ name: "sample-skill", sourceRevision: "abc" }));
    const updateAll = vi.fn(() => ({ updated: [{ name: "sample-skill", revision: "abc" }], skipped: [], failed: [] }));
    const desktop = { checkUpdate, checkAllUpdates, previewUpdate, previewAllUpdates, update, updateAll } as unknown as DesktopOperations;

    await expect(dispatchRpc({ id: "1", method: "checkUpdate", params: { name: "sample-skill" } }, desktop))
      .resolves.toEqual({ name: "sample-skill", status: "outdated" });
    await expect(dispatchRpc({ id: "2", method: "previewUpdate", params: { name: "sample-skill", ref: "main" } }, desktop))
      .resolves.toEqual({ planned: [{ name: "sample-skill", revision: "abc" }], skipped: [], failed: [] });
    await expect(dispatchRpc({ id: "3", method: "update", params: { name: "sample-skill", ref: "main" } }, desktop))
      .resolves.toEqual({ name: "sample-skill", sourceRevision: "abc" });
    await expect(dispatchRpc({ id: "4", method: "checkAllUpdates", params: {} }, desktop))
      .resolves.toEqual([{ name: "sample-skill", status: "outdated" }]);
    await expect(dispatchRpc({ id: "5", method: "previewAllUpdates", params: { ref: "main" } }, desktop))
      .resolves.toEqual({ planned: [{ name: "sample-skill", revision: "abc" }], skipped: [], failed: [] });
    await expect(dispatchRpc({ id: "6", method: "updateAll", params: { ref: "main" } }, desktop))
      .resolves.toEqual({ updated: [{ name: "sample-skill", revision: "abc" }], skipped: [], failed: [] });

    expect(checkUpdate).toHaveBeenCalledWith("sample-skill");
    expect(checkAllUpdates).toHaveBeenCalledWith();
    expect(previewUpdate).toHaveBeenCalledWith("sample-skill", "main");
    expect(previewAllUpdates).toHaveBeenCalledWith("main");
    expect(update).toHaveBeenCalledWith("sample-skill", "main");
    expect(updateAll).toHaveBeenCalledWith("main");
  });

  it("dispatches source sync operations through the allowlisted facade", async () => {
    const summary = { sources: [], failed: [] };
    const previewSyncAll = vi.fn(() => summary);
    const syncAllSources = vi.fn(() => summary);
    const desktop = { previewSyncAll, syncAllSources } as unknown as DesktopOperations;

    await expect(dispatchRpc({ id: "1", method: "previewSyncAll", params: { prune: true } }, desktop))
      .resolves.toEqual(summary);
    await expect(dispatchRpc({ id: "2", method: "syncAllSources", params: { prune: true, force: true } }, desktop))
      .resolves.toEqual(summary);
    expect(previewSyncAll).toHaveBeenCalledWith({ prune: true });
    expect(syncAllSources).toHaveBeenCalledWith({ prune: true, force: true });
  });

  it("dispatches only the allowlisted operation", async () => {
    const listSkills = vi.fn(() => [{ name: "sample-skill" }]);
    const desktop = { listSkills } as unknown as DesktopOperations;
    const value = await dispatchRpc({ id: "1", method: "listSkills", params: { tag: "owner" } }, desktop);
    expect(value).toEqual([{ name: "sample-skill" }]);
    expect(listSkills).toHaveBeenCalledWith("owner");
  });

  it("dispatches catalog export with overwrite authority granted by the save dialog", async () => {
    const exportCatalog = vi.fn(() => ({ output: "/tmp/catalog.html", skillCount: 1 }));
    const desktop = { exportCatalog } as unknown as DesktopOperations;
    const value = await dispatchRpc({
      id: "1",
      method: "exportCatalog",
      params: { output: "/tmp/catalog.html", language: "en" }
    }, desktop);
    expect(value).toEqual({ output: "/tmp/catalog.html", skillCount: 1 });
    expect(exportCatalog).toHaveBeenCalledWith("/tmp/catalog.html", {
      force: true,
      language: "en"
    });
  });

  it("serializes operations and continues after a failure", async () => {
    const events: string[] = [];
    const dispatch = createSerialDispatcher(async (request) => {
      events.push(`start:${request.id}`);
      await new Promise((resolve) => setTimeout(resolve, request.id === "1" ? 15 : 1));
      events.push(`end:${request.id}`);
      if (request.id === "2") throw new Error("expected");
      return request.id;
    });
    const request = (id: string): RpcRequest => ({ id, method: "getBootstrapState", params: {} });
    const results = await Promise.allSettled([dispatch(request("1")), dispatch(request("2")), dispatch(request("3"))]);
    expect(events).toEqual(["start:1", "end:1", "start:2", "end:2", "start:3", "end:3"]);
    expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected", "fulfilled"]);
  });

  it("accepts only dialog-approved local paths while allowing remote Git URLs", () => {
    const selected = resolve("fixture-skill");
    const approved = new Set([selected]);
    expect(() => authorizeRpcPaths(
      { id: "1", method: "previewInstall", params: { source: selected } },
      approved,
      new Set()
    )).not.toThrow();
    expect(() => authorizeRpcPaths(
      { id: "2", method: "previewInstall", params: { source: "https://github.com/example/skill.git" } },
      approved,
      new Set()
    )).not.toThrow();
    expect(() => authorizeRpcPaths(
      { id: "3", method: "previewLink", params: { source: resolve("unselected-skill") } },
      approved,
      new Set()
    )).toThrow("system dialog");
    expect(() => authorizeRpcPaths(
      { id: "4", method: "initialize", params: { project: resolve("unselected-project") } },
      approved,
      new Set()
    )).toThrow("existing directory");
  });

  it("accepts exports only for the exact path approved by the save dialog", () => {
    const source = resolve("fixture-skill");
    const output = resolve("catalog.html");
    expect(() => authorizeRpcPaths(
      { id: "1", method: "exportCatalog", params: { output, language: "en" } },
      new Set([source]),
      new Set()
    )).toThrow("system save dialog");
    expect(() => authorizeRpcPaths(
      { id: "2", method: "exportCatalog", params: { output, language: "en" } },
      new Set(),
      new Set([output])
    )).not.toThrow();
    expect(() => authorizeRpcPaths(
      { id: "3", method: "exportCatalog", params: { output: resolve("other.html"), language: "en" } },
      new Set(),
      new Set([output])
    )).toThrow("system save dialog");
  });

  it("validates manually entered initialization directories in the main process", () => {
    expect(() => authorizeRpcPaths(
      { id: "1", method: "initialize", params: { project: resolve("."), hub: resolve("typed-hub") } },
      new Set(),
      new Set()
    )).not.toThrow();
    expect(() => authorizeRpcPaths(
      { id: "2", method: "initialize", params: { project: "relative-project" } },
      new Set(),
      new Set()
    )).toThrow("absolute");
  });
});
