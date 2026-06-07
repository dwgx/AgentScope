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
import { useTranslation } from "react-i18next";
import type { LanguageSetting } from "@agentscope/i18n";
import type {
  AgentKind,
  AgentProcess,
  AgentSession,
  Diagnostic,
  Evidence,
  Relation,
  SessionActivity,
  ScopeSnapshot,
  SessionCandidate
} from "@agentscope/shared";
import { i18n, resolveAppLocale } from "./i18n.js";
import "./styles.css";

type View = "processes" | "sessions" | "graph" | "doctor" | "settings";
type SettingsSection = "general" | "appearance" | "indexing" | "runtime" | "diagnostics";
type ThemeName = "graphite" | "blueprint" | "contrast" | "midnight";
type DensityName = "compact" | "comfortable" | "spacious";
type MotionName = "full" | "reduced" | "off";
type StrongConfidence = "exact" | "indexed" | "heuristic";
type SelectionKey = { type: "session"; agent: AgentKind; id: string } | { type: "process"; pid: number } | null;
type Selection =
  | { type: "session"; value: AgentSession }
  | { type: "process"; value: AgentProcess }
  | null;

interface AppInfo {
  userData: string;
  locale: string;
  home: string;
  codexHome: string;
  claudeHome: string;
  githubUrl: string;
  actionsUrl: string;
  issuesUrl: string;
  readmeUrl: string;
}

interface AppSettings {
  language: LanguageSetting;
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
  language: "system",
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
const languageValues: LanguageSetting[] = ["system", "en-US", "zh-CN", "ja-JP", "ko-KR"];
const densityValues: DensityName[] = ["compact", "comfortable", "spacious"];
const motionValues: MotionName[] = ["full", "reduced", "off"];
const defaultViewValues: AppSettings["defaultView"][] = [
  "processes",
  "sessions",
  "graph",
  "doctor"
];
const inspectorValues: AppSettings["inspector"][] = ["right", "hidden"];
const fontScaleValues: AppSettings["fontScale"][] = ["small", "normal", "large"];
const accentValues = ["#b8c2cc", "#4aa3ff", "#8b5cf6", "#f59e0b", "#f43f5e", "#e5e7eb"] as const;

function App() {
  const { t } = useTranslation();
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
      const [nextSnapshot, nextDoctor] = await Promise.all([
        window.agentscope.getSnapshot(),
        window.agentscope.getDoctor()
      ]);
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

  useEffect(() => {
    const locale = resolveAppLocale(settings.language, appInfo?.locale);
    void i18n.changeLanguage(locale);
    document.documentElement.lang = locale;
  }, [settings.language, appInfo?.locale]);

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
    setToast(
      result.canceled
        ? t("toast.snapshotCanceled")
        : t("toast.snapshotExported", { path: result.path })
    );
  }

  async function openExternal(url: string) {
    const opened = await window.agentscope.openExternal(url);
    setToast(opened ? t("toast.externalOpened", { url }) : t("toast.externalBlocked", { url }));
  }

  async function openPath(targetPath?: string) {
    if (!targetPath) return;
    const result = await window.agentscope.openPath(targetPath);
    setToast(
      result
        ? t("toast.openFailed", { message: result })
        : t("toast.pathOpened", { path: targetPath })
    );
  }

  async function revealPath(targetPath?: string) {
    if (!targetPath) return;
    await window.agentscope.revealPath(targetPath);
    setToast(t("toast.pathRevealed", { path: targetPath }));
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
      <Sidebar
        view={view}
        setView={setView}
        warnings={counts.warnings}
        loading={loading}
        onRefresh={() => void refresh()}
      />
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
                selectedKey={selected?.type === "session" ? sessionKey(selected.value) : undefined}
                onSelect={(session) => setSelectionKey({ type: "session", agent: session.agent, id: session.sessionId })}
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
          {settings.inspector === "right" && (
            <Inspector
              selected={selected}
              relations={relations}
              showUnknownCandidates={settings.showUnknownCandidates}
            />
          )}
        </div>
      </section>
      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </main>
  );
}

function Sidebar(props: {
  view: View;
  setView: (view: View) => void;
  warnings: number;
  loading: boolean;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
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
          <p>{t("app.tagline")}</p>
        </div>
      </div>
      <nav className="nav">
        <NavButton
          active={props.view === "processes"}
          icon={<Activity size={17} />}
          label={t("nav.processes")}
          onClick={() => props.setView("processes")}
        />
        <NavButton
          active={props.view === "sessions"}
          icon={<LayoutList size={17} />}
          label={t("nav.sessions")}
          onClick={() => props.setView("sessions")}
        />
        <NavButton
          active={props.view === "graph"}
          icon={<GitBranch size={17} />}
          label={t("nav.relations")}
          onClick={() => props.setView("graph")}
        />
        <NavButton
          active={props.view === "doctor"}
          icon={<ShieldCheck size={17} />}
          label={t("nav.doctor")}
          badge={props.warnings}
          onClick={() => props.setView("doctor")}
        />
      </nav>
      <div className="navSection">{t("nav.system")}</div>
      <nav className="nav">
        <NavButton
          active={props.view === "settings"}
          icon={<Settings size={17} />}
          label={t("nav.settings")}
          onClick={() => props.setView("settings")}
        />
      </nav>
      <button className="refreshButton" onClick={props.onRefresh}>
        <RefreshCw size={16} className={props.loading ? "spin" : ""} />
        <span>{t("nav.refreshIndex")}</span>
      </button>
    </aside>
  );
}

