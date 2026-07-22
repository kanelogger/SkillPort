import {
  app, BrowserWindow, dialog, ipcMain, net, protocol, utilityProcess,
  type IpcMainInvokeEvent, type UtilityProcess
} from "electron";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, normalize, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { authorizeRpcPaths } from "./path-authority.js";
import { parseRpcRequest, type RpcRequest, type RpcResponse } from "./shared/rpc.js";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

const squirrelStartup = createRequire(import.meta.url)("electron-squirrel-startup") as boolean;
if (squirrelStartup) app.quit();

protocol.registerSchemesAsPrivileged([{
  scheme: "app",
  privileges: { standard: true, secure: true, supportFetchAPI: true }
}]);

const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
const approvedPaths = new Set<string>();
let worker: UtilityProcess | null = null;
let acceptingRequests = true;
let drainingForQuit = false;

function resumeQuitWhenDrained(): void {
  if (drainingForQuit && pending.size === 0) {
    drainingForQuit = false;
    app.quit();
  }
}

function createWorker(): UtilityProcess {
  const child = utilityProcess.fork(join(dirname(fileURLToPath(import.meta.url)), "worker.js"), [], {
    serviceName: "Skill Port Core",
    stdio: "pipe"
  });
  child.on("message", (message: RpcResponse) => {
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.ok) request.resolve(message.data);
    else request.reject(Object.assign(new Error(message.error.message), { code: message.error.code }));
    resumeQuitWhenDrained();
  });
  child.on("exit", () => {
    for (const request of pending.values()) request.reject(new Error("Skill Port worker exited."));
    pending.clear();
    worker = null;
    resumeQuitWhenDrained();
  });
  return child;
}

function invokeWorker(request: RpcRequest): Promise<unknown> {
  if (!acceptingRequests) return Promise.reject(new Error("Skill Port is shutting down."));
  if (pending.has(request.id)) return Promise.reject(new Error("Duplicate RPC request id."));
  worker ??= createWorker();
  return new Promise((resolveRequest, reject) => {
    pending.set(request.id, { resolve: resolveRequest, reject });
    worker!.postMessage(request);
  });
}

function trustedSender(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url ?? "";
  if (url.startsWith("app://skill-port/")) return true;
  return Boolean(MAIN_WINDOW_VITE_DEV_SERVER_URL && url.startsWith(MAIN_WINDOW_VITE_DEV_SERVER_URL));
}

function requireTrusted(event: IpcMainInvokeEvent): void {
  if (!trustedSender(event)) throw new Error("Untrusted renderer.");
}

async function choosePath(event: IpcMainInvokeEvent, kind: "directory" | "registry"): Promise<string | null> {
  requireTrusted(event);
  const result = await dialog.showOpenDialog({
    properties: kind === "directory" ? ["openDirectory"] : ["openFile"],
    filters: kind === "registry" ? [{ name: "Skill Port registry", extensions: ["json"] }] : undefined
  });
  const selected = result.canceled ? null : result.filePaths[0] ?? null;
  if (selected) approvedPaths.add(resolve(selected));
  return selected;
}

function registerIpc(): void {
  ipcMain.handle("skill-port:rpc", (event, value) => {
    requireTrusted(event);
    const request = parseRpcRequest(value);
    authorizeRpcPaths(request, approvedPaths);
    return invokeWorker(request);
  });
  ipcMain.handle("skill-port:select-directory", (event) => choosePath(event, "directory"));
  ipcMain.handle("skill-port:select-registry", (event) => choosePath(event, "registry"));
  ipcMain.handle("skill-port:locale", (event) => {
    requireTrusted(event);
    return app.getLocale();
  });
}

function registerAppProtocol(): void {
  const rendererRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../renderer", MAIN_WINDOW_VITE_NAME);
  protocol.handle("app", (request) => {
    const requestUrl = new URL(request.url);
    const relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "") || "index.html";
    const filePath = resolve(rendererRoot, normalize(relativePath));
    if (filePath !== rendererRoot && !filePath.startsWith(`${rendererRoot}/`)) return new Response("Forbidden", { status: 403 });
    if (!existsSync(filePath)) return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

async function createWindow(): Promise<void> {
  const mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 920,
    minHeight: 620,
    title: "Skill Port",
    icon: join(app.getAppPath(), "assets", "skill-port-icon.png"),
    webPreferences: {
      preload: join(dirname(fileURLToPath(import.meta.url)), "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("app://skill-port/") && !url.startsWith(MAIN_WINDOW_VITE_DEV_SERVER_URL ?? "never://")) event.preventDefault();
  });
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) await mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  else await mainWindow.loadURL("app://skill-port/index.html");
}

app.whenReady().then(async () => {
  registerIpc();
  registerAppProtocol();
  await createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on("before-quit", (event) => {
  acceptingRequests = false;
  if (pending.size > 0) {
    event.preventDefault();
    drainingForQuit = true;
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
