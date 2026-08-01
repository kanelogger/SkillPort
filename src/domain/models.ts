export type GitSourceTracking = "default-branch" | "branch" | "tag" | "commit";

export type Skill = {
  instanceId: string;
  name: string;
  description: string;
  sourceType: "local" | "git";
  sourceLocation: string;
  sourceRef: string | null;
  sourceRevision: string | null;
  sourceTracking: GitSourceTracking | null;
  tags: string[];
  installedAt: string;
  updatedAt: string;
};

export type SourceCollection = {
  id: string;
  key: string;
  location: string;
  ref: string | null;
  tracking: GitSourceTracking | null;
  scanPath: string;
  lastRevision: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SourceMembershipStatus = "active" | "missing";

export type SourceMembership = {
  sourceId: string;
  skillId: string;
  skillPath: string;
  status: SourceMembershipStatus;
  lastSeenRevision: string | null;
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
  suggestion: string;
};
