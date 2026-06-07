import {
  Activity,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Database,
  Download,
  ExternalLink,
  FileJson,
  FileText,
  FolderOpen,
  GitBranch,
  Github,
  LayoutList,
  MonitorCog,
  Palette,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Terminal,
  X
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AgentKind, AgentProcess, AgentSession, Diagnostic, Evidence, Relation, ScopeSnapshot, SessionCandidate } from "@agentscope/shared";
import "./styles.css";

type View = "processes" | "sessions" | "graph" | "doctor" | "settings";
type SettingsSection = "general" | "appearance" | "indexing" | "runtime" | "diagnostics";
type ThemeName = "graphite" | "blueprint" | "contrast" | "midnight";
type DensityName = "compact" | "comfortable" | "spacious";
type MotionName = "full" | "reduced" | "off";
type StrongConfidence = "exact" | "indexed" | "heuristic";
type SelectionKey = { type: "session"; id: string } | { type: "process"; pid: number } | null;
type Selection = { type: "session"; value: AgentSession } | { type: "process"; value: AgentProcess } | null;

interface AppInfo {
  userData: string;
  home: string;
  codexHome: string;
  claudeHome: string;
  githubUrl: string;
  actionsUrl: string;
  issuesUrl: string;
  readmeUrl: string;
}

interface AppSettings {
  theme: ThemeName;
  density: DensityName;
  motion: MotionName;
  accent: string;
  defaultView: Exclude<View, "settings">;
  inspector: "right" | "hidden";
  fontScale: "small" | "normal" | "large";
  searchLimit: number;
  showUnknownCandidates: boolean;
}

const settingsKey = "agentscope.settings.v2";
const defaultSettings: AppSettings = {
  theme: "graphite",
  density: "compact",
  motion: "full",
  accent: "#b8c2cc",
  defaultView: "processes",
  inspector: "right",
  fontScale: "normal",
  searchLimit: 24,
  showUnknownCandidates: true
};
const themeValues: ThemeName[] = ["graphite", "blueprint", "contrast", "midnight"];
const densityValues: DensityName[] = ["compact", "comfortable", "spacious"];
const motionValues: MotionName[] = ["full", "reduced", "off"];
const defaultViewValues: AppSettings["defaultView"][] = ["processes", "sessions", "graph", "doctor"];
const inspectorValues: AppSettings["inspector"][] = ["right", "hidden"];
const fontScaleValues: AppSettings["fontScale"][] = ["small", "normal", "large"];
const accentValues = ["#b8c2cc", "#4aa3ff", "#8b5cf6", "#f59e0b", "#f43f5e", "#e5e7eb"] as const;

function App() {
  const [snapshot, setSnapshot] = useState<ScopeSnapshot | null>(null);
  const [doctor, setDoctor] = useState<Diagnostic[]>([]);
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [view, setView] = useState<View>(settings.defaultView);
  const [selectionKey, setSelectionKey] = useState<SelectionKey>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);

  function updateSettings(patch: Partial<AppSettings>) {
    setSettings((current) => {
      const next = { ...current, ...patch };
      saveSettings(next);
      return next;
    });
  }

  async function refresh() {
    setLoading(true);
    try {
      const [nextSnapshot, nextDoctor] = await Promise.all([window.agentscope.getSnapshot(), window.agentscope.getDoctor()]);
      setSnapshot(nextSnapshot);
      setDoctor(nextDoctor);
      setSelectionKey((current) => current ?? firstSelectionKey(nextSnapshot));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    void window.agentscope.getAppInfo().then(setAppInfo);
  }, []);

  async function runSearch() {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setResults(await window.agentscope.search(query, settings.searchLimit));
  }

  async function exportCurrentSnapshot() {
    if (!snapshot) return;
    const result = await window.agentscope.exportSnapshot();
    setToast(result.canceled ? "Export canceled" : `Snapshot exported: ${result.path}`);
  }

  async function openExternal(url: string) {
    const opened = await window.agentscope.openExternal(url);
    setToast(opened ? `Opened ${url}` : `Blocked external URL: ${url}`);
  }

  async function openPath(targetPath?: string) {
    if (!targetPath) return;
    const result = await window.agentscope.openPath(targetPath);
    setToast(result ? `Open failed: ${result}` : `Opened ${targetPath}`);
  }

  async function revealPath(targetPath?: string) {
    if (!targetPath) return;
    await window.agentscope.revealPath(targetPath);
    setToast(`Revealed ${targetPath}`);
  }

  const sessions = snapshot?.sessions ?? [];
  const processes = snapshot?.processes ?? [];
  const relations = snapshot?.relations ?? [];
  const selected = resolveSelection(selectionKey, sessions, processes);
  const activeProcesses = processes.filter((item) => item.agent !== "unknown");
  const matchedProcesses = processes.filter((item) => strongCandidates(item).length > 0).length;
  const counts = useMemo(
    () => ({
      sessions: sessions.length,
      processes: processes.length,
      codex: sessions.filter((item) => item.agent === "codex").length,
      claude: sessions.filter((item) => item.agent === "claude").length,
      matched: matchedProcesses,
      warnings: doctor.filter((item) => item.status === "warn").length
    }),
    [sessions, processes, matchedProcesses, doctor]
  );
  const resetSettings = () => updateSettings(defaultSettings);

  return (
    <main
      className="shell"
      data-theme={settings.theme}
      data-density={settings.density}
      data-motion={settings.motion}
      data-inspector={settings.inspector}
      data-font={settings.fontScale}
      style={{ "--accent": settings.accent } as CSSProperties}
    >
      <Sidebar view={view} setView={setView} warnings={counts.warnings} loading={loading} onRefresh={() => void refresh()} />
      <section className="workspace">
        <CommandBar
          snapshot={snapshot}
          appInfo={appInfo}
          selected={selected}
          currentView={view}
          query={query}
          setQuery={setQuery}
          runSearch={() => void runSearch()}
          counts={counts}
          loading={loading}
          onRefresh={() => void refresh()}
          onExport={() => void exportCurrentSnapshot()}
          onOpenPath={(targetPath) => void openPath(targetPath)}
          onRevealPath={(targetPath) => void revealPath(targetPath)}
          onOpenExternal={(url) => void openExternal(url)}
          onSetView={setView}
          settings={settings}
          updateSettings={updateSettings}
        />
        {results.length > 0 && <SearchResults results={results} onPick={() => setResults([])} />}
        <div className="content" key={settings.inspector}>
          <section className="listPane" key={view}>
            {view === "processes" && (
              <ProcessList
                processes={activeProcesses}
                sessions={sessions}
                selectedPid={selected?.type === "process" ? selected.value.pid : undefined}
                onSelect={(process) => setSelectionKey({ type: "process", pid: process.pid })}
              />
            )}
            {view === "sessions" && (
              <SessionList
                sessions={sessions}
                selectedId={selected?.type === "session" ? selected.value.sessionId : undefined}
                onSelect={(session) => setSelectionKey({ type: "session", id: session.sessionId })}
              />
            )}
            {view === "graph" && <RelationList relations={relations} />}
            {view === "doctor" && <DoctorPanel checks={doctor} />}
            {view === "settings" && (
              <SettingsPanel
                appInfo={appInfo}
                settings={settings}
                updateSettings={updateSettings}
                resetSettings={resetSettings}
                doctor={doctor}
                processes={processes}
                sessions={sessions}
                onOpenPath={(targetPath) => void openPath(targetPath)}
                onOpenExternal={(url) => void openExternal(url)}
              />
            )}
          </section>
          {settings.inspector === "right" && <Inspector selected={selected} relations={relations} showUnknownCandidates={settings.showUnknownCandidates} />}
        </div>
      </section>
      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </main>
  );
}

