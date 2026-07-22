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
