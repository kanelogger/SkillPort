import { z } from "zod";
import type {
  DesktopBootstrapState,
  DesktopError,
  DesktopInstallOptions,
  DesktopSkillDetails,
  DesktopSkillSummary,
  DesktopTarget,
  BatchUpdateSummary,
  Diagnostic,
  Enablement,
  FleetUpdateCheck,
  UpdateCheck,
  UpdateSummary
} from "skill-port-cli/desktop";

export type InstallPreview = {
  skills: Array<{ name: string; description: string }>;
  skipped: Array<{ name: string; description: string; reason: string }>;
  failed: Array<{ name?: string; description?: string; path: string; reason: string }>;
};

export type DesktopRpcApi = {
  getBootstrapState(): Promise<DesktopBootstrapState>;
  initialize(input: { project: string; hub?: string }): Promise<DesktopBootstrapState>;
  listSkills(input?: { tag?: string }): Promise<DesktopSkillSummary[]>;
  getSkill(input: { name: string }): Promise<DesktopSkillDetails>;
  listProjects(): Promise<string[]>;
  registerProject(input: { path: string }): Promise<string>;
  previewInstall(input: { source: string; options?: DesktopInstallOptions }): Promise<InstallPreview>;
  install(input: { source: string; options?: DesktopInstallOptions }): Promise<DesktopSkillDetails[]>;
  previewLink(input: { source: string }): Promise<{ name: string; description: string }>;
  link(input: { source: string }): Promise<DesktopSkillDetails>;
  updateTags(input: { name: string; tags: string[] }): Promise<DesktopSkillDetails>;
  checkUpdate(input: { name: string }): Promise<UpdateCheck>;
  checkAllUpdates(): Promise<FleetUpdateCheck[]>;
  previewUpdate(input: { name: string }): Promise<UpdateSummary>;
  previewAllUpdates(): Promise<UpdateSummary>;
  update(input: { name: string }): Promise<DesktopSkillDetails>;
  updateAll(): Promise<BatchUpdateSummary>;
  enable(input: { name: string; target: DesktopTarget }): Promise<Enablement>;
  disable(input: { name: string; target: DesktopTarget }): Promise<void>;
  doctor(): Promise<Diagnostic[]>;
  remove(input: { name: string; force?: boolean }): Promise<void>;
  unlink(input: { name: string; force?: boolean }): Promise<void>;
};

export type DesktopBridge = DesktopRpcApi & {
  selectDirectory(): Promise<string | null>;
  selectRegistry(): Promise<string | null>;
  locale(): Promise<string>;
};

export type RpcMethod = keyof DesktopRpcApi;
export type RpcRequest = { id: string; method: RpcMethod; params: unknown };
export type RpcResponse =
  | { id: string; ok: true; data: unknown }
  | { id: string; ok: false; error: DesktopError };

const targetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("global") }).strict(),
  z.object({ type: z.literal("project"), path: z.string().min(1).optional() }).strict()
]);
const optionsSchema = z.object({
  ref: z.string().min(1).optional(),
  gitPath: z.string().min(1).optional(),
  skipExisting: z.boolean().optional()
}).strict();

const parameterSchemas: Record<RpcMethod, z.ZodType> = {
  getBootstrapState: z.object({}).strict(),
  initialize: z.object({ project: z.string().min(1), hub: z.string().min(1).optional() }).strict(),
  listSkills: z.object({ tag: z.string().optional() }).strict(),
  getSkill: z.object({ name: z.string().min(1) }).strict(),
  listProjects: z.object({}).strict(),
  registerProject: z.object({ path: z.string().min(1) }).strict(),
  previewInstall: z.object({ source: z.string().min(1), options: optionsSchema.optional() }).strict(),
  install: z.object({ source: z.string().min(1), options: optionsSchema.optional() }).strict(),
  previewLink: z.object({ source: z.string().min(1) }).strict(),
  link: z.object({ source: z.string().min(1) }).strict(),
  updateTags: z.object({
    name: z.string().min(1),
    tags: z.array(z.string().trim().min(1).max(64)).max(32)
  }).strict(),
  checkUpdate: z.object({ name: z.string().min(1) }).strict(),
  checkAllUpdates: z.object({}).strict(),
  previewUpdate: z.object({ name: z.string().min(1) }).strict(),
  previewAllUpdates: z.object({}).strict(),
  update: z.object({ name: z.string().min(1) }).strict(),
  updateAll: z.object({}).strict(),
  enable: z.object({ name: z.string().min(1), target: targetSchema }).strict(),
  disable: z.object({ name: z.string().min(1), target: targetSchema }).strict(),
  doctor: z.object({}).strict(),
  remove: z.object({ name: z.string().min(1), force: z.boolean().optional() }).strict(),
  unlink: z.object({ name: z.string().min(1), force: z.boolean().optional() }).strict()
};

const requestSchema = z.object({
  id: z.string().min(1),
  method: z.enum(Object.keys(parameterSchemas) as [RpcMethod, ...RpcMethod[]]),
  params: z.unknown()
}).strict();

export function parseRpcRequest(value: unknown): RpcRequest {
  const request = requestSchema.parse(value);
  return { ...request, params: parameterSchemas[request.method].parse(request.params) };
}
