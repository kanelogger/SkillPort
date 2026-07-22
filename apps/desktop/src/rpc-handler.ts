import { DesktopSkillPort } from "skill-port-cli/desktop";
import type { RpcRequest } from "./shared/rpc.js";

export type DesktopOperations = Pick<DesktopSkillPort,
  "getBootstrapState" | "initialize" | "listSkills" | "getSkill" | "listProjects" | "registerProject"
  | "previewInstall" | "install" | "previewLink" | "link" | "enable" | "disable" | "doctor" | "remove" | "unlink"
  | "updateTags"
>;

export async function dispatchRpc(request: RpcRequest, desktop: DesktopOperations = new DesktopSkillPort()): Promise<unknown> {
  const params = request.params as any;
  switch (request.method) {
    case "getBootstrapState": return desktop.getBootstrapState();
    case "initialize": return desktop.initialize(params);
    case "listSkills": return desktop.listSkills(params.tag);
    case "getSkill": return desktop.getSkill(params.name);
    case "listProjects": return desktop.listProjects();
    case "registerProject": return desktop.registerProject(params.path);
    case "previewInstall": return desktop.previewInstall(params.source, params.options);
    case "install": return desktop.install(params.source, params.options);
    case "previewLink": return desktop.previewLink(params.source);
    case "link": return desktop.link(params.source);
    case "updateTags": return desktop.updateTags(params.name, params.tags);
    case "enable": return desktop.enable(params.name, params.target);
    case "disable": return desktop.disable(params.name, params.target);
    case "doctor": return desktop.doctor();
    case "remove": return desktop.remove(params.name, params.force);
    case "unlink": return desktop.unlink(params.name, params.force);
  }
}

export function createSerialDispatcher(
  handler: (request: RpcRequest) => Promise<unknown> = (request) => dispatchRpc(request)
): (request: RpcRequest) => Promise<unknown> {
  let queue = Promise.resolve<unknown>(undefined);
  return (request) => {
    const result = queue.then(() => handler(request));
    queue = result.catch(() => undefined);
    return result;
  };
}