function Sidebar(props: { view: View; setView: (view: View) => void; warnings: number; loading: boolean; onRefresh: () => void }) {
  return (
    <aside className="sidebar">
      <div className="chromeDots" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="brand">
        <div className="brandMark">
          <MonitorCog size={18} />
        </div>
        <div>
          <h1>AgentScope</h1>
          <p>control + trace layer</p>
        </div>
      </div>
      <nav className="nav">
        <NavButton active={props.view === "processes"} icon={<Activity size={17} />} label="Processes" onClick={() => props.setView("processes")} />
        <NavButton active={props.view === "sessions"} icon={<LayoutList size={17} />} label="Sessions" onClick={() => props.setView("sessions")} />
        <NavButton active={props.view === "graph"} icon={<GitBranch size={17} />} label="Relations" onClick={() => props.setView("graph")} />
        <NavButton active={props.view === "doctor"} icon={<ShieldCheck size={17} />} label="Doctor" badge={props.warnings} onClick={() => props.setView("doctor")} />
      </nav>
      <div className="navSection">System</div>
      <nav className="nav">
        <NavButton active={props.view === "settings"} icon={<Settings size={17} />} label="Settings" onClick={() => props.setView("settings")} />
      </nav>
      <button className="refreshButton" onClick={props.onRefresh}>
        <RefreshCw size={16} className={props.loading ? "spin" : ""} />
        <span>Refresh index</span>
      </button>
    </aside>
  );
}

function NavButton(props: { active: boolean; icon: ReactNode; label: string; badge?: number; onClick: () => void }) {
  return (
    <button className={`navButton ${props.active ? "active" : ""}`} onClick={props.onClick}>
      {props.icon}
      <span>{props.label}</span>
      {props.badge ? <strong>{props.badge}</strong> : null}
    </button>
  );
}

function CommandBar(props: {
  snapshot: ScopeSnapshot | null;
  appInfo: AppInfo | null;
  selected: Selection;
  currentView: View;
  query: string;
  setQuery: (value: string) => void;
  runSearch: () => void;
  counts: { sessions: number; processes: number; codex: number; claude: number; matched: number; warnings: number };
  loading: boolean;
  onRefresh: () => void;
  onExport: () => void;
  onOpenPath: (targetPath?: string) => void;
  onRevealPath: (targetPath?: string) => void;
  onOpenExternal: (url: string) => void;
  onSetView: (view: View) => void;
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
}) {
  return (
    <header className="commandBar">
      <TopMenus
        snapshot={props.snapshot}
        appInfo={props.appInfo}
        selected={props.selected}
        currentView={props.currentView}
        onExport={props.onExport}
        onOpenPath={props.onOpenPath}
        onRevealPath={props.onRevealPath}
        onOpenExternal={props.onOpenExternal}
        onSetView={props.onSetView}
        onRefresh={props.onRefresh}
        settings={props.settings}
        updateSettings={props.updateSettings}
      />
      <div className="searchBox">
        <Search size={17} />
        <input
          value={props.query}
          onChange={(event) => props.setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") props.runSearch();
          }}
          placeholder="Search sessions, transcripts, command lines"
        />
      </div>
      <div className="statusChips">
        <StatusChip label="Proc" value={props.counts.processes} />
        <StatusChip label="Matched" value={props.counts.matched} />
        <StatusChip label="Codex" value={props.counts.codex} />
        <StatusChip label="Claude" value={props.counts.claude} />
        <StatusChip label="Warn" value={props.counts.warnings} tone={props.counts.warnings ? "warn" : "ok"} />
      </div>
      <button className="iconButton" title="Refresh" onClick={props.onRefresh}>
        <RefreshCw size={17} className={props.loading ? "spin" : ""} />
      </button>
    </header>
  );
}

