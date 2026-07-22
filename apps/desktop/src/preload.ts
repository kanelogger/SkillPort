import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge, DesktopRpcApi, RpcMethod, RpcRequest } from "./shared/rpc.js";

function invoke<K extends RpcMethod>(
  method: K,
  ...args: Parameters<DesktopRpcApi[K]>
): ReturnType<DesktopRpcApi[K]> {
  const request: RpcRequest = { id: crypto.randomUUID(), method, params: args[0] ?? {} };
  return ipcRenderer.invoke("skill-port:rpc", request) as ReturnType<DesktopRpcApi[K]>;
}

const bridge: DesktopBridge = {
  getBootstrapState: () => invoke("getBootstrapState"),
  initialize: (input) => invoke("initialize", input),
  listSkills: (input = {}) => invoke("listSkills", input),
  getSkill: (input) => invoke("getSkill", input),
  listProjects: () => invoke("listProjects"),
  registerProject: (input) => invoke("registerProject", input),
  previewInstall: (input) => invoke("previewInstall", input),
  install: (input) => invoke("install", input),
  previewLink: (input) => invoke("previewLink", input),
  link: (input) => invoke("link", input),
  updateTags: (input) => invoke("updateTags", input),
  enable: (input) => invoke("enable", input),
  disable: (input) => invoke("disable", input),
  doctor: () => invoke("doctor"),
  remove: (input) => invoke("remove", input),
  unlink: (input) => invoke("unlink", input),
  selectDirectory: () => ipcRenderer.invoke("skill-port:select-directory"),
  selectRegistry: () => ipcRenderer.invoke("skill-port:select-registry"),
  locale: () => ipcRenderer.invoke("skill-port:locale")
};

contextBridge.exposeInMainWorld("skillPort", bridge);