function NavButton(props: {
  active: boolean;
  icon: ReactNode;
  label: string;
  badge?: number;
  onClick: () => void;
}) {
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
  counts: {
    sessions: number;
    processes: number;
    codex: number;
    claude: number;
    matched: number;
    warnings: number;
  };
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
  const { t } = useTranslation();
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
          placeholder={t("command.searchPlaceholder")}
        />
      </div>
      <div className="statusChips">
        <StatusChip label={t("command.proc")} value={props.counts.processes} />
        <StatusChip label={t("command.matched")} value={props.counts.matched} />
        <StatusChip label="Codex" value={props.counts.codex} />
        <StatusChip label="Claude" value={props.counts.claude} />
        <StatusChip
          label={t("command.warn")}
          value={props.counts.warnings}
          tone={props.counts.warnings ? "warn" : "ok"}
        />
      </div>
      <button className="iconButton" title={t("command.refreshTitle")} onClick={props.onRefresh}>
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
  const { t } = useTranslation();
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
      <MenuButton label={t("menu.file.label")} open={open} setOpen={setOpen}>
        <MenuItem
          icon={<Download size={15} />}
          label={t("menu.file.exportSnapshot")}
          detail={t("menu.detail.json")}
          disabled={!props.snapshot}
          onClick={() => run(props.onExport)}
        />
        <MenuItem
          icon={<FolderOpen size={15} />}
          label={t("menu.file.openAppData")}
          detail={t("menu.detail.logs")}
          disabled={!props.appInfo?.userData}
          onClick={() => run(() => props.onOpenPath(props.appInfo?.userData))}
        />
        <MenuItem
          icon={<FolderOpen size={15} />}
          label={t("menu.file.openCodexHome")}
          detail=".codex"
          disabled={!props.appInfo?.codexHome}
          onClick={() => run(() => props.onOpenPath(props.appInfo?.codexHome))}
        />
        <MenuItem
          icon={<FolderOpen size={15} />}
          label={t("menu.file.openClaudeHome")}
          detail=".claude"
          disabled={!props.appInfo?.claudeHome}
          onClick={() => run(() => props.onOpenPath(props.appInfo?.claudeHome))}
        />
        <MenuDivider />
        <MenuItem
          icon={<RefreshCw size={15} />}
          label={t("menu.file.reloadWindow")}
          onClick={() => run(() => void window.agentscope.reloadApp())}
        />
        <MenuItem
          icon={<X size={15} />}
          label={t("menu.file.quit")}
          onClick={() => run(() => void window.agentscope.quitApp())}
        />
      </MenuButton>
      <MenuButton label={t("menu.view.label")} open={open} setOpen={setOpen}>
        <MenuItem
          icon={<Activity size={15} />}
          label={t("nav.processes")}
          active={props.currentView === "processes"}
          onClick={() => run(() => props.onSetView("processes"))}
        />
        <MenuItem
          icon={<LayoutList size={15} />}
          label={t("nav.sessions")}
          active={props.currentView === "sessions"}
          onClick={() => run(() => props.onSetView("sessions"))}
        />
        <MenuItem
          icon={<GitBranch size={15} />}
          label={t("nav.relations")}
          active={props.currentView === "graph"}
          onClick={() => run(() => props.onSetView("graph"))}
        />
        <MenuItem
          icon={<ShieldCheck size={15} />}
          label={t("nav.doctor")}
          active={props.currentView === "doctor"}
          onClick={() => run(() => props.onSetView("doctor"))}
        />
        <MenuItem
          icon={<Settings size={15} />}
          label={t("nav.settings")}
          active={props.currentView === "settings"}
          onClick={() => run(() => props.onSetView("settings"))}
        />
        <MenuDivider />
        <MenuItem
          icon={<Palette size={15} />}
          label={t("menu.view.graphiteTheme")}
          active={props.settings.theme === "graphite"}
          onClick={() => run(() => props.updateSettings({ theme: "graphite" }))}
        />
        <MenuItem
          icon={<Palette size={15} />}
          label={t("menu.view.blueprintTheme")}
          active={props.settings.theme === "blueprint"}
          onClick={() => run(() => props.updateSettings({ theme: "blueprint" }))}
        />
        <MenuItem
          icon={<Palette size={15} />}
          label={t("menu.view.highContrast")}
          active={props.settings.theme === "contrast"}
          onClick={() => run(() => props.updateSettings({ theme: "contrast" }))}
        />
        <MenuItem
          icon={<Palette size={15} />}
          label={t("menu.view.midnightTheme")}
          active={props.settings.theme === "midnight"}
          onClick={() => run(() => props.updateSettings({ theme: "midnight" }))}
        />
        <MenuDivider />
        <MenuItem
          icon={<FileText size={15} />}
          label={t("menu.view.toggleInspector")}
          active={props.settings.inspector === "right"}
          onClick={() =>
            run(() =>
              props.updateSettings({
                inspector: props.settings.inspector === "right" ? "hidden" : "right"
              })
            )
          }
        />
      </MenuButton>
      <MenuButton label={t("menu.trace.label")} open={open} setOpen={setOpen}>
        <MenuItem
          icon={<RefreshCw size={15} />}
          label={t("menu.trace.refreshIndex")}
          onClick={() => run(props.onRefresh)}
        />
        <MenuItem
          icon={<CircleDot size={15} />}
          label={t("menu.trace.showWeakCandidates")}
          active={props.settings.showUnknownCandidates}
          onClick={() =>
            run(() =>
              props.updateSettings({ showUnknownCandidates: !props.settings.showUnknownCandidates })
            )
          }
        />
        <MenuItem
          icon={<FileJson size={15} />}
          label={t("menu.trace.openSelectedTranscript")}
          detail={t("menu.detail.jsonl")}
          disabled={!selectedTranscript}
          onClick={() => run(() => props.onOpenPath(selectedTranscript))}
        />
        <MenuItem
          icon={<FolderOpen size={15} />}
          label={t("menu.trace.revealSelectedTranscript")}
          disabled={!selectedTranscript}
          onClick={() => run(() => props.onRevealPath(selectedTranscript))}
        />
        <MenuItem
          icon={<FolderOpen size={15} />}
          label={t("menu.trace.openSelectedCwd")}
          disabled={!selectedCwd}
          onClick={() => run(() => props.onOpenPath(selectedCwd))}
        />
        <MenuItem
          icon={<Database size={15} />}
          label={t("menu.trace.revealCodexSqlite")}
          disabled={!props.appInfo?.codexHome}
          onClick={() =>
            run(
              () =>
                props.appInfo && props.onRevealPath(`${props.appInfo.codexHome}\\state_5.sqlite`)
            )
          }
        />
      </MenuButton>
      <MenuButton label={t("menu.help.label")} open={open} setOpen={setOpen}>
        <MenuItem
          icon={<Github size={15} />}
          label={t("menu.help.githubRepository")}
          detail={t("menu.detail.public")}
          disabled={!props.appInfo?.githubUrl}
          onClick={() => run(() => props.appInfo && props.onOpenExternal(props.appInfo.githubUrl))}
        />
        <MenuItem
          icon={<ExternalLink size={15} />}
          label={t("menu.help.githubActions")}
          disabled={!props.appInfo?.actionsUrl}
          onClick={() => run(() => props.appInfo && props.onOpenExternal(props.appInfo.actionsUrl))}
        />
        <MenuItem
          icon={<ExternalLink size={15} />}
          label={t("menu.help.issues")}
          disabled={!props.appInfo?.issuesUrl}
          onClick={() => run(() => props.appInfo && props.onOpenExternal(props.appInfo.issuesUrl))}
        />
        <MenuItem
          icon={<BookOpen size={15} />}
          label={t("menu.help.readme")}
          disabled={!props.appInfo?.readmeUrl}
          onClick={() => run(() => props.appInfo && props.onOpenExternal(props.appInfo.readmeUrl))}
        />
      </MenuButton>
    </div>
  );
}

