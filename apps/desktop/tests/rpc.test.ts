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
    expect(() => parseRpcRequest({ id: "9", method: "updateAll", params: { unexpected: true } })).toThrow();
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
    await expect(dispatchRpc({ id: "2", method: "previewUpdate", params: { name: "sample-skill" } }, desktop))
      .resolves.toEqual({ planned: [{ name: "sample-skill", revision: "abc" }], skipped: [], failed: [] });
    await expect(dispatchRpc({ id: "3", method: "update", params: { name: "sample-skill" } }, desktop))
      .resolves.toEqual({ name: "sample-skill", sourceRevision: "abc" });
    await expect(dispatchRpc({ id: "4", method: "checkAllUpdates", params: {} }, desktop))
      .resolves.toEqual([{ name: "sample-skill", status: "outdated" }]);
    await expect(dispatchRpc({ id: "5", method: "previewAllUpdates", params: {} }, desktop))
      .resolves.toEqual({ planned: [{ name: "sample-skill", revision: "abc" }], skipped: [], failed: [] });
    await expect(dispatchRpc({ id: "6", method: "updateAll", params: {} }, desktop))
      .resolves.toEqual({ updated: [{ name: "sample-skill", revision: "abc" }], skipped: [], failed: [] });

    expect(checkUpdate).toHaveBeenCalledWith("sample-skill");
    expect(checkAllUpdates).toHaveBeenCalledWith();
    expect(previewUpdate).toHaveBeenCalledWith("sample-skill");
    expect(previewAllUpdates).toHaveBeenCalledWith();
    expect(update).toHaveBeenCalledWith("sample-skill");
    expect(updateAll).toHaveBeenCalledWith();
  });

  it("dispatches only the allowlisted operation", async () => {
    const listSkills = vi.fn(() => [{ name: "sample-skill" }]);
    const desktop = { listSkills } as unknown as DesktopOperations;
    const value = await dispatchRpc({ id: "1", method: "listSkills", params: { tag: "owner" } }, desktop);
    expect(value).toEqual([{ name: "sample-skill" }]);
    expect(listSkills).toHaveBeenCalledWith("owner");
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
      approved
    )).not.toThrow();
    expect(() => authorizeRpcPaths(
      { id: "2", method: "previewInstall", params: { source: "https://github.com/example/skill.git" } },
      approved
    )).not.toThrow();
    expect(() => authorizeRpcPaths(
      { id: "3", method: "previewLink", params: { source: resolve("unselected-skill") } },
      approved
    )).toThrow("system dialog");
    expect(() => authorizeRpcPaths(
      { id: "4", method: "initialize", params: { project: resolve("unselected-project") } },
      approved
    )).toThrow("existing directory");
  });

  it("validates manually entered initialization directories in the main process", () => {
    expect(() => authorizeRpcPaths(
      { id: "1", method: "initialize", params: { project: resolve("."), hub: resolve("typed-hub") } },
      new Set()
    )).not.toThrow();
    expect(() => authorizeRpcPaths(
      { id: "2", method: "initialize", params: { project: "relative-project" } },
      new Set()
    )).toThrow("absolute");
  });
});
