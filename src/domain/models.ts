export type Skill = {
  instanceId: string;
  name: string;
  description: string;
  sourceType: "local" | "git";
  sourceLocation: string;
  sourceRef: string | null;
  sourceRevision: string | null;
  installedAt: string;
  updatedAt: string;
};

export type Enablement = {
  id: number;
  skillId: string;
  targetType: "project" | "global";
  targetKey: string;
  targetPath: string;
  entryPath: string;
  linkType: string;
};

export type EnablementInfo = Enablement & {
  health: "healthy" | "missing" | "conflict";
};

export type Diagnostic = {
  code: string;
  severity: "error" | "warning";
  message: string;
};