function MenuButton(props: {
  label: string;
  open: string | null;
  setOpen: (value: string | null) => void;
  children: ReactNode;
}) {
  const active = props.open === props.label;
  return (
    <div className="menuButtonWrap">
      <button
        className={`menuButton ${active ? "active" : ""}`}
        onClick={() => props.setOpen(active ? null : props.label)}
      >
        {props.label}
      </button>
      {active && <div className="menuPanel">{props.children}</div>}
    </div>
  );
}

function MenuItem(props: {
  icon: ReactNode;
  label: string;
  detail?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`menuItem ${props.active ? "active" : ""}`}
      disabled={props.disabled}
      onClick={props.onClick}
    >
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
  const { t, i18n: activeI18n } = useTranslation();
  const locale = activeI18n.resolvedLanguage ?? activeI18n.language;
  if (!props.processes.length) {
    return (
      <EmptyState
        icon={<Activity size={22} />}
        title={t("views.processes.emptyTitle")}
        detail={t("views.processes.emptyDetail")}
      />
    );
  }
  return (
    <>
      <PaneHeader
        title={t("nav.processes")}
        subtitle={t("views.processes.subtitle", { count: props.processes.length })}
      />
      <div className="rows processRows">
        {props.processes.map((process) => {
          const strong = strongCandidates(process);
          const top = strong[0] ?? process.sessionCandidates?.[0];
          const weakOnly = !strong.length && !!top;
          return (
            <button
              className={`processRow ${props.selectedPid === process.pid ? "selected" : ""}`}
              key={process.pid}
              onClick={() => props.onSelect(process)}
            >
              <AgentTile agent={process.agent} />
              <div className="rowMain">
                <div className="rowTop">
                  <span className="rowTitle">{process.windowTitle || process.processName}</span>
                  <span className="rowPid mono">PID {process.pid}</span>
                </div>
                <div className="rowMeta">
                  <span>{process.processName}</span>
                  {process.ppid !== undefined && <span>PPID {process.ppid}</span>}
                  {process.startTime && (
                    <span>
                      {t("common.date.started", { date: formatDate(process.startTime, locale) })}
                    </span>
                  )}
                </div>
                <div className="candidateLine">
                  {top ? (
                    <>
                      <ConfidenceBadge value={top.confidence} />
                      <span className="candidateTitle">{candidateTitle(top)}</span>
                      <span className="scoreBadge">
                        {t("views.processes.score", { score: top.score })}
                      </span>
                      <span>
                        {weakOnly
                          ? t("views.processes.weakEvidence")
                          : (top.reasons[0]?.source ?? t("views.processes.candidate"))}
                      </span>
                    </>
                  ) : (
                    <span className="muted">{t("views.processes.noCandidate")}</span>
                  )}
                </div>
                <div className="rowPath mono">
                  {process.commandLine || process.executablePath || t("common.path.noCommandLine")}
                </div>
              </div>
              <ChevronRight size={16} />
            </button>
          );
        })}
      </div>
    </>
  );
}

