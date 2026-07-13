import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Enablement, Skill } from "../domain/models.js";
import type { HubPaths } from "./config.js";

type Row = Record<string, unknown>;

export type InterruptedOperation = {
  id: string;
  kind: string;
  payload: unknown;
};

export class StateStore {
  readonly db: DatabaseSync;
  readonly readOnly: boolean;
  private readonly readOnlySnapshot: string | null;

  constructor(paths: HubPaths, options: { readOnly?: boolean } = {}) {
    this.readOnly = options.readOnly === true;
    this.readOnlySnapshot = this.readOnly ? snapshotDatabase(paths.database) : null;
    this.db = new DatabaseSync(this.readOnlySnapshot ? join(this.readOnlySnapshot, "state.db") : paths.database, {
      timeout: 5_000,
      readOnly: this.readOnly
    });
    if (this.readOnly) {
      this.db.prepare("SELECT name FROM sqlite_schema LIMIT 1").get();
    } else {
      this.db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
      this.migrate();
    }
  }

  close(): void {
    this.db.close();
    if (this.readOnlySnapshot) rmSync(this.readOnlySnapshot, { recursive: true, force: true });
  }

  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);
    const current = this.db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get() as Row;
    let version = Number(current.version ?? 0);
    if (version < 1) {
      this.transaction(() => {
        this.db.exec(`
          CREATE TABLE skills (
            instance_id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE COLLATE NOCASE,
            description TEXT NOT NULL,
            source_type TEXT NOT NULL CHECK(source_type IN ('local','git')),
            source_location TEXT NOT NULL,
            source_ref TEXT,
            source_revision TEXT,
            installed_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          CREATE TABLE projects (
            path TEXT PRIMARY KEY,
            created_at TEXT NOT NULL
          );
          CREATE TABLE enablements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            skill_id TEXT NOT NULL REFERENCES skills(instance_id) ON DELETE RESTRICT,
            target_type TEXT NOT NULL CHECK(target_type IN ('project','global')),
            target_key TEXT NOT NULL,
            target_path TEXT NOT NULL,
            entry_path TEXT NOT NULL UNIQUE,
            link_type TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(skill_id, target_type, target_key)
          );
          CREATE TABLE operations (
            id TEXT PRIMARY KEY,
            kind TEXT NOT NULL,
            status TEXT NOT NULL,
            payload_json TEXT,
            created_at TEXT NOT NULL,
            finished_at TEXT
          );
        `);
        this.db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES(2, ?)").run(now());
      });
      version = 2;
    }
    if (version < 2) {
      this.transaction(() => {
        this.db.exec("ALTER TABLE operations ADD COLUMN payload_json TEXT");
        this.db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES(2, ?)").run(now());
      });
    }
    if (version < 3 && this.hasTable("skills")) {
      this.transaction(() => {
        this.db.exec("ALTER TABLE skills ADD COLUMN source_tracking TEXT");
        this.db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES(3, ?)").run(now());
      });
    }
  }

  private hasTable(name: string): boolean {
    return this.db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(name) !== undefined;
  }

  addProject(path: string): void {
    this.db.prepare("INSERT OR IGNORE INTO projects(path, created_at) VALUES(?, ?)").run(path, now());
  }

  projects(): string[] {
    return (this.db.prepare("SELECT path FROM projects ORDER BY length(path) DESC").all() as Row[])
      .map((row) => String(row.path));
  }

  skills(): Skill[] {
    return (this.db.prepare("SELECT * FROM skills ORDER BY name COLLATE NOCASE").all() as Row[]).map(toSkill);
  }

  skill(name: string): Skill | null {
    const row = this.db.prepare("SELECT * FROM skills WHERE name = ? COLLATE NOCASE").get(name) as Row | undefined;
    return row ? toSkill(row) : null;
  }

  insertSkill(skill: Skill): void {
    this.db.prepare(`
      INSERT INTO skills(instance_id,name,description,source_type,source_location,source_ref,source_revision,source_tracking,installed_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)
    `).run(skill.instanceId, skill.name, skill.description, skill.sourceType, skill.sourceLocation,
      skill.sourceRef, skill.sourceRevision, skill.sourceTracking, skill.installedAt, skill.updatedAt);
  }

  updateSkill(skill: Skill): void {
    this.db.prepare(`
      UPDATE skills SET description=?,source_location=?,source_ref=?,source_revision=?,source_tracking=?,updated_at=?
      WHERE instance_id=?
    `).run(skill.description, skill.sourceLocation, skill.sourceRef, skill.sourceRevision, skill.sourceTracking, skill.updatedAt, skill.instanceId);
  }

  deleteSkill(id: string): void {
    this.db.prepare("DELETE FROM skills WHERE instance_id=?").run(id);
  }

  enablements(skillId?: string): Enablement[] {
    const rows = skillId
      ? this.db.prepare("SELECT * FROM enablements WHERE skill_id=? ORDER BY target_type,target_key").all(skillId)
      : this.db.prepare("SELECT * FROM enablements ORDER BY target_type,target_key").all();
    return (rows as Row[]).map(toEnablement);
  }

  enablementByEntry(entryPath: string): Enablement | null {
    const row = this.db.prepare("SELECT * FROM enablements WHERE entry_path=?").get(entryPath) as Row | undefined;
    return row ? toEnablement(row) : null;
  }

  insertEnablement(value: Omit<Enablement, "id">): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO enablements(skill_id,target_type,target_key,target_path,entry_path,link_type,created_at)
      VALUES(?,?,?,?,?,?,?)
    `).run(value.skillId, value.targetType, value.targetKey, value.targetPath, value.entryPath, value.linkType, now());
  }

  deleteEnablement(id: number): void {
    this.db.prepare("DELETE FROM enablements WHERE id=?").run(id);
  }

  updateEnablementLinkType(id: number, linkType: string): void {
    this.db.prepare("UPDATE enablements SET link_type=? WHERE id=?").run(linkType, id);
  }

  startOperation(id: string, kind: string, payload: unknown): void {
    this.db.prepare("INSERT INTO operations(id,kind,status,payload_json,created_at) VALUES(?,?,?,?,?)")
      .run(id, kind, "started", JSON.stringify(payload), now());
  }

  updateOperationPayload(id: string, payload: unknown): void {
    this.db.prepare("UPDATE operations SET payload_json=? WHERE id=?").run(JSON.stringify(payload), id);
  }

  finishOperation(id: string, status: "completed" | "failed"): void {
    this.db.prepare("UPDATE operations SET status=?,finished_at=? WHERE id=?").run(status, now(), id);
  }

  interruptedOperations(): InterruptedOperation[] {
    const hasPayload = (this.db.prepare("PRAGMA table_info(operations)").all() as Row[])
      .some((row) => row.name === "payload_json");
    const payloadColumn = hasPayload ? "payload_json" : "NULL AS payload_json";
    return (this.db.prepare(`
      SELECT id,kind,${payloadColumn} FROM operations WHERE status='started' ORDER BY created_at,id
    `).all() as Row[])
      .map((row) => ({
        id: String(row.id),
        kind: String(row.kind),
        payload: parsePayload(row.payload_json)
      }));
  }
}

function snapshotDatabase(database: string): string {
  const snapshot = mkdtempSync(join(tmpdir(), "sklp-readonly-"));
  copyFileSync(database, join(snapshot, "state.db"));
  for (const suffix of ["-wal", "-shm"]) {
    const source = `${database}${suffix}`;
    if (existsSync(source)) copyFileSync(source, join(snapshot, `state.db${suffix}`));
  }
  return snapshot;
}

function now(): string {
  return new Date().toISOString();
}

function toSkill(row: Row): Skill {
  return {
    instanceId: String(row.instance_id),
    name: String(row.name),
    description: String(row.description),
    sourceType: row.source_type as Skill["sourceType"],
    sourceLocation: String(row.source_location),
    sourceRef: row.source_ref == null ? null : String(row.source_ref),
    sourceRevision: row.source_revision == null ? null : String(row.source_revision),
    sourceTracking: row.source_tracking == null ? null : row.source_tracking as Skill["sourceTracking"],
    installedAt: String(row.installed_at),
    updatedAt: String(row.updated_at)
  };
}

function toEnablement(row: Row): Enablement {
  return {
    id: Number(row.id),
    skillId: String(row.skill_id),
    targetType: row.target_type as Enablement["targetType"],
    targetKey: String(row.target_key),
    targetPath: String(row.target_path),
    entryPath: String(row.entry_path),
    linkType: String(row.link_type)
  };
}

function parsePayload(value: unknown): unknown {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
