import { useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  DesktopBootstrapState,
  DesktopInstallationKind,
  DesktopSkillDetails,
  DesktopSkillSummary,
  DesktopTarget,
  BatchUpdateSummary,
  Diagnostic,
  Enablement,
  FleetUpdateCheck,
  UpdateSummary
} from "skill-port-cli/desktop";
import type { InstallPreview } from "../shared/rpc.js";
import skillPortIcon from "../../assets/skill-port-icon.png";
import { languageForLocale, translate, type Language } from "./i18n.js";

type View = "skills" | "projects" | "health";
type AddMode = "local" | "git" | "registry" | "link";

export function App() {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem("skill-port-language");
    return saved === "zh-CN" || saved === "en" ? saved : "en";
  });
  const [bootstrap, setBootstrap] = useState<DesktopBootstrapState | null>(null);
  const [skills, setSkills] = useState<DesktopSkillSummary[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [selected, setSelected] = useState<DesktopSkillDetails | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [view, setView] = useState<View>("skills");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [enableOpen, setEnableOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [updateDialog, setUpdateDialog] = useState<{ name?: string; checks: FleetUpdateCheck[] } | null>(null);
  const t = (key: string) => translate(language, key);

  async function run<T>(operation: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    try {
      return await operation();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function refresh(selectName?: string) {
    const state = await window.skillPort.getBootstrapState();
    setBootstrap(state);
    if (!state.initialized) return;
    const [nextSkills, nextProjects] = await Promise.all([
      window.skillPort.listSkills(),
      window.skillPort.listProjects()
    ]);
    setSkills(nextSkills);
    setProjects(nextProjects);
    const name = selectName ?? selected?.name;
    if (name && nextSkills.some((skill) => skill.name === name)) setSelected(await window.skillPort.getSkill({ name }));
    else setSelected(null);
  }

  async function checkUpdates(name?: string) {
    const checks = await run(async () => name
      ? [await window.skillPort.checkUpdate({ name })]
      : await window.skillPort.checkAllUpdates());
    if (checks) setUpdateDialog({ name, checks });
  }

  useEffect(() => {
    void (async () => {
      if (!localStorage.getItem("skill-port-language")) {
        const detected = languageForLocale(await window.skillPort.locale());
        setLanguage(detected);
      }
      await run(() => refresh());
    })();
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    localStorage.setItem("skill-port-language", language);
  }, [language]);

  useEffect(() => {
    if (view === "health" && bootstrap?.initialized) void run(async () => setDiagnostics(await window.skillPort.doctor()));
  }, [view, bootstrap?.initialized]);

  async function selectSkill(name: string) {
    const details = await run(() => window.skillPort.getSkill({ name }));
    if (details) setSelected(details);
  }

  if (!bootstrap) return <div className="boot-screen"><span className="spinner" />{t("busy")}</div>;
  if (!bootstrap.initialized) {
    return <Setup language={language} setLanguage={setLanguage} t={t} busy={busy} error={error} onRun={run} onReady={refresh} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><img className="brand-mark" src={skillPortIcon} alt="" /><span>{t("appName")}</span></div>
        <nav aria-label="Primary">
          <NavButton active={view === "skills"} onClick={() => setView("skills")} icon="◆">{t("skills")}</NavButton>
          <NavButton active={view === "projects"} onClick={() => setView("projects")} icon="▣">{t("projects")}</NavButton>
          <NavButton active={view === "health"} onClick={() => setView("health")} icon="◎">{t("health")}</NavButton>
        </nav>
        <div className="sidebar-foot">
          <span>{t("hub")}</span>
          <code title={bootstrap.hubPath}>{bootstrap.hubPath}</code>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div><h1>{t(view)}</h1><p>{skills.length} Skills · {projects.length} Projects</p></div>
          <div className="top-actions">
            {busy && <span className="busy-label"><span className="spinner" />{t("busy")}</span>}
            <button className="button ghost" onClick={() => setLanguage(language === "en" ? "zh-CN" : "en")}>{t("language")}</button>
            {view === "skills" && <><button className="button ghost" onClick={() => void checkUpdates()}>↻ {t("checkUpdates")}</button><button className="button primary" onClick={() => setAddOpen(true)}>＋ {t("addSkill")}</button></>}
          </div>
        </header>
        {error && <div className="error-banner" role="alert"><strong>{t("operationFailed")}</strong><span>{error}</span><button onClick={() => setError(null)} aria-label={t("close")}>×</button></div>}

        {view === "skills" && (
          <SkillsView
            skills={skills}
            selected={selected}
            t={t}
            onSelect={selectSkill}
            onEnable={() => setEnableOpen(true)}
            onEditTags={() => setTagsOpen(true)}
            onCheckUpdate={() => void checkUpdates(selected!.name)}
            onDisable={async (enablement) => {
              const target: DesktopTarget = enablement.targetType === "global"
                ? { type: "global" }
                : { type: "project", path: enablement.targetKey };
              await run(async () => {
                await window.skillPort.disable({ name: selected!.name, target });
                await refresh(selected!.name);
              });
            }}
            onRemove={() => setRemoveOpen(true)}
          />
        )}
        {view === "projects" && <ProjectsView projects={projects} t={t} onAdd={async () => {
          const path = await window.skillPort.selectDirectory();
          if (!path) return;
          await run(async () => {
            await window.skillPort.registerProject({ path });
            await refresh();
          });
        }} />}
        {view === "health" && <HealthView diagnostics={diagnostics} t={t} onRefresh={() => run(async () => setDiagnostics(await window.skillPort.doctor()))} />}
      </main>

      {addOpen && <AddSkillModal t={t} busy={busy} onClose={() => setAddOpen(false)} onRun={run} onComplete={async (name) => {
        setAddOpen(false);
        await refresh(name);
      }} />}
      {enableOpen && selected && <EnableModal skill={selected} projects={projects} t={t} busy={busy} onClose={() => setEnableOpen(false)} onConfirm={async (target) => {
        await run(async () => {
          await window.skillPort.enable({ name: selected.name, target });
          await refresh(selected.name);
          setEnableOpen(false);
        });
      }} />}
      {tagsOpen && selected && <TagsModal skill={selected} t={t} busy={busy} onClose={() => setTagsOpen(false)} onConfirm={async (tags) => {
        await run(async () => {
          await window.skillPort.updateTags({ name: selected.name, tags });
          await refresh(selected.name);
          setTagsOpen(false);
        });
      }} />}
      {removeOpen && selected && <RemoveModal skill={selected} t={t} busy={busy} onClose={() => setRemoveOpen(false)} onConfirm={async (force) => {
        await run(async () => {
          if (selected.installationKind === "linked") await window.skillPort.unlink({ name: selected.name, force });
          else await window.skillPort.remove({ name: selected.name, force });
          setRemoveOpen(false);
          await refresh();
        });
      }} />}
      {updateDialog && <UpdateModal
        scopeName={updateDialog.name}
        checks={updateDialog.checks}
        t={t}
        busy={busy}
        onClose={() => setUpdateDialog(null)}
        onPreview={() => run(() => updateDialog.name
          ? window.skillPort.previewUpdate({ name: updateDialog.name })
          : window.skillPort.previewAllUpdates())}
        onConfirm={async () => {
          const result = await run(async (): Promise<BatchUpdateSummary> => {
            if (!updateDialog.name) return window.skillPort.updateAll();
            const updated = await window.skillPort.update({ name: updateDialog.name });
            return {
              updated: [{ name: updated.name, revision: updated.sourceRevision ?? "unknown" }],
              skipped: [],
              failed: []
            };
          });
          if (result) await refresh(updateDialog.name);
          return result;
        }}
      />}
    </div>
  );
}

function Setup({ language, setLanguage, t, busy, error, onRun, onReady }: {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string) => string;
  busy: boolean;
  error: string | null;
  onRun: <T>(operation: () => Promise<T>) => Promise<T | undefined>;
  onReady: () => Promise<void>;
}) {
  const [project, setProject] = useState("");
  const [hub, setHub] = useState("");
  async function choose(setter: (value: string) => void) {
    const value = await window.skillPort.selectDirectory();
    if (value) setter(value);
  }
  return (
    <main className="setup-screen">
      <button className="button ghost language-button" onClick={() => setLanguage(language === "en" ? "zh-CN" : "en")}>{t("language")}</button>
      <section className="setup-card">
        <img className="setup-mark" src={skillPortIcon} alt="" />
        <h1>{t("setupTitle")}</h1>
        <p>{t("setupDescription")}</p>
        {error && <div className="error-banner" role="alert">{error}</div>}
        <PathField label={t("projectDirectory")} value={project} onChange={setProject} onChoose={() => choose(setProject)} t={t} />
        <PathField label={t("customHub")} value={hub} onChange={setHub} onChoose={() => choose(setHub)} t={t} />
        <button className="button primary block" disabled={busy || !project} onClick={() => onRun(async () => {
          await window.skillPort.initialize({ project, hub: hub || undefined });
          await onReady();
        })}>{busy ? t("busy") : t("initialize")}</button>
      </section>
    </main>
  );
}

function SkillsView({ skills, selected, t, onSelect, onEnable, onEditTags, onCheckUpdate, onDisable, onRemove }: {
  skills: DesktopSkillSummary[];
  selected: DesktopSkillDetails | null;
  t: (key: string) => string;
  onSelect: (name: string) => void;
  onEnable: () => void;
  onEditTags: () => void;
  onCheckUpdate: () => void;
  onDisable: (enablement: Enablement) => void;
  onRemove: () => void;
}) {
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const [kind, setKind] = useState("");
  const [health, setHealth] = useState("");
  const tags = useMemo(() => [...new Set(skills.flatMap((skill) => skill.tags))].sort(), [skills]);
  const filtered = skills.filter((skill) =>
    (!search || `${skill.name} ${skill.description}`.toLowerCase().includes(search.toLowerCase()))
    && (!tag || skill.tags.includes(tag))
    && (!kind || skill.installationKind === kind)
    && (!health || skill.health === health));
  return (
    <div className="skills-layout">
      <section className="skill-list-panel">
        <div className="filters">
          <input aria-label={t("search")} placeholder={t("search")} value={search} onChange={(event) => setSearch(event.target.value)} />
          <select aria-label={t("tag")} value={tag} onChange={(event) => setTag(event.target.value)}><option value="">{t("allTags")}</option>{tags.map((item) => <option key={item}>{item}</option>)}</select>
          <select aria-label={t("installType")} value={kind} onChange={(event) => setKind(event.target.value)}><option value="">{t("allKinds")}</option><option value="git-copy">{t("gitCopy")}</option><option value="local-copy">{t("localCopy")}</option><option value="linked">{t("linked")}</option></select>
          <select aria-label={t("status")} value={health} onChange={(event) => setHealth(event.target.value)}><option value="">{t("allHealth")}</option><option value="healthy">healthy</option><option value="missing">missing</option><option value="conflict">conflict</option><option value="not-enabled">{t("notEnabled")}</option></select>
        </div>
        <div className="skill-list">
          {filtered.length === 0 && <Empty text={t("emptySkills")} />}
          {filtered.map((skill) => <button key={skill.instanceId} className={`skill-row ${selected?.instanceId === skill.instanceId ? "selected" : ""}`} onClick={() => onSelect(skill.name)}>
            <span className="skill-icon">{skill.name.slice(0, 2).toUpperCase()}</span>
            <span><strong>{skill.name}</strong><small>{skill.description}</small></span>
            <Status value={skill.health} />
          </button>)}
        </div>
      </section>
      <section className="detail-panel">
        {!selected ? <Empty text={t("selectSkill")} /> : <>
          <div className="detail-heading"><div><span className="eyebrow">{kindLabel(selected.installationKind, t)}</span><h2>{selected.name}</h2><p title={selected.description}>{selected.description}</p></div><Status value={selected.health} /></div>
          <dl className="facts"><div><dt>{t("source")}</dt><dd title={selected.sourceLocation}>{selected.sourceLocation}</dd></div><div><dt>{t("revision")}</dt><dd>{selected.sourceRevision ?? selected.sourceRef ?? "—"}</dd></div><div><dt>{t("installed")}</dt><dd>{new Date(selected.installedAt).toLocaleString()}</dd></div></dl>
          {selected.installationKind === "git-copy" && <div className="detail-actions"><button className="button" onClick={onCheckUpdate}>↻ {t("checkUpdate")}</button></div>}
          <div className="tag-section">
            <div className="section-title compact"><h3>{t("tags")}</h3><button className="button ghost small" onClick={onEditTags}>{t("editTags")}</button></div>
            {selected.tags.length > 0
              ? <div className="tag-row">{selected.tags.map((item) => <span className="tag" key={item}>{item}</span>)}</div>
              : <p className="muted tag-empty">{t("noTags")}</p>}
          </div>
          <div className="section-title"><h3>{t("enablements")}</h3><button className="button small" onClick={onEnable}>＋ {t("enable")}</button></div>
          <div className="enablement-list">
            {selected.enablements.length === 0 && <p className="muted">{t("notEnabled")}</p>}
            {selected.enablements.map((item) => <div className="enablement" key={item.id}><div><strong>{item.targetType === "global" ? t("globalTarget") : item.targetKey}</strong><small>{item.entryPath}</small></div><Status value={item.health} /><button className="button ghost small" onClick={() => onDisable(item)}>{t("disable")}</button></div>)}
          </div>
          <div className="danger-zone"><button className="button danger" onClick={onRemove}>{selected.installationKind === "linked" ? t("unlink") : t("remove")}</button></div>
        </>}
      </section>
    </div>
  );
}

function ProjectsView({ projects, t, onAdd }: { projects: string[]; t: (key: string) => string; onAdd: () => void }) {
  return <section className="content-card"><div className="section-title"><div><h2>{t("projects")}</h2><p className="muted">{projects.length} registered</p></div><button className="button primary" onClick={onAdd}>＋ {t("addProject")}</button></div><div className="project-list">{projects.length === 0 ? <Empty text={t("noProjects")} /> : projects.map((project) => <div className="project-row" key={project}><span className="project-icon">▣</span><code>{project}</code></div>)}</div></section>;
}

function HealthView({ diagnostics, t, onRefresh }: { diagnostics: Diagnostic[]; t: (key: string) => string; onRefresh: () => void }) {
  return <section className="content-card"><div className="section-title"><div><h2>{t("diagnostics")}</h2><p className="muted">{diagnostics.length === 0 ? t("healthy") : `${diagnostics.length} items`}</p></div><button className="button" onClick={onRefresh}>↻ {t("refresh")}</button></div>{diagnostics.length === 0 ? <div className="healthy-panel"><span>✓</span><strong>{t("healthy")}</strong></div> : <div className="diagnostic-list">{diagnostics.map((item, index) => <article className={`diagnostic ${item.severity}`} key={`${item.code}-${index}`}><div><Status value={item.severity} /><code>{item.code}</code></div><p>{item.message}</p><small><strong>{t("suggestion")}:</strong> {item.suggestion}</small></article>)}</div>}</section>;
}

function AddSkillModal({ t, busy, onClose, onRun, onComplete }: {
  t: (key: string) => string;
  busy: boolean;
  onClose: () => void;
  onRun: <T>(operation: () => Promise<T>) => Promise<T | undefined>;
  onComplete: (name?: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<AddMode>("local");
  const [source, setSource] = useState("");
  const [ref, setRef] = useState("");
  const [gitPath, setGitPath] = useState("");
  const [preview, setPreview] = useState<InstallPreview | { name: string; description: string } | null>(null);
  function changeMode(next: AddMode) { setMode(next); setSource(""); setPreview(null); }
  async function chooseSource() {
    const value = mode === "registry" ? await window.skillPort.selectRegistry() : await window.skillPort.selectDirectory();
    if (value) { setSource(value); setPreview(null); }
  }
  async function doPreview() {
    if (mode === "link") {
      const value = await onRun(() => window.skillPort.previewLink({ source }));
      if (value) setPreview(value);
      return;
    }
    const value = await onRun(() => window.skillPort.previewInstall({
      source,
      options: { ref: ref || undefined, gitPath: gitPath || undefined }
    }));
    if (value) setPreview(value);
  }
  async function confirm() {
    if (mode === "link") {
      const value = await onRun(() => window.skillPort.link({ source }));
      if (value) await onComplete(value.name);
    } else {
      const value = await onRun(() => window.skillPort.install({ source, options: { ref: ref || undefined, gitPath: gitPath || undefined } }));
      if (value) await onComplete(value[0]?.name);
    }
  }
  const installPreview = preview && "skills" in preview ? preview : null;
  const linkPreview = preview && !("skills" in preview) ? preview : null;
  const canConfirm = preview && (mode === "link" || Boolean(installPreview?.skills.length));
  return <Modal title={t("addSkill")} onClose={onClose}>
    <div className="tabs" role="tablist">{(["local", "git", "registry", "link"] as AddMode[]).map((item) => <button role="tab" aria-selected={mode === item} className={mode === item ? "active" : ""} key={item} onClick={() => changeMode(item)}>{t(item)}</button>)}</div>
    <label className="field"><span>{t("sourcePath")}</span><div className="path-input"><input value={source} readOnly={mode !== "git"} onChange={(event) => { setSource(event.target.value); setPreview(null); }} />{mode !== "git" && <button className="button" onClick={chooseSource}>{t("choose")}</button>}</div></label>
    {mode === "git" && <div className="field-grid"><label className="field"><span>{t("gitRef")}</span><input value={ref} onChange={(event) => { setRef(event.target.value); setPreview(null); }} /></label><label className="field"><span>{t("gitPath")}</span><input value={gitPath} onChange={(event) => { setGitPath(event.target.value); setPreview(null); }} /></label></div>}
    {preview && <div className="preview-box"><strong>{t("previewResult")}</strong>{installPreview ? <><PreviewGroup label={t("wouldInstall")} items={installPreview.skills.map((item) => `${item.name} — ${item.description}`)} /><PreviewGroup label={t("skipped")} items={installPreview.skipped.map((item) => item.name)} /><PreviewGroup label={t("failed")} items={installPreview.failed.map((item) => `${item.name ?? item.path}: ${item.reason}`)} /></> : linkPreview && <p>{linkPreview.name} — {linkPreview.description}</p>}</div>}
    <div className="modal-actions"><button className="button ghost" onClick={onClose}>{t("cancel")}</button><button className="button" disabled={!source || busy} onClick={doPreview}>{t("preview")}</button><button className="button primary" disabled={!canConfirm || busy} onClick={confirm}>{mode === "link" ? t("confirmLink") : t("confirmInstall")}</button></div>
  </Modal>;
}

function EnableModal({ skill, projects, t, busy, onClose, onConfirm }: { skill: DesktopSkillDetails; projects: string[]; t: (key: string) => string; busy: boolean; onClose: () => void; onConfirm: (target: DesktopTarget) => void }) {
  const [target, setTarget] = useState("global");
  return <Modal title={`${t("enable")} ${skill.name}`} onClose={onClose}><label className="field"><span>{t("target")}</span><select value={target} onChange={(event) => setTarget(event.target.value)}><option value="global">{t("globalTarget")}</option>{projects.map((project) => <option key={project} value={project}>{project}</option>)}</select></label><div className="modal-actions"><button className="button ghost" onClick={onClose}>{t("cancel")}</button><button className="button primary" disabled={busy} onClick={() => onConfirm(target === "global" ? { type: "global" } : { type: "project", path: target })}>{t("enable")}</button></div></Modal>;
}

function TagsModal({ skill, t, busy, onClose, onConfirm }: {
  skill: DesktopSkillDetails;
  t: (key: string) => string;
  busy: boolean;
  onClose: () => void;
  onConfirm: (tags: string[]) => void;
}) {
  const [value, setValue] = useState(skill.tags.join(", "));
  const tags = value.split(/[,\n]/).map((tag) => tag.trim()).filter(Boolean);
  const invalid = tags.length > 32 || tags.some((tag) => tag.length > 64);
  return <Modal title={`${t("editTags")}: ${skill.name}`} onClose={onClose}>
    <label className="field"><span>{t("tags")}</span><textarea aria-label={t("tags")} rows={5} value={value} onChange={(event) => setValue(event.target.value)} placeholder={t("tagsPlaceholder")} autoFocus /></label>
    <p className={`field-help ${invalid ? "invalid" : ""}`}>{invalid ? t("tagsInvalid") : t("tagsHelp")}</p>
    <div className="modal-actions"><button className="button ghost" onClick={onClose}>{t("cancel")}</button><button className="button primary" disabled={busy || invalid} onClick={() => onConfirm(tags)}>{t("saveTags")}</button></div>
  </Modal>;
}

function RemoveModal({ skill, t, busy, onClose, onConfirm }: { skill: DesktopSkillDetails; t: (key: string) => string; busy: boolean; onClose: () => void; onConfirm: (force: boolean) => void }) {
  const [force, setForce] = useState(false);
  const requiresForce = skill.enablementCount > 0;
  return <Modal title={`${t("confirmRemove")}: ${skill.name}`} onClose={onClose}><p className="muted">{t("destructiveDescription")}</p><dl className="facts"><div><dt>{t("source")}</dt><dd title={skill.sourceLocation}>{skill.sourceLocation}</dd></div></dl>{skill.enablements.length > 0 && <div className="preview-box"><strong>{t("enablements")}</strong><ul>{skill.enablements.map((item) => <li key={item.id}>{item.targetType === "global" ? t("globalTarget") : item.targetKey} — {item.entryPath}</li>)}</ul></div>}{requiresForce && <label className="check"><input type="checkbox" checked={force} onChange={(event) => setForce(event.target.checked)} /><span>{t("forceRemove")}</span></label>}<div className="modal-actions"><button className="button ghost" onClick={onClose}>{t("cancel")}</button><button className="button danger" disabled={busy || (requiresForce && !force)} onClick={() => onConfirm(force)}>{skill.installationKind === "linked" ? t("unlink") : t("remove")}</button></div></Modal>;
}

function UpdateModal({ scopeName, checks, t, busy, onClose, onPreview, onConfirm }: {
  scopeName?: string;
  checks: FleetUpdateCheck[];
  t: (key: string) => string;
  busy: boolean;
  onClose: () => void;
  onPreview: () => Promise<UpdateSummary | undefined>;
  onConfirm: () => Promise<BatchUpdateSummary | undefined>;
}) {
  const [preview, setPreview] = useState<UpdateSummary | null>(null);
  const [result, setResult] = useState<BatchUpdateSummary | null>(null);
  const title = scopeName ? `${t("checkUpdate")}: ${scopeName}` : t("checkUpdates");
  async function previewUpdates() {
    const value = await onPreview();
    if (value) setPreview(value);
  }
  async function confirmUpdates() {
    const value = await onConfirm();
    if (value) setResult(value);
  }
  return <Modal title={title} onClose={onClose}>
    <div className="preview-box"><strong>{t("checkResults")}</strong><PreviewGroup label={t("updateStatus")} items={checks.map(formatUpdateCheck)} /></div>
    {preview && <div className="preview-box"><strong>{t("updatePreview")}</strong><PreviewGroup label={t("wouldUpdate")} items={preview.planned.map((item) => `${item.name} — ${item.revision}`)} /><PreviewGroup label={t("skipped")} items={preview.skipped.map((item) => `${item.name}: ${item.reason}`)} /><PreviewGroup label={t("failed")} items={preview.failed.map((item) => `${item.name}: ${item.reason}`)} /></div>}
    {result && <div className="preview-box"><strong>{t("updateComplete")}</strong><PreviewGroup label={t("updated")} items={result.updated.map((item) => `${item.name} — ${item.revision}`)} /><PreviewGroup label={t("skipped")} items={result.skipped.map((item) => `${item.name}: ${item.reason}`)} /><PreviewGroup label={t("failed")} items={result.failed.map((item) => `${item.name}: ${item.reason}`)} /></div>}
    <div className="modal-actions"><button className="button ghost" onClick={onClose}>{t("close")}</button><button className="button" disabled={busy || Boolean(result)} onClick={() => void previewUpdates()}>{t("previewUpdate")}</button><button className="button primary" disabled={busy || !preview?.planned.length || Boolean(result)} onClick={() => void confirmUpdates()}>{t("confirmUpdate")}</button></div>
  </Modal>;
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-head"><h2 id="modal-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close">×</button></div>{children}</section></div>;
}

function PathField({ label, value, onChange, onChoose, t }: { label: string; value: string; onChange: (value: string) => void; onChoose: () => void; t: (key: string) => string }) {
  return <label className="field"><span>{label}</span><div className="path-input"><input value={value} spellCheck={false} onChange={(event) => onChange(event.target.value)} /><button className="button" onClick={onChoose}>{t("choose")}</button></div></label>;
}

function NavButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: string; children: ReactNode }) {
  return <button className={`nav-button ${active ? "active" : ""}`} onClick={onClick}><span>{icon}</span>{children}</button>;
}

function Status({ value }: { value: string }) { return <span className={`status status-${value}`}>{value}</span>; }
function Empty({ text }: { text: string }) { return <div className="empty"><span>◇</span><p>{text}</p></div>; }
function PreviewGroup({ label, items }: { label: string; items: string[] }) { return items.length ? <div className="preview-group"><span>{label}</span><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></div> : null; }
function formatUpdateCheck(check: FleetUpdateCheck): string { return `${check.name}: ${check.status}${check.reason ? ` — ${check.reason}` : ""}`; }
function kindLabel(kind: DesktopInstallationKind, t: (key: string) => string) { return kind === "linked" ? t("linked") : kind === "git-copy" ? t("gitCopy") : t("localCopy"); }