function TopMenus(props: {
  snapshot: ScopeSnapshot | null;
  appInfo: AppInfo | null;
  selected: Selection;
  currentView: View;
  onExport: () => void;
  onOpenPath: (targetPath?: string) => void;
  onRevealPath: (targetPath?: string) => void;
  onOpenExternal: (url: string) => void;
  onSetView: (view: View) => void;
  onRefresh: () => void;
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const selectedTranscript = selectedTranscriptPath(props.selected);
  const selectedCwd = selectedCwdPath(props.selected);
  const close = () => setOpen(null);
  const run = (action: () => void) => {
    action();
    close();
  };
  return (
    <div className="menuText" onMouseLeave={() => setOpen(null)}>
      <MenuButton label="File" open={open} setOpen={setOpen}>
        <MenuItem icon={<Download size={15} />} label="Export snapshot" detail="JSON" disabled={!props.snapshot} onClick={() => run(props.onExport)} />
        <MenuItem icon={<FolderOpen size={15} />} label="Open app data" detail="logs" disabled={!props.appInfo?.userData} onClick={() => run(() => props.onOpenPath(props.appInfo?.userData))} />
        <MenuItem icon={<FolderOpen size={15} />} label="Open Codex home" detail=".codex" disabled={!props.appInfo?.codexHome} onClick={() => run(() => props.onOpenPath(props.appInfo?.codexHome))} />
        <MenuItem icon={<FolderOpen size={15} />} label="Open Claude home" detail=".claude" disabled={!props.appInfo?.claudeHome} onClick={() => run(() => props.onOpenPath(props.appInfo?.claudeHome))} />
        <MenuDivider />
        <MenuItem icon={<RefreshCw size={15} />} label="Reload window" onClick={() => run(() => void window.agentscope.reloadApp())} />
        <MenuItem icon={<X size={15} />} label="Quit AgentScope" onClick={() => run(() => void window.agentscope.quitApp())} />
      </MenuButton>
      <MenuButton label="View" open={open} setOpen={setOpen}>
        <MenuItem icon={<Activity size={15} />} label="Processes" active={props.currentView === "processes"} onClick={() => run(() => props.onSetView("processes"))} />
        <MenuItem icon={<LayoutList size={15} />} label="Sessions" active={props.currentView === "sessions"} onClick={() => run(() => props.onSetView("sessions"))} />
        <MenuItem icon={<GitBranch size={15} />} label="Relations" active={props.currentView === "graph"} onClick={() => run(() => props.onSetView("graph"))} />
        <MenuItem icon={<ShieldCheck size={15} />} label="Doctor" active={props.currentView === "doctor"} onClick={() => run(() => props.onSetView("doctor"))} />
        <MenuItem icon={<Settings size={15} />} label="Settings" active={props.currentView === "settings"} onClick={() => run(() => props.onSetView("settings"))} />
        <MenuDivider />
        <MenuItem icon={<Palette size={15} />} label="Graphite theme" active={props.settings.theme === "graphite"} onClick={() => run(() => props.updateSettings({ theme: "graphite" }))} />
        <MenuItem icon={<Palette size={15} />} label="Blueprint theme" active={props.settings.theme === "blueprint"} onClick={() => run(() => props.updateSettings({ theme: "blueprint" }))} />
        <MenuItem icon={<Palette size={15} />} label="High contrast" active={props.settings.theme === "contrast"} onClick={() => run(() => props.updateSettings({ theme: "contrast" }))} />
        <MenuItem icon={<Palette size={15} />} label="Midnight theme" active={props.settings.theme === "midnight"} onClick={() => run(() => props.updateSettings({ theme: "midnight" }))} />
        <MenuDivider />
        <MenuItem icon={<FileText size={15} />} label="Toggle inspector" active={props.settings.inspector === "right"} onClick={() => run(() => props.updateSettings({ inspector: props.settings.inspector === "right" ? "hidden" : "right" }))} />
      </MenuButton>
      <MenuButton label="Trace" open={open} setOpen={setOpen}>
        <MenuItem icon={<RefreshCw size={15} />} label="Refresh index" onClick={() => run(props.onRefresh)} />
        <MenuItem icon={<CircleDot size={15} />} label="Show weak candidates" active={props.settings.showUnknownCandidates} onClick={() => run(() => props.updateSettings({ showUnknownCandidates: !props.settings.showUnknownCandidates }))} />
        <MenuItem icon={<FileJson size={15} />} label="Open selected transcript" detail="JSONL" disabled={!selectedTranscript} onClick={() => run(() => props.onOpenPath(selectedTranscript))} />
        <MenuItem icon={<FolderOpen size={15} />} label="Reveal selected transcript" disabled={!selectedTranscript} onClick={() => run(() => props.onRevealPath(selectedTranscript))} />
        <MenuItem icon={<FolderOpen size={15} />} label="Open selected cwd" disabled={!selectedCwd} onClick={() => run(() => props.onOpenPath(selectedCwd))} />
        <MenuItem icon={<Database size={15} />} label="Reveal Codex SQLite" disabled={!props.appInfo?.codexHome} onClick={() => run(() => props.appInfo && props.onRevealPath(`${props.appInfo.codexHome}\\state_5.sqlite`))} />
      </MenuButton>
      <MenuButton label="Help" open={open} setOpen={setOpen}>
        <MenuItem icon={<Github size={15} />} label="GitHub repository" detail="public" disabled={!props.appInfo?.githubUrl} onClick={() => run(() => props.appInfo && props.onOpenExternal(props.appInfo.githubUrl))} />
        <MenuItem icon={<ExternalLink size={15} />} label="GitHub Actions" disabled={!props.appInfo?.actionsUrl} onClick={() => run(() => props.appInfo && props.onOpenExternal(props.appInfo.actionsUrl))} />
        <MenuItem icon={<ExternalLink size={15} />} label="Issues" disabled={!props.appInfo?.issuesUrl} onClick={() => run(() => props.appInfo && props.onOpenExternal(props.appInfo.issuesUrl))} />
        <MenuItem icon={<BookOpen size={15} />} label="README" disabled={!props.appInfo?.readmeUrl} onClick={() => run(() => props.appInfo && props.onOpenExternal(props.appInfo.readmeUrl))} />
      </MenuButton>
    </div>
  );
}

function MenuButton(props: { label: string; open: string | null; setOpen: (value: string | null) => void; children: ReactNode }) {
  const active = props.open === props.label;
  return (
    <div className="menuButtonWrap">
      <button className={`menuButton ${active ? "active" : ""}`} onClick={() => props.setOpen(active ? null : props.label)}>
        {props.label}
      </button>
      {active && <div className="menuPanel">{props.children}</div>}
    </div>
  );
}

function MenuItem(props: { icon: ReactNode; label: string; detail?: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button className={`menuItem ${props.active ? "active" : ""}`} disabled={props.disabled} onClick={props.onClick}>
      {props.icon}
      <span>{props.label}</span>
      {props.detail && <em>{props.detail}</em>}
      {props.active && <CircleDot size={12} />}
    </button>
  );
}

function MenuDivider() {
  return <div className="menuDivider" />;
}

function StatusChip(props: { label: string; value: number; tone?: "ok" | "warn" }) {
  return (
    <span className={`statusChip ${props.tone ?? ""}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </span>
  );
}

function ProcessList(props: {
  processes: AgentProcess[];
  sessions: AgentSession[];
  selectedPid?: number | undefined;
  onSelect: (process: AgentProcess) => void;
}) {
  if (!props.processes.length) {
    return <EmptyState icon={<Activity size={22} />} title="No related processes" detail="Codex, Claude, node_repl, app-server, or daemon processes were not found." />;
  }
  return (
    <>
      <PaneHeader title="Processes" subtitle={`${props.processes.length} live agent-related Win32 rows`} />
      <div className="rows processRows">
        {props.processes.map((process) => {
          const strong = strongCandidates(process);
          const top = strong[0] ?? process.sessionCandidates?.[0];
          const weakOnly = !strong.length && !!top;
          return (
            <button className={`processRow ${props.selectedPid === process.pid ? "selected" : ""}`} key={process.pid} onClick={() => props.onSelect(process)}>
              <AgentTile agent={process.agent} />
              <div className="rowMain">
                <div className="rowTop">
                  <span className="rowTitle">{process.windowTitle || process.processName}</span>
                  <span className="rowPid mono">PID {process.pid}</span>
                </div>
                <div className="rowMeta">
                  <span>{process.processName}</span>
                  {process.ppid !== undefined && <span>PPID {process.ppid}</span>}
                  {process.startTime && <span>Started {formatDate(process.startTime)}</span>}
                </div>
                <div className="candidateLine">
                  {top ? (
                    <>
                      <ConfidenceBadge value={top.confidence} />
                      <span className="candidateTitle">{candidateTitle(top)}</span>
                      <span className="scoreBadge">score {top.score}</span>
                      <span>{weakOnly ? "weak evidence" : top.reasons[0]?.source ?? "candidate"}</span>
                    </>
                  ) : (
                    <span className="muted">No session candidate yet</span>
                  )}
                </div>
                <div className="rowPath mono">{process.commandLine || process.executablePath || "No command line"}</div>
              </div>
              <ChevronRight size={16} />
            </button>
          );
        })}
      </div>
    </>
  );
}

function SessionList(props: { sessions: AgentSession[]; selectedId?: string | undefined; onSelect: (session: AgentSession) => void }) {
  if (!props.sessions.length) {
    return <EmptyState icon={<Database size={22} />} title="No sessions indexed" detail="Run Doctor to check Codex and Claude local paths." />;
  }
  return (
    <>
      <PaneHeader title="Sessions" subtitle={`${props.sessions.length} Claude + Codex records`} />
      <div className="rows">
        {props.sessions.map((session) => (
          <button
            className={`sessionRow ${props.selectedId === session.sessionId ? "selected" : ""}`}
            key={`${session.agent}:${session.sessionId}`}
            onClick={() => props.onSelect(session)}
          >
            <AgentTile agent={session.agent} />
            <div className="rowMain">
              <div className="rowTop">
                <span className="rowTitle">{displayTitle(session)}</span>
                <ConfidenceBadge value={session.confidence} />
              </div>
              <div className="rowMeta">
                <span className="mono">{short(session.sessionId)}</span>
                {session.pid !== undefined && <span>PID {session.pid}</span>}
                {session.startedAt && <span>Started {formatDate(session.startedAt)}</span>}
                {session.updatedAt && <span>Updated {formatDate(session.updatedAt)}</span>}
              </div>
              <div className="rowPath mono">{session.cwd || session.transcriptPath || "No path evidence"}</div>
              <EvidenceSummary evidence={session.evidence} />
            </div>
            <ChevronRight size={16} />
          </button>
        ))}
      </div>
    </>
  );
}

function RelationList(props: { relations: Relation[] }) {
  if (!props.relations.length) {
    return <EmptyState icon={<GitBranch size={22} />} title="No relations found" detail="Codex spawn edges or process relations will appear here when indexed." />;
  }
  return (
    <>
      <PaneHeader title="Relations" subtitle={`${props.relations.length} session/process graph edges`} />
      <div className="relationList">
        {props.relations.map((relation, index) => (
          <div className="relationItem" key={`${relation.kind}:${relation.sourceId}:${relation.targetId}:${index}`}>
            <Badge text={relation.kind} />
            <span className="mono">{short(relation.sourceId)}</span>
            <span className="arrow">{"->"}</span>
            <span className="mono">{short(relation.targetId)}</span>
            <ConfidenceBadge value={relation.confidence} />
          </div>
        ))}
      </div>
    </>
  );
}

function DoctorPanel(props: { checks: Diagnostic[] }) {
  if (!props.checks.length) {
    return <EmptyState icon={<ShieldCheck size={22} />} title="Doctor has not run" detail="Refresh to run local environment checks." />;
  }
  return (
    <>
      <PaneHeader title="Doctor" subtitle={`${props.checks.length} environment checks`} />
      <div className="doctorList">
        {props.checks.map((check) => (
          <div className="doctorItem" key={check.name}>
            {check.status === "ok" ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
            <div>
              <strong>{check.name}</strong>
              <span>{check.detail}</span>
            </div>
            <Badge text={check.status} tone={check.status === "ok" ? "ok" : "warn"} />
          </div>
        ))}
      </div>
    </>
  );
}

function SettingsPanel(props: {
  appInfo: AppInfo | null;
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  resetSettings: () => void;
  doctor: Diagnostic[];
  processes: AgentProcess[];
  sessions: AgentSession[];
  onOpenPath: (targetPath?: string) => void;
  onOpenExternal: (url: string) => void;
}) {
  const [section, setSection] = useState<SettingsSection>("general");
  const warnings = props.doctor.filter((item) => item.status === "warn").length;
  return (
    <>
      <PaneHeader title="Settings" subtitle="Read-only Windows trace configuration" />
      <div className="settingsShell" key={section}>
        <aside className="settingsNav">
          <SettingsNavItem active={section === "general"} icon={<SlidersHorizontal size={16} />} label="General" onClick={() => setSection("general")} />
          <SettingsNavItem active={section === "appearance"} icon={<Palette size={16} />} label="Appearance" onClick={() => setSection("appearance")} />
          <SettingsNavItem active={section === "indexing"} icon={<Database size={16} />} label="Indexing" onClick={() => setSection("indexing")} />
          <SettingsNavItem active={section === "runtime"} icon={<Terminal size={16} />} label="Runtime" onClick={() => setSection("runtime")} />
          <SettingsNavItem active={section === "diagnostics"} icon={<ShieldCheck size={16} />} label="Diagnostics" onClick={() => setSection("diagnostics")} />
        </aside>
        <section className="settingsRows animatedPane">
          {section === "general" && (
            <>
              <SettingGroup title="General">
                <SettingRow label="Control mode" detail="Read-only; control actions stay suggested until explicit force options exist.">
                  <Badge text="read-only" />
                </SettingRow>
                <SettingRow label="Default view" detail="Entry point used when AgentScope opens.">
                  <SegmentedControl
                    value={props.settings.defaultView}
                    values={[
                      ["processes", "Processes"],
                      ["sessions", "Sessions"],
                      ["graph", "Relations"],
                      ["doctor", "Doctor"]
                    ]}
                    onChange={(value) => props.updateSettings({ defaultView: value as AppSettings["defaultView"] })}
                  />
                </SettingRow>
              </SettingGroup>
              <SettingGroup title="Workspace">
                <SettingRow label="Inspector" detail="Right rail keeps runtime evidence visible while switching main views.">
                  <SegmentedControl
                    value={props.settings.inspector}
                    values={[
                      ["right", "Right"],
                      ["hidden", "Hidden"]
                    ]}
                    onChange={(value) => props.updateSettings({ inspector: value as AppSettings["inspector"] })}
                  />
                </SettingRow>
                <SettingRow label="Search scope" detail="SQLite title/preview plus local Codex and Claude JSONL transcripts.">
                  <Badge text="local" tone="ok" />
                </SettingRow>
                <SettingRow label="Search result limit" detail="Maximum matches returned by the command bar search.">
                  <Stepper value={props.settings.searchLimit} min={8} max={80} step={8} onChange={(value) => props.updateSettings({ searchLimit: value })} />
                </SettingRow>
                <SettingRow label="Reset UI settings" detail="Restores theme, density, motion, inspector, font scale, and search limit.">
                  <ActionButton label="Reset" onClick={props.resetSettings} />
                </SettingRow>
              </SettingGroup>
            </>
          )}
          {section === "appearance" && (
            <>
              <SettingGroup title="Appearance">
                <SettingRow label="Theme" detail={themeDetail(props.settings.theme)}>
                  <SegmentedControl
                    value={props.settings.theme}
                    values={[
                      ["graphite", "Graphite"],
                      ["blueprint", "Blue"],
                      ["contrast", "Contrast"],
                      ["midnight", "Midnight"]
                    ]}
                    onChange={(value) => props.updateSettings({ theme: value as ThemeName })}
                  />
                </SettingRow>
                <SettingRow label="Density" detail="Controls row spacing in process and session lists.">
                  <SegmentedControl
                    value={props.settings.density}
                    values={[
                      ["compact", "Compact"],
                      ["comfortable", "Comfortable"],
                      ["spacious", "Spacious"]
                    ]}
                    onChange={(value) => props.updateSettings({ density: value as DensityName })}
                  />
                </SettingRow>
                <SettingRow label="Accent" detail="Changes selection rails, buttons, and status focus color.">
                  <ColorSwatches value={props.settings.accent} onChange={(accent) => props.updateSettings({ accent })} />
                </SettingRow>
                <SettingRow label="Motion" detail="Controls transitions, row entrance, hover lift, and animated loading states.">
                  <SegmentedControl
                    value={props.settings.motion}
                    values={[
                      ["full", "Full"],
                      ["reduced", "Reduced"],
                      ["off", "Off"]
                    ]}
                    onChange={(value) => props.updateSettings({ motion: value as MotionName })}
                  />
                </SettingRow>
              </SettingGroup>
              <SettingGroup title="Typography">
                <SettingRow label="UI scale" detail="Changes global interface font size.">
                  <SegmentedControl
                    value={props.settings.fontScale}
                    values={[
                      ["small", "Small"],
                      ["normal", "Normal"],
                      ["large", "Large"]
                    ]}
                    onChange={(value) => props.updateSettings({ fontScale: value as AppSettings["fontScale"] })}
                  />
                </SettingRow>
                <SettingRow label="Code font" detail="Cascadia Code">
                  <CodeValue value="mono" />
                </SettingRow>
                <SettingRow label="Open GitHub" detail="Public repository for issues, actions, and releases.">
                  <ActionButton label="GitHub" onClick={() => props.appInfo && props.onOpenExternal(props.appInfo.githubUrl)} disabled={!props.appInfo} />
                </SettingRow>
                <SettingRow label="Open README" detail="Project overview, CLI commands, and desktop notes.">
                  <ActionButton label="README" onClick={() => props.appInfo && props.onOpenExternal(props.appInfo.readmeUrl)} disabled={!props.appInfo} />
                </SettingRow>
              </SettingGroup>
            </>
          )}
          {section === "indexing" && (
            <>
              <SettingGroup title="Codex">
                <SettingRow label="SQLite index" detail="%USERPROFILE%\\.codex\\state_5.sqlite">
                  <Badge text="read" tone="ok" />
                </SettingRow>
                <SettingRow label="Open Codex home" detail={props.appInfo?.codexHome ?? "Loading path"}>
                  <ActionButton label="Open" onClick={() => props.onOpenPath(props.appInfo?.codexHome)} disabled={!props.appInfo} />
                </SettingRow>
                <SettingRow label="Rollout JSONL" detail="%USERPROFILE%\\.codex\\sessions\\YYYY\\MM\\DD\\rollout-*.jsonl">
                  <Badge text="stream" />
                </SettingRow>
                <SettingRow label="Spawn edges" detail="thread_spawn_edges parent/child graph.">
                  <Badge text="indexed" />
                </SettingRow>
              </SettingGroup>
              <SettingGroup title="Claude">
                <SettingRow label="PID sessions" detail="%USERPROFILE%\\.claude\\sessions\\*.json">
                  <Badge text="exact" tone="ok" />
                </SettingRow>
                <SettingRow label="Open Claude home" detail={props.appInfo?.claudeHome ?? "Loading path"}>
                  <ActionButton label="Open" onClick={() => props.onOpenPath(props.appInfo?.claudeHome)} disabled={!props.appInfo} />
                </SettingRow>
                <SettingRow label="Transcripts" detail="%USERPROFILE%\\.claude\\projects\\<encoded-cwd>\\<sessionId>.jsonl">
                  <Badge text="resolved" />
                </SettingRow>
              </SettingGroup>
            </>
          )}
          {section === "runtime" && (
            <>
              <SettingGroup title="Runtime Capture">
                <SettingRow label="Win32_Process" detail={`${props.processes.length} related rows; PID, PPID, path, command line, creation time.`}>
                  <Badge text="on" tone="ok" />
                </SettingRow>
                <SettingRow label="Window titles" detail="Get-Process MainWindowTitle when Windows exposes one.">
                  <Badge text="on" tone="ok" />
                </SettingRow>
                <SettingRow label="Session candidates" detail={`${props.sessions.length} indexed sessions scored by PID, cwd, transcript, title, and time evidence.`}>
                  <Badge text="scored" />
                </SettingRow>
              </SettingGroup>
              <SettingGroup title="Confidence">
                <SettingRow label="Exact" detail="Claude PID file or future hook mapping.">
                  <Badge text="PID" tone="ok" />
                </SettingRow>
                <SettingRow label="Heuristic" detail="Strong path/title evidence, with score and reasons shown.">
                  <Badge text="evidence" tone="warn" />
                </SettingRow>
                <SettingRow label="Unknown" detail="Weak time-only candidates remain visible but are not treated as matches.">
                  <button className={`toggleButton ${props.settings.showUnknownCandidates ? "on" : ""}`} onClick={() => props.updateSettings({ showUnknownCandidates: !props.settings.showUnknownCandidates })}>
                    {props.settings.showUnknownCandidates ? "Show" : "Hide"}
                  </button>
                </SettingRow>
              </SettingGroup>
            </>
          )}
          {section === "diagnostics" && (
            <SettingGroup title="Diagnostics">
              <SettingRow label="Doctor warnings" detail={`${warnings} warnings across Codex, Claude, SQLite, JSONL, and process scan.`}>
                <Badge text={warnings ? String(warnings) : "ok"} tone={warnings ? "warn" : "ok"} />
              </SettingRow>
              {props.doctor.map((check) => (
                <SettingRow key={check.name} label={check.name} detail={check.detail}>
                  <Badge text={check.status} tone={check.status === "ok" ? "ok" : "warn"} />
                </SettingRow>
              ))}
            </SettingGroup>
          )}
        </section>
      </div>
    </>
  );
}

function SettingsNavItem(props: { active?: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button className={`settingsNavItem ${props.active ? "active" : ""}`} onClick={props.onClick}>
      {props.icon}
      <span>{props.label}</span>
    </button>
  );
}

function SettingGroup(props: { title: string; children: ReactNode }) {
  return (
    <section className="settingGroup">
      <h3>{props.title}</h3>
      <div>{props.children}</div>
    </section>
  );
}

function SettingRow(props: { label: string; detail: string; children: ReactNode }) {
  return (
    <div className="settingRow">
      <div>
        <strong>{props.label}</strong>
        <span>{props.detail}</span>
      </div>
      <div className="settingControl">{props.children}</div>
    </div>
  );
}

function SegmentedControl(props: { value: string; values: Array<string | [string, string]>; onChange: (value: string) => void }) {
  return (
    <span className="segmented">
      {props.values.map((item) => {
        const [value, label] = Array.isArray(item) ? item : [item, item];
        return (
        <button className={props.value === value ? "active" : ""} key={value} onClick={() => props.onChange(value)}>
          {label}
        </button>
        );
      })}
    </span>
  );
}

function CodeValue(props: { value: string }) {
  return <span className="codeValue mono">{props.value}</span>;
}

function ColorSwatches(props: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="swatches">
      {accentValues.map((color) => (
        <button
          className={props.value.toLowerCase() === color ? "active" : ""}
          key={color}
          onClick={() => props.onChange(color)}
          style={{ background: color }}
          title={color}
        />
      ))}
    </div>
  );
}

function Stepper(props: { value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  const change = (delta: number) => props.onChange(Math.min(props.max, Math.max(props.min, props.value + delta)));
  return (
    <div className="stepper">
      <button onClick={() => change(-props.step)}>-</button>
      <span>{props.value}</span>
      <button onClick={() => change(props.step)}>+</button>
    </div>
  );
}

function ActionButton(props: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button className="actionButton" disabled={props.disabled} onClick={props.onClick}>
      {props.label}
    </button>
  );
}

function Inspector(props: { selected: Selection; relations: Relation[]; showUnknownCandidates: boolean }) {
  if (!props.selected) {
    return (
      <aside className="inspector">
        <EmptyState icon={<FileText size={22} />} title="Nothing selected" detail="Choose a process or session to inspect evidence." />
      </aside>
    );
  }

  if (props.selected.type === "process") {
    const process = props.selected.value;
    return (
      <aside className="inspector">
        <InspectorHeader title={process.windowTitle || process.processName} subtitle={`PID ${process.pid}`} agent={process.agent} />
        <FieldGroup title="Likely Sessions">
          <CandidateList candidates={process.sessionCandidates ?? []} showUnknown={props.showUnknownCandidates} />
        </FieldGroup>
        <FieldGroup title="Runtime">
          <Field label="PID" value={process.pid} />
          <Field label="PPID" value={process.ppid} />
          <Field label="Title" value={process.windowTitle} />
          <Field label="Started" value={process.startTime ?? process.creationDate} />
          <Field label="Executable" value={process.executablePath} mono long />
          <Field label="Command" value={process.commandLine} mono long />
        </FieldGroup>
        <EvidenceList evidence={process.evidence} />
      </aside>
    );
  }

  const session = props.selected.value;
  const related = props.relations.filter((relation) => relation.sourceId === session.sessionId || relation.targetId === session.sessionId);
  return (
    <aside className="inspector">
      <InspectorHeader title={displayTitle(session)} subtitle={session.cwd || "No cwd evidence"} agent={session.agent} />
      <FieldGroup title="Identity">
        <Field label="Session" value={session.sessionId} mono />
        <Field label="Confidence" value={<ConfidenceBadge value={session.confidence} />} />
        <Field label="Status" value={session.status} />
        <Field label="Started" value={session.startedAt} />
        <Field label="Updated" value={session.updatedAt} />
      </FieldGroup>
      <FieldGroup title="Runtime">
        <Field label="PID" value={session.pid} />
        <Field label="PPID" value={session.ppid} />
        <Field label="Name" value={session.processName} />
        <Field label="Command" value={session.commandLine} mono long />
      </FieldGroup>
      <FieldGroup title="Transcript">
        <Field label="Path" value={session.transcriptPath} mono long />
        <Field label="Index" value={session.indexSource} />
        <Field label="Parent" value={session.parentSessionId} mono />
        <Field label="Children" value={session.childSessionIds.length ? session.childSessionIds.join(", ") : undefined} mono long />
      </FieldGroup>
      {related.length > 0 && (
        <FieldGroup title="Relations">
          {related.map((relation, index) => (
            <div className="relationMini" key={`${relation.kind}:${index}`}>
              <Badge text={relation.kind} />
              <span className="mono">{short(relation.sourceId)}</span>
              <span>{"->"}</span>
              <span className="mono">{short(relation.targetId)}</span>
            </div>
          ))}
        </FieldGroup>
      )}
      <EvidenceList evidence={session.evidence} />
    </aside>
  );
}

function CandidateList(props: { candidates: SessionCandidate[]; showUnknown: boolean }) {
  const candidates = props.showUnknown ? props.candidates : props.candidates.filter((candidate) => candidate.confidence !== "unknown");
  if (!candidates.length) return <p className="muted blockText">No candidate session. AgentScope will not guess without PID, cwd, transcript, title, or time evidence.</p>;
  return (
    <div className="candidateList">
      {candidates.map((candidate) => (
        <div className="candidateItem" key={`${candidate.agent}:${candidate.sessionId}`}>
          <div className="candidateHead">
            <AgentPill agent={candidate.agent} />
            <span className="mono">{short(candidate.sessionId)}</span>
            <ConfidenceBadge value={candidate.confidence} />
            <span className="scoreBadge">score {candidate.score}</span>
          </div>
          <strong>{candidateTitle(candidate)}</strong>
          <span className="mono">{candidate.cwd || candidate.transcriptPath || "No path"}</span>
          <div className="reasonList">
            {candidate.reasons.slice(0, 4).map((reason, index) => (
              <Badge key={`${reason.source}:${index}`} text={reason.source.replace("process.match.", "")} tone={reason.source.endsWith("pid") ? "ok" : undefined} />
            ))}
            {candidate.confidence === "unknown" && <Badge text="weak evidence" />}
          </div>
        </div>
      ))}
    </div>
  );
}

function InspectorHeader(props: { title: string; subtitle: string; agent: string }) {
  return (
    <div className="inspectorHeader">
      <AgentPill agent={props.agent} />
      <h2>{props.title}</h2>
      <p>{props.subtitle}</p>
    </div>
  );
}

function PaneHeader(props: { title: string; subtitle: string }) {
  return (
    <div className="paneHeader">
      <div>
        <h2>{props.title}</h2>
        <p>{props.subtitle}</p>
      </div>
    </div>
  );
}

function FieldGroup(props: { title: string; children: ReactNode }) {
  return (
    <section className="fieldGroup">
      <h3>{props.title}</h3>
      <div>{props.children}</div>
    </section>
  );
}

function Field(props: { label: string; value: ReactNode; mono?: boolean; long?: boolean }) {
  if (props.value === undefined || props.value === null || props.value === "") return null;
  return (
    <div className={`field ${props.long ? "longField" : ""}`}>
      <span>{props.label}</span>
      <strong className={props.mono ? "mono" : ""}>{props.value}</strong>
    </div>
  );
}

function EvidenceList(props: { evidence: Evidence[] }) {
  return (
    <FieldGroup title="Evidence">
      {props.evidence.length ? (
        props.evidence.map((item, index) => (
          <div className="evidenceItem" key={`${item.source}:${item.path}:${item.field}:${index}`}>
            <strong>{item.source}</strong>
            <p>{item.detail}</p>
            {item.path && <span className="mono">{item.path}</span>}
            {item.field && <em>{item.field}</em>}
          </div>
        ))
      ) : (
        <p className="muted">No evidence attached.</p>
      )}
    </FieldGroup>
  );
}

function SearchResults(props: { results: Record<string, unknown>[]; onPick: () => void }) {
  return (
    <section className="results">
      {props.results.map((result, index) => (
        <button className="result" key={index} onClick={props.onPick}>
          <AgentPill agent={String(result.agent ?? "unknown")} />
          <span>{String(result.source ?? "")}</span>
          <span className="mono">{short(String(result.sessionId ?? ""))}</span>
          <strong>{String(result.title ?? result.text ?? result.path ?? "")}</strong>
        </button>
      ))}
    </section>
  );
}

function EmptyState(props: { icon: ReactNode; title: string; detail: string }) {
  return (
    <div className="emptyState">
      <div>{props.icon}</div>
      <h2>{props.title}</h2>
      <p>{props.detail}</p>
    </div>
  );
}

function AgentTile(props: { agent: AgentKind }) {
  return (
    <div className={`agentTile ${props.agent}`}>
      <AgentIcon agent={props.agent} />
      <span>{props.agent}</span>
    </div>
  );
}

function AgentIcon(props: { agent: string }) {
  if (props.agent === "claude") return <FileJson size={18} />;
  if (props.agent === "codex") return <Terminal size={18} />;
  return <Activity size={18} />;
}

function AgentPill(props: { agent: string }) {
  return <span className={`agentPill ${props.agent}`}>{props.agent}</span>;
}

function Badge(props: { text: string; tone?: "ok" | "warn" | undefined }) {
  return <span className={`badge ${props.tone ?? ""}`}>{props.text}</span>;
}

function ConfidenceBadge(props: { value: string }) {
  const tone = props.value === "exact" ? "ok" : props.value === "heuristic" ? "warn" : undefined;
  return <Badge text={props.value} tone={tone} />;
}

function isStrongConfidence(value: string): value is StrongConfidence {
  return value === "exact" || value === "indexed" || value === "heuristic";
}

function strongCandidates(process: AgentProcess) {
  return (process.sessionCandidates ?? []).filter((candidate) => isStrongConfidence(candidate.confidence));
}

function EvidenceSummary(props: { evidence: Evidence[] }) {
  const text = props.evidence
    .slice(0, 3)
    .map((item) => item.source)
    .join(" / ");
  return <div className="evidenceSummary">{text || "No evidence"}</div>;
}

function firstSelectionKey(snapshot: ScopeSnapshot): SelectionKey {
  if (snapshot.processes.length) return { type: "process", pid: snapshot.processes[0]!.pid };
  if (snapshot.sessions.length) return { type: "session", id: snapshot.sessions.at(-1)!.sessionId };
  return null;
}

function resolveSelection(key: SelectionKey, sessions: AgentSession[], processes: AgentProcess[]): Selection {
  if (key?.type === "process") {
    const process = processes.find((item) => item.pid === key.pid);
    return process ? { type: "process", value: process } : null;
  }
  if (key?.type === "session") {
    const session = sessions.find((item) => item.sessionId === key.id);
    return session ? { type: "session", value: session } : null;
  }
  return null;
}

function candidateTitle(candidate: SessionCandidate) {
  return candidate.title || short(candidate.sessionId);
}

function themeDetail(theme: ThemeName) {
  const details: Record<ThemeName, string> = {
    graphite: "Neutral graphite metal with cool state accents.",
    blueprint: "Dark blue operational workspace.",
    contrast: "Maximum contrast black interface.",
    midnight: "Near-black focus theme with muted panels."
  };
  return details[theme];
}

function selectedTranscriptPath(selection: Selection): string | undefined {
  if (!selection) return undefined;
  if (selection.type === "session") return selection.value.transcriptPath;
  return strongCandidates(selection.value).find((candidate) => candidate.transcriptPath)?.transcriptPath;
}

function selectedCwdPath(selection: Selection): string | undefined {
  if (!selection) return undefined;
  if (selection.type === "session") return selection.value.cwd;
  return strongCandidates(selection.value).find((candidate) => candidate.cwd)?.cwd;
}

function short(value?: string) {
  if (!value) return "";
  return value.length > 28 ? `${value.slice(0, 10)}...${value.slice(-8)}` : value;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function displayTitle(session: AgentSession) {
  const title = session.title || short(session.sessionId);
  return title.length > 160 ? `${title.slice(0, 157)}...` : title;
}

function Toast(props: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(props.onClose, 4200);
    return () => window.clearTimeout(timer);
  }, [props.onClose]);
  return (
    <button className="toast" onClick={props.onClose}>
      {props.message}
    </button>
  );
}

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(settingsKey);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return normalizeSettings(parsed);
  } catch {
    return defaultSettings;
  }
}

function saveSettings(settings: AppSettings): void {
  localStorage.setItem(settingsKey, JSON.stringify(normalizeSettings(settings)));
}

function normalizeSettings(settings: Partial<AppSettings>): AppSettings {
  return {
    theme: pickEnum(settings.theme, themeValues, defaultSettings.theme),
    density: pickEnum(settings.density, densityValues, defaultSettings.density),
    motion: pickEnum(settings.motion, motionValues, defaultSettings.motion),
    accent: pickEnum(settings.accent, [...accentValues], defaultSettings.accent),
    defaultView: pickEnum(settings.defaultView, defaultViewValues, defaultSettings.defaultView),
    inspector: pickEnum(settings.inspector, inspectorValues, defaultSettings.inspector),
    fontScale: pickEnum(settings.fontScale, fontScaleValues, defaultSettings.fontScale),
    searchLimit: clampNumber(settings.searchLimit, 8, 80, defaultSettings.searchLimit),
    showUnknownCandidates: typeof settings.showUnknownCandidates === "boolean" ? settings.showUnknownCandidates : defaultSettings.showUnknownCandidates
  };
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
}

createRoot(document.getElementById("root")!).render(<App />);