function SessionList(props: { sessions: AgentSession[]; selectedKey?: string | undefined; onSelect: (session: AgentSession) => void }) {
  const { t, i18n: activeI18n } = useTranslation();
  const locale = activeI18n.resolvedLanguage ?? activeI18n.language;
  if (!props.sessions.length) {
    return (
      <EmptyState
        icon={<Database size={22} />}
        title={t("views.sessions.emptyTitle")}
        detail={t("views.sessions.emptyDetail")}
      />
    );
  }
  return (
    <>
      <PaneHeader
        title={t("nav.sessions")}
        subtitle={t("views.sessions.subtitle", { count: props.sessions.length })}
      />
      <div className="rows">
        {props.sessions.map((session) => (
          <button
            className={`sessionRow ${props.selectedKey === sessionKey(session) ? "selected" : ""}`}
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
                {session.startedAt && (
                  <span>
                    {t("common.date.started", { date: formatDate(session.startedAt, locale) })}
                  </span>
                )}
                {session.updatedAt && (
                  <span>
                    {t("common.date.updated", { date: formatDate(session.updatedAt, locale) })}
                  </span>
                )}
              </div>
              <div className="rowPath mono">
                {session.cwd || session.transcriptPath || t("common.path.noPathEvidence")}
              </div>
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
  const { t } = useTranslation();
  if (!props.relations.length) {
    return (
      <EmptyState
        icon={<GitBranch size={22} />}
        title={t("views.relations.emptyTitle")}
        detail={t("views.relations.emptyDetail")}
      />
    );
  }
  return (
    <>
      <PaneHeader
        title={t("nav.relations")}
        subtitle={t("views.relations.subtitle", { count: props.relations.length })}
      />
      <div className="relationList">
        {props.relations.map((relation, index) => (
          <div
            className="relationItem"
            key={`${relation.kind}:${relation.sourceId}:${relation.targetId}:${index}`}
          >
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
  const { t } = useTranslation();
  if (!props.checks.length) {
    return (
      <EmptyState
        icon={<ShieldCheck size={22} />}
        title={t("views.doctor.emptyTitle")}
        detail={t("views.doctor.emptyDetail")}
      />
    );
  }
  return (
    <>
      <PaneHeader
        title={t("nav.doctor")}
        subtitle={t("views.doctor.subtitle", { count: props.checks.length })}
      />
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
  const { t } = useTranslation();
  const [section, setSection] = useState<SettingsSection>("general");
  const warnings = props.doctor.filter((item) => item.status === "warn").length;
  return (
    <>
      <PaneHeader title={t("settings.title")} subtitle={t("settings.subtitle")} />
      <div className="settingsShell" key={section}>
        <aside className="settingsNav">
          <SettingsNavItem
            active={section === "general"}
            icon={<SlidersHorizontal size={16} />}
            label={t("settings.sections.general")}
            onClick={() => setSection("general")}
          />
          <SettingsNavItem
            active={section === "appearance"}
            icon={<Palette size={16} />}
            label={t("settings.sections.appearance")}
            onClick={() => setSection("appearance")}
          />
          <SettingsNavItem
            active={section === "indexing"}
            icon={<Database size={16} />}
            label={t("settings.sections.indexing")}
            onClick={() => setSection("indexing")}
          />
          <SettingsNavItem
            active={section === "runtime"}
            icon={<Terminal size={16} />}
            label={t("settings.sections.runtime")}
            onClick={() => setSection("runtime")}
          />
          <SettingsNavItem
            active={section === "diagnostics"}
            icon={<ShieldCheck size={16} />}
            label={t("settings.sections.diagnostics")}
            onClick={() => setSection("diagnostics")}
          />
        </aside>
        <section className="settingsRows animatedPane">
          {section === "general" && (
            <>
              <SettingGroup title={t("settings.sections.general")}>
                <SettingRow
                  label={t("settings.language.label")}
                  detail={t("settings.language.detail")}
                >
                  <SegmentedControl
                    value={props.settings.language}
                    values={[
                      ["system", t("settings.language.system")],
                      ["en-US", t("settings.language.enUS")],
                      ["zh-CN", t("settings.language.zhCN")],
                      ["ja-JP", t("settings.language.jaJP")],
                      ["ko-KR", t("settings.language.koKR")]
                    ]}
                    onChange={(value) =>
                      props.updateSettings({ language: value as LanguageSetting })
                    }
                  />
                </SettingRow>
                <SettingRow
                  label={t("settings.controlMode.label")}
                  detail={t("settings.controlMode.detail")}
                >
                  <Badge text={t("common.status.readOnly")} />
                </SettingRow>
                <SettingRow
                  label={t("settings.defaultView.label")}
                  detail={t("settings.defaultView.detail")}
                >
                  <SegmentedControl
                    value={props.settings.defaultView}
                    values={[
                      ["processes", t("nav.processes")],
                      ["sessions", t("nav.sessions")],
                      ["graph", t("nav.relations")],
                      ["doctor", t("nav.doctor")]
                    ]}
                    onChange={(value) =>
                      props.updateSettings({ defaultView: value as AppSettings["defaultView"] })
                    }
                  />
                </SettingRow>
              </SettingGroup>
              <SettingGroup title={t("settings.sections.workspace")}>
                <SettingRow
                  label={t("settings.inspector.label")}
                  detail={t("settings.inspector.detail")}
                >
                  <SegmentedControl
                    value={props.settings.inspector}
                    values={[
                      ["right", t("settings.inspector.right")],
                      ["hidden", t("settings.inspector.hidden")]
                    ]}
                    onChange={(value) =>
                      props.updateSettings({ inspector: value as AppSettings["inspector"] })
                    }
                  />
                </SettingRow>
                <SettingRow
                  label={t("settings.searchScope.label")}
                  detail={t("settings.searchScope.detail")}
                >
                  <Badge text={t("common.status.local")} tone="ok" />
                </SettingRow>
                <SettingRow
                  label={t("settings.searchLimit.label")}
                  detail={t("settings.searchLimit.detail")}
                >
                  <Stepper
                    value={props.settings.searchLimit}
                    min={8}
                    max={80}
                    step={8}
                    onChange={(value) => props.updateSettings({ searchLimit: value })}
                  />
                </SettingRow>
                <SettingRow
                  label={t("settings.resetUi.label")}
                  detail={t("settings.resetUi.detail")}
                >
                  <ActionButton label={t("common.action.reset")} onClick={props.resetSettings} />
                </SettingRow>
              </SettingGroup>
            </>
          )}
          {section === "appearance" && (
            <>
              <SettingGroup title={t("settings.sections.appearance")}>
                <SettingRow
                  label={t("settings.theme.label")}
                  detail={t(`settings.theme.detail.${props.settings.theme}`)}
                >
                  <SegmentedControl
                    value={props.settings.theme}
                    values={[
                      ["graphite", t("settings.theme.graphite")],
                      ["blueprint", t("settings.theme.blueprint")],
                      ["contrast", t("settings.theme.contrast")],
                      ["midnight", t("settings.theme.midnight")]
                    ]}
                    onChange={(value) => props.updateSettings({ theme: value as ThemeName })}
                  />
                </SettingRow>
                <SettingRow
                  label={t("settings.density.label")}
                  detail={t("settings.density.detail")}
                >
                  <SegmentedControl
                    value={props.settings.density}
                    values={[
                      ["compact", t("settings.density.compact")],
                      ["comfortable", t("settings.density.comfortable")],
                      ["spacious", t("settings.density.spacious")]
                    ]}
                    onChange={(value) => props.updateSettings({ density: value as DensityName })}
                  />
                </SettingRow>
                <SettingRow label={t("settings.accent.label")} detail={t("settings.accent.detail")}>
                  <ColorSwatches
                    value={props.settings.accent}
                    onChange={(accent) => props.updateSettings({ accent })}
                  />
                </SettingRow>
                <SettingRow label={t("settings.motion.label")} detail={t("settings.motion.detail")}>
                  <SegmentedControl
                    value={props.settings.motion}
                    values={[
                      ["full", t("settings.motion.full")],
                      ["reduced", t("settings.motion.reduced")],
                      ["off", t("settings.motion.off")]
                    ]}
                    onChange={(value) => props.updateSettings({ motion: value as MotionName })}
                  />
                </SettingRow>
              </SettingGroup>
              <SettingGroup title={t("settings.sections.typography")}>
                <SettingRow
                  label={t("settings.uiScale.label")}
                  detail={t("settings.uiScale.detail")}
                >
                  <SegmentedControl
                    value={props.settings.fontScale}
                    values={[
                      ["small", t("settings.uiScale.small")],
                      ["normal", t("settings.uiScale.normal")],
                      ["large", t("settings.uiScale.large")]
                    ]}
                    onChange={(value) =>
                      props.updateSettings({ fontScale: value as AppSettings["fontScale"] })
                    }
                  />
                </SettingRow>
                <SettingRow
                  label={t("settings.codeFont.label")}
                  detail={t("settings.codeFont.detail")}
                >
                  <CodeValue value="mono" />
                </SettingRow>
                <SettingRow
                  label={t("settings.links.githubLabel")}
                  detail={t("settings.links.githubDetail")}
                >
                  <ActionButton
                    label="GitHub"
                    onClick={() => props.appInfo && props.onOpenExternal(props.appInfo.githubUrl)}
                    disabled={!props.appInfo}
                  />
                </SettingRow>
                <SettingRow
                  label={t("settings.links.readmeLabel")}
                  detail={t("settings.links.readmeDetail")}
                >
                  <ActionButton
                    label="README"
                    onClick={() => props.appInfo && props.onOpenExternal(props.appInfo.readmeUrl)}
                    disabled={!props.appInfo}
                  />
                </SettingRow>
              </SettingGroup>
            </>
          )}
          {section === "indexing" && (
            <>
              <SettingGroup title={t("settings.sections.codex")}>
                <SettingRow
                  label={t("settings.indexing.sqliteLabel")}
                  detail="%USERPROFILE%\\.codex\\state_5.sqlite"
                >
                  <Badge text={t("common.status.read")} tone="ok" />
                </SettingRow>
                <SettingRow
                  label={t("settings.indexing.codexHomeLabel")}
                  detail={props.appInfo?.codexHome ?? t("common.path.loading")}
                >
                  <ActionButton
                    label={t("common.action.open")}
                    onClick={() => props.onOpenPath(props.appInfo?.codexHome)}
                    disabled={!props.appInfo}
                  />
                </SettingRow>
                <SettingRow
                  label={t("settings.indexing.rolloutLabel")}
                  detail="%USERPROFILE%\\.codex\\sessions\\YYYY\\MM\\DD\\rollout-*.jsonl"
                >
                  <Badge text={t("common.status.stream")} />
                </SettingRow>
                <SettingRow
                  label={t("settings.indexing.spawnEdgesLabel")}
                  detail={t("settings.indexing.spawnEdgesDetail")}
                >
                  <Badge text={t("common.status.indexed")} />
                </SettingRow>
              </SettingGroup>
              <SettingGroup title={t("settings.sections.claude")}>
                <SettingRow
                  label={t("settings.indexing.pidSessionsLabel")}
                  detail="%USERPROFILE%\\.claude\\sessions\\*.json"
                >
                  <Badge text={t("common.status.exact")} tone="ok" />
                </SettingRow>
                <SettingRow
                  label={t("settings.indexing.claudeHomeLabel")}
                  detail={props.appInfo?.claudeHome ?? t("common.path.loading")}
                >
                  <ActionButton
                    label={t("common.action.open")}
                    onClick={() => props.onOpenPath(props.appInfo?.claudeHome)}
                    disabled={!props.appInfo}
                  />
                </SettingRow>
                <SettingRow
                  label={t("settings.indexing.transcriptsLabel")}
                  detail="%USERPROFILE%\\.claude\\projects\\<encoded-cwd>\\<sessionId>.jsonl"
                >
                  <Badge text={t("common.status.resolved")} />
                </SettingRow>
              </SettingGroup>
            </>
          )}
          {section === "runtime" && (
            <>
              <SettingGroup title={t("settings.sections.runtimeCapture")}>
                <SettingRow
                  label={t("settings.runtime.win32Label")}
                  detail={t("settings.runtime.win32Detail", { count: props.processes.length })}
                >
                  <Badge text={t("common.status.on")} tone="ok" />
                </SettingRow>
                <SettingRow
                  label={t("settings.runtime.windowTitlesLabel")}
                  detail={t("settings.runtime.windowTitlesDetail")}
                >
                  <Badge text={t("common.status.on")} tone="ok" />
                </SettingRow>
                <SettingRow
                  label={t("settings.runtime.candidatesLabel")}
                  detail={t("settings.runtime.candidatesDetail", { count: props.sessions.length })}
                >
                  <Badge text={t("common.status.scored")} />
                </SettingRow>
              </SettingGroup>
              <SettingGroup title={t("settings.sections.confidence")}>
                <SettingRow
                  label={t("common.confidence.exact")}
                  detail={t("settings.confidence.exactDetail")}
                >
                  <Badge text="PID" tone="ok" />
                </SettingRow>
                <SettingRow
                  label={t("common.confidence.heuristic")}
                  detail={t("settings.confidence.heuristicDetail")}
                >
                  <Badge text={t("common.status.evidence")} tone="warn" />
                </SettingRow>
                <SettingRow
                  label={t("common.confidence.unknown")}
                  detail={t("settings.confidence.unknownDetail")}
                >
                  <button
                    className={`toggleButton ${props.settings.showUnknownCandidates ? "on" : ""}`}
                    onClick={() =>
                      props.updateSettings({
                        showUnknownCandidates: !props.settings.showUnknownCandidates
                      })
                    }
                  >
                    {props.settings.showUnknownCandidates
                      ? t("common.action.show")
                      : t("common.action.hide")}
                  </button>
                </SettingRow>
              </SettingGroup>
            </>
          )}
          {section === "diagnostics" && (
            <SettingGroup title={t("settings.sections.diagnostics")}>
              <SettingRow
                label={t("settings.diagnostics.warningsLabel")}
                detail={t("settings.diagnostics.warningsDetail", { count: warnings })}
              >
                <Badge
                  text={warnings ? String(warnings) : t("common.status.ok")}
                  tone={warnings ? "warn" : "ok"}
                />
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

function SettingsNavItem(props: {
  active?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
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

function SegmentedControl(props: {
  value: string;
  values: Array<string | [string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <span className="segmented">
      {props.values.map((item) => {
        const [value, label] = Array.isArray(item) ? item : [item, item];
        return (
          <button
            className={props.value === value ? "active" : ""}
            key={value}
            onClick={() => props.onChange(value)}
          >
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

function Stepper(props: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  const change = (delta: number) =>
    props.onChange(Math.min(props.max, Math.max(props.min, props.value + delta)));
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

function Inspector(props: {
  selected: Selection;
  relations: Relation[];
  showUnknownCandidates: boolean;
}) {
  const { t, i18n: activeI18n } = useTranslation();
  const locale = activeI18n.resolvedLanguage ?? activeI18n.language;
  if (!props.selected) {
    return (
      <aside className="inspector">
        <EmptyState
          icon={<FileText size={22} />}
          title={t("inspector.nothingTitle")}
          detail={t("inspector.nothingDetail")}
        />
      </aside>
    );
  }

  if (props.selected.type === "process") {
    const process = props.selected.value;
    return (
      <aside className="inspector">
        <InspectorHeader
          title={process.windowTitle || process.processName}
          subtitle={`PID ${process.pid}`}
          agent={process.agent}
        />
        <FieldGroup title={t("inspector.likelySessions")}>
          <CandidateList
            candidates={process.sessionCandidates ?? []}
            showUnknown={props.showUnknownCandidates}
          />
        </FieldGroup>
        <FieldGroup title={t("inspector.runtime")}>
          <Field label={t("inspector.fields.pid")} value={process.pid} />
          <Field label={t("inspector.fields.ppid")} value={process.ppid} />
          <Field label={t("inspector.fields.title")} value={process.windowTitle} />
          <Field
            label={t("inspector.fields.started")}
            value={formatMaybeDate(process.startTime ?? process.creationDate, locale)}
          />
          <Field
            label={t("inspector.fields.executable")}
            value={process.executablePath}
            mono
            long
          />
          <Field label={t("inspector.fields.command")} value={process.commandLine} mono long />
        </FieldGroup>
        <EvidenceList evidence={process.evidence} />
      </aside>
    );
  }

  const session = props.selected.value;
  const related = props.relations.filter(
    (relation) => relation.sourceId === session.sessionId || relation.targetId === session.sessionId
  );
  return (
    <aside className="inspector">
      <InspectorHeader
        title={displayTitle(session)}
        subtitle={session.cwd || t("inspector.noCwdEvidence")}
        agent={session.agent}
      />
      <FieldGroup title={t("inspector.identity")}>
        <Field label={t("inspector.fields.session")} value={session.sessionId} mono />
        <Field
          label={t("inspector.fields.confidence")}
          value={<ConfidenceBadge value={session.confidence} />}
        />
        <Field label={t("inspector.fields.status")} value={session.status} />
        <Field
          label={t("inspector.fields.started")}
          value={formatMaybeDate(session.startedAt, locale)}
        />
        <Field
          label={t("inspector.fields.updated")}
          value={formatMaybeDate(session.updatedAt, locale)}
        />
      </FieldGroup>
      <FieldGroup title={t("inspector.runtime")}>
        <Field label={t("inspector.fields.pid")} value={session.pid} />
        <Field label={t("inspector.fields.ppid")} value={session.ppid} />
        <Field label={t("inspector.fields.name")} value={session.processName} />
        <Field label={t("inspector.fields.command")} value={session.commandLine} mono long />
      </FieldGroup>
      <FieldGroup title={t("inspector.transcript")}>
        <Field label={t("inspector.fields.path")} value={session.transcriptPath} mono long />
        <Field label={t("inspector.fields.index")} value={session.indexSource} />
        <Field label={t("inspector.fields.parent")} value={session.parentSessionId} mono />
        <Field
          label={t("inspector.fields.children")}
          value={session.childSessionIds.length ? session.childSessionIds.join(", ") : undefined}
          mono
          long
        />
      </FieldGroup>
      <MetadataSummary metadata={session.indexMetadata} />
      <ActivitySummary activity={session.activity} locale={locale} />
      {related.length > 0 && (
        <FieldGroup title={t("inspector.relations")}>
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

function ActivitySummary(props: { activity?: SessionActivity | undefined; locale?: string }) {
  const { t } = useTranslation();
  const activity = props.activity;
  if (!activity) {
    return (
      <FieldGroup title={t("inspector.activity")}>
        <p className="muted">{t("inspector.noActivity")}</p>
      </FieldGroup>
    );
  }
  const usage = activity.tokenUsage;
  return (
    <FieldGroup title={t("inspector.activity")}>
      <Field label={t("inspector.fields.lines")} value={formatNumber(activity.lineCount, props.locale)} />
      <Field label={t("inspector.fields.bytes")} value={formatBytes(activity.byteSize, props.locale)} />
      <Field label={t("inspector.fields.firstEvent")} value={formatMaybeDate(activity.firstTimestamp, props.locale)} />
      <Field label={t("inspector.fields.lastEvent")} value={formatMaybeDate(activity.lastTimestamp, props.locale)} />
      <Field label={t("inspector.fields.cliVersion")} value={activity.cliVersion} />
      <Field label={t("inspector.fields.gitBranch")} value={activity.gitBranch} />
      <Field label={t("inspector.fields.permission")} value={activity.permissionMode} />
      <Field label={t("inspector.fields.mode")} value={activity.mode} />
      <Field label={t("inspector.fields.compacted")} value={activity.compactedCount} />
      <Field label={t("inspector.fields.sidechain")} value={activity.sidechainCount} />
      <Field label={t("inspector.fields.parseErrors")} value={activity.parseErrors} />
      <StatChips title={t("inspector.topEvents")} values={activity.eventCounts} />
      <StatChips title={t("inspector.models")} values={activity.modelCounts} />
      <StatChips title={t("inspector.topTools")} values={activity.toolCounts} />
      {usage && (
        <div className="activityBlock">
          <h4>{t("inspector.tokens")}</h4>
          <div className="statChips">
            <StatChip label={t("inspector.fields.inputTokens")} value={usage.inputTokens} locale={props.locale} />
            <StatChip label={t("inspector.fields.outputTokens")} value={usage.outputTokens} locale={props.locale} />
            <StatChip label={t("inspector.fields.cacheRead")} value={usage.cacheReadInputTokens} locale={props.locale} />
            <StatChip label={t("inspector.fields.cacheWrite")} value={usage.cacheCreationInputTokens} locale={props.locale} />
          </div>
        </div>
      )}
    </FieldGroup>
  );
}

function StatChips(props: { title: string; values?: Record<string, number> | undefined }) {
  const entries = topEntries(props.values, 8);
  if (!entries.length) return null;
  return (
    <div className="activityBlock">
      <h4>{props.title}</h4>
      <div className="statChips">
        {entries.map(([label, value]) => (
          <StatChip key={label} label={label} value={value} />
        ))}
      </div>
    </div>
  );
}

function StatChip(props: { label: string; value?: number | undefined; locale?: string | undefined }) {
  if (props.value === undefined) return null;
  return (
    <span className="statChip">
      <span>{props.label}</span>
      <strong>{formatNumber(props.value, props.locale)}</strong>
    </span>
  );
}

function CandidateList(props: { candidates: SessionCandidate[]; showUnknown: boolean }) {
  const { t } = useTranslation();
  const candidates = props.showUnknown
    ? props.candidates
    : props.candidates.filter((candidate) => candidate.confidence !== "unknown");
  if (!candidates.length) return <p className="muted blockText">{t("inspector.noCandidate")}</p>;
  return (
    <div className="candidateList">
      {candidates.map((candidate) => (
        <div className="candidateItem" key={`${candidate.agent}:${candidate.sessionId}`}>
          <div className="candidateHead">
            <AgentPill agent={candidate.agent} />
            <span className="mono">{short(candidate.sessionId)}</span>
            <ConfidenceBadge value={candidate.confidence} />
            <span className="scoreBadge">
              {t("views.processes.score", { score: candidate.score })}
            </span>
          </div>
          <strong>{candidateTitle(candidate)}</strong>
          <span className="mono">
            {candidate.cwd || candidate.transcriptPath || t("common.path.noPath")}
          </span>
          <div className="reasonList">
            {(candidate.scoreParts ?? candidate.reasons.map((reason) => ({ ...reason, points: 0 }))).map(
              (reason, index) => (
                <div className="scorePart" key={`${reason.source}:${index}`}>
                  <strong>{reason.points ? `+${reason.points}` : ""}</strong>
                  <span>{reason.source.replace("process.match.", "")}</span>
                  {reason.field && <em>{reason.field}</em>}
                  <p>{reason.detail}</p>
                </div>
              )
            )}
            {candidate.confidence === "unknown" && (
              <Badge text={t("views.processes.weakEvidence")} />
            )}
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
  const { t } = useTranslation();
  return (
    <FieldGroup title={t("inspector.evidence")}>
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
        <p className="muted">{t("inspector.noEvidence")}</p>
      )}
    </FieldGroup>
  );
}

function MetadataSummary(props: { metadata?: Record<string, unknown> | undefined }) {
  const { t } = useTranslation();
  const entries = Object.entries(props.metadata ?? {}).filter(([, value]) => value !== undefined && value !== null && value !== "");
  if (!entries.length) return null;
  return (
    <FieldGroup title={t("inspector.indexMetadata")}>
      <div className="metadataGrid">
        {entries.slice(0, 18).map(([key, value]) => (
          <span className="metadataItem" key={key}>
            <em>{key}</em>
            <strong className={typeof value === "number" ? "" : "mono"}>{String(value)}</strong>
          </span>
        ))}
      </div>
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
          <strong>{searchResultTitle(result)}</strong>
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
  const { t } = useTranslation();
  return (
    <div className={`agentTile ${props.agent}`}>
      <AgentIcon agent={props.agent} />
      <span>{t(`common.agent.${props.agent}`)}</span>
    </div>
  );
}

function AgentIcon(props: { agent: string }) {
  if (props.agent === "claude") return <FileJson size={18} />;
  if (props.agent === "codex") return <Terminal size={18} />;
  return <Activity size={18} />;
}

function AgentPill(props: { agent: string }) {
  const { t } = useTranslation();
  const key =
    props.agent === "codex" || props.agent === "claude"
      ? `common.agent.${props.agent}`
      : "common.agent.unknown";
  return <span className={`agentPill ${props.agent}`}>{t(key)}</span>;
}

function Badge(props: { text: string; tone?: "ok" | "warn" | undefined }) {
  return <span className={`badge ${props.tone ?? ""}`}>{props.text}</span>;
}

function ConfidenceBadge(props: { value: string }) {
  const { t } = useTranslation();
  const tone = props.value === "exact" ? "ok" : props.value === "heuristic" ? "warn" : undefined;
  const key =
    props.value === "exact" ||
    props.value === "indexed" ||
    props.value === "heuristic" ||
    props.value === "unknown"
      ? `common.confidence.${props.value}`
      : undefined;
  return <Badge text={key ? t(key) : props.value} tone={tone} />;
}

function isStrongConfidence(value: string): value is StrongConfidence {
  return value === "exact" || value === "indexed" || value === "heuristic";
}

function strongCandidates(process: AgentProcess) {
  return (process.sessionCandidates ?? []).filter((candidate) =>
    isStrongConfidence(candidate.confidence)
  );
}

function EvidenceSummary(props: { evidence: Evidence[] }) {
  const { t } = useTranslation();
  const text = props.evidence
    .slice(0, 3)
    .map((item) => item.source)
    .join(" / ");
  return <div className="evidenceSummary">{text || t("inspector.noEvidence")}</div>;
}

function firstSelectionKey(snapshot: ScopeSnapshot): SelectionKey {
  if (snapshot.processes.length) return { type: "process", pid: snapshot.processes[0]!.pid };
  if (snapshot.sessions.length) {
    const session = snapshot.sessions.at(-1)!;
    return { type: "session", agent: session.agent, id: session.sessionId };
  }
  return null;
}

function resolveSelection(
  key: SelectionKey,
  sessions: AgentSession[],
  processes: AgentProcess[]
): Selection {
  if (key?.type === "process") {
    const process = processes.find((item) => item.pid === key.pid);
    return process ? { type: "process", value: process } : null;
  }
  if (key?.type === "session") {
    const session = sessions.find((item) => item.agent === key.agent && item.sessionId === key.id);
    return session ? { type: "session", value: session } : null;
  }
  return null;
}

function sessionKey(session: AgentSession): string {
  return `${session.agent}:${session.sessionId}`;
}

function candidateTitle(candidate: SessionCandidate) {
  return candidate.title || short(candidate.sessionId);
}

function searchResultTitle(result: Record<string, unknown>): string {
  if (result.title) return String(result.title);
  const eventType = result.eventType ? String(result.eventType) : "jsonl";
  const line = result.line ? `line ${String(result.line)}` : "";
  const fields = Array.isArray(result.matchedFields) && result.matchedFields.length
    ? `fields ${result.matchedFields.map(String).join(", ")}`
    : "";
  return [eventType, line, fields, result.path ? String(result.path) : ""].filter(Boolean).join(" · ");
}

function selectedTranscriptPath(selection: Selection): string | undefined {
  if (!selection) return undefined;
  if (selection.type === "session") return selection.value.transcriptPath;
  return strongCandidates(selection.value).find((candidate) => candidate.transcriptPath)
    ?.transcriptPath;
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

function topEntries(values: Record<string, number> | undefined, limit: number): Array<[string, number]> {
  return Object.entries(values ?? {})
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

function formatNumber(value: number | undefined, locale?: string): string | undefined {
  return value === undefined ? undefined : new Intl.NumberFormat(locale).format(value);
}

function formatBytes(value: number | undefined, locale?: string): string | undefined {
  if (value === undefined) return undefined;
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value / 1024) + " KB";
}

function formatDate(value: string, locale?: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatMaybeDate(value: string | undefined, locale?: string) {
  return value ? formatDate(value, locale) : undefined;
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
    language: pickEnum(settings.language, languageValues, defaultSettings.language),
    theme: pickEnum(settings.theme, themeValues, defaultSettings.theme),
    density: pickEnum(settings.density, densityValues, defaultSettings.density),
    motion: pickEnum(settings.motion, motionValues, defaultSettings.motion),
    accent: pickEnum(settings.accent, [...accentValues], defaultSettings.accent),
    defaultView: pickEnum(settings.defaultView, defaultViewValues, defaultSettings.defaultView),
    inspector: pickEnum(settings.inspector, inspectorValues, defaultSettings.inspector),
    fontScale: pickEnum(settings.fontScale, fontScaleValues, defaultSettings.fontScale),
    searchLimit: clampNumber(settings.searchLimit, 8, 80, defaultSettings.searchLimit),
    showUnknownCandidates:
      typeof settings.showUnknownCandidates === "boolean"
        ? settings.showUnknownCandidates
        : defaultSettings.showUnknownCandidates
  };
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;
}

createRoot(document.getElementById("root")!).render(<App />);
