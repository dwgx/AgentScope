import {
  AlertTriangle,
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Cpu,
  Database,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  Github,
  MessagesSquare,
  Network,
  Palette,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  Stethoscope,
  Workflow,
  X
} from "lucide-react";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
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
  SessionOperationPlanResult,
  ScopeSnapshot,
  SessionCandidate
} from "@agentscope/shared";
import { i18n, resolveAppLocale } from "./i18n.js";
import claudeLogoUrl from "./assets/claude-color.svg";
import codexLogoUrl from "./assets/codex-color.svg";
import "./styles.css";

type View = "processes" | "sessions" | "graph" | "doctor" | "settings";
type SettingsSection = "general" | "appearance" | "indexing" | "runtime" | "diagnostics";
type ThemeName = "graphite" | "blueprint" | "contrast" | "midnight";
type DensityName = "compact" | "comfortable" | "spacious";
type MotionName = "full" | "reduced" | "off";
type FontMode = "language" | "unified" | "custom";
type FontPreset = "windows" | "language" | "claude" | "japaneseTextbook" | "dense" | "custom";
type StrongConfidence = "exact" | "indexed" | "heuristic";
type ProcessSortMode = "time" | "memory" | "runtime" | "score" | "tree";
type ProcessGroupMode = "agent" | "parent" | "cwd" | "none";
type SessionGroupMode = "agent" | "cwd" | "parent" | "none";
type SelectionKey =
  | { type: "session"; agent: AgentKind; id: string }
  | { type: "process"; pid: number }
  | null;
type Selection =
  | { type: "session"; value: AgentSession }
  | { type: "process"; value: AgentProcess }
  | null;
type RelationSide = "source" | "target";

interface SearchResultRecord extends Record<string, unknown> {
  agent?: string;
  sessionId?: string;
  source?: string;
  path?: string;
  line?: number;
  query?: string;
}

interface SearchSuggestion {
  label: string;
  detail: string;
  query?: string;
  targetView?: View;
}

interface NoticeAction {
  label: string;
  onClick: () => void;
}

interface NoticeState {
  id: number;
  message: string;
  detail?: string | undefined;
  actions?: NoticeAction[] | undefined;
}

interface ConfirmState {
  title: string;
  detail: string;
  confirmLabel: string;
  danger?: boolean | undefined;
  onConfirm: () => void;
}

interface TranscriptContext {
  path: string;
  line: number;
  query?: string;
  eventType?: string;
  timestamp?: string;
  excerpt?: string;
}

interface RelationEndpointDisplay {
  title: string;
  detail?: string;
  raw: string;
}

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
  runtimeWin32Enabled: boolean;
  runtimeWindowTitlesEnabled: boolean;
  runtimeCandidatesEnabled: boolean;
  defaultView: Exclude<View, "settings">;
  inspector: "right" | "hidden";
  fontScale: "small" | "normal" | "large";
  fontMode: FontMode;
  fontPreset: FontPreset;
  unifiedFont: string;
  latinFont: string;
  chineseFont: string;
  japaneseFont: string;
  koreanFont: string;
  codeFont: string;
  uiLineHeight: "compact" | "normal" | "spacious";
  searchLimit: number;
  suggestionsEnabled: boolean;
  transcriptPreviewEnabled: boolean;
  showUnknownCandidates: boolean;
}

const settingsKey = "agentscope.settings.v2";
const defaultSettings: AppSettings = {
  language: "system",
  theme: "graphite",
  density: "compact",
  motion: "full",
  accent: "#b8c2cc",
  runtimeWin32Enabled: true,
  runtimeWindowTitlesEnabled: true,
  runtimeCandidatesEnabled: true,
  defaultView: "processes",
  inspector: "right",
  fontScale: "normal",
  fontMode: "language",
  fontPreset: "language",
  unifiedFont: "Segoe UI Variable Text",
  latinFont: "Segoe UI Variable Text",
  chineseFont: "Microsoft YaHei UI",
  japaneseFont: "Yu Gothic UI",
  koreanFont: "Malgun Gothic",
  codeFont: "Cascadia Code",
  uiLineHeight: "normal",
  searchLimit: 24,
  suggestionsEnabled: true,
  transcriptPreviewEnabled: true,
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
const fontModeValues: FontMode[] = ["language", "unified", "custom"];
const fontPresetValues: FontPreset[] = [
  "windows",
  "language",
  "claude",
  "japaneseTextbook",
  "dense",
  "custom"
];
const lineHeightValues: AppSettings["uiLineHeight"][] = ["compact", "normal", "spacious"];
const accentValues = ["#b8c2cc", "#4aa3ff", "#8b5cf6", "#f59e0b", "#f43f5e", "#e5e7eb"] as const;

function App() {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<ScopeSnapshot | null>(null);
  const [doctor, setDoctor] = useState<Diagnostic[]>([]);
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [view, setViewState] = useState<View>(settings.defaultView);
  const [viewHistory, setViewHistory] = useState<View[]>([]);
  const [selectionKey, setSelectionKey] = useState<SelectionKey>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultRecord[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlightTarget, setHighlightTarget] = useState<SearchResultRecord | null>(null);
  const searchDebounceRef = useRef<number | undefined>(undefined);
  const searchRequestIdRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmState | null>(null);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [installedFonts, setInstalledFonts] = useState<string[]>([]);

  function updateSettings(patch: Partial<AppSettings>) {
    setSettings((current) => {
      const next = { ...current, ...patch };
      saveSettings(next);
      return next;
    });
  }

  function navigateView(nextView: View) {
    setViewState((current) => {
      if (current === nextView) return current;
      setViewHistory((history) => [current, ...history.filter((item) => item !== current)].slice(0, 16));
      return nextView;
    });
  }

  function goBack() {
    setViewHistory((history) => {
      const [previous, ...rest] = history;
      if (previous) {
        setViewState(previous);
        return rest;
      }
      setViewState((current) => (current === settings.defaultView ? current : settings.defaultView));
      return [];
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
    void window.agentscope.listFonts().then((fonts) => setInstalledFonts(fonts));
  }, []);

  useEffect(() => {
    const locale = resolveAppLocale(settings.language, appInfo?.locale);
    void i18n.changeLanguage(locale);
    document.documentElement.lang = locale;
  }, [settings.language, appInfo?.locale]);

  useEffect(() => {
    const openGlobalSearch = (event: KeyboardEvent) => {
      const isFind = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f";
      if (isFind) {
        event.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (event.key !== "Escape") return;
      if (searchOpen) {
        event.preventDefault();
        setSearchOpen(false);
        return;
      }
      if (viewHistory.length > 0 || view !== settings.defaultView) {
        event.preventDefault();
        goBack();
      }
    };
    window.addEventListener("keydown", openGlobalSearch);
    return () => window.removeEventListener("keydown", openGlobalSearch);
  }, [searchOpen, settings.defaultView, view, viewHistory.length]);

  useEffect(() => {
    if (!searchOpen) return undefined;
    window.clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = window.setTimeout(() => {
      void runSearchText(query);
    }, query.trim() ? 180 : 0);
    return () => window.clearTimeout(searchDebounceRef.current);
  }, [query, searchOpen, settings.searchLimit]);

  async function runSearch() {
    await runSearchText(query);
  }

  async function runSearchText(value: string) {
    const requestId = (searchRequestIdRef.current += 1);
    if (!value.trim()) {
      setResults([]);
      return;
    }
    const trimmed = value.trim();
    const nextResults = await window.agentscope.search(trimmed, settings.searchLimit);
    if (requestId !== searchRequestIdRef.current) return;
    setResults(nextResults.map((result) => ({ ...result, query: trimmed })));
  }

  function clearSearchState() {
    searchRequestIdRef.current += 1;
    window.clearTimeout(searchDebounceRef.current);
    setQuery("");
    setResults([]);
    setHighlightTarget(null);
  }

  async function exportCurrentSnapshot() {
    if (!snapshot) return;
    const result = await window.agentscope.exportSnapshot();
    showNotice(
      result.canceled
        ? { message: t("toast.snapshotCanceled") }
        : {
            message: t("toast.snapshotExported"),
            detail: result.path,
            actions: noticePathActions(result.path)
          }
    );
  }

  async function openExternal(url: string) {
    const opened = await window.agentscope.openExternal(url);
    showNotice({ message: opened ? t("toast.externalOpened") : t("toast.externalBlocked"), detail: url });
  }

  async function openPath(targetPath?: string) {
    if (!targetPath) return;
    const result = await window.agentscope.openPath(targetPath);
    showNotice(
      result
        ? { message: t("toast.openFailed", { message: result }) }
        : { message: t("toast.pathOpened"), detail: targetPath, actions: noticePathActions(targetPath) }
    );
  }

  async function revealPath(targetPath?: string) {
    if (!targetPath) return;
    await window.agentscope.revealPath(targetPath);
    showNotice({ message: t("toast.pathRevealed"), detail: targetPath, actions: noticePathActions(targetPath) });
  }

  async function backupSelectedSession(session: AgentSession) {
    try {
      const result = await window.agentscope.backupSession(session.agent, session.sessionId);
      showNotice({
        message: t("toast.sessionBackedUp"),
        detail: result.backupDir,
        actions: noticePathActions(result.manifestPath)
      });
      await window.agentscope.revealPath(result.manifestPath);
    } catch (error) {
      showNotice({ message: t("toast.operationFailed", { message: errorMessage(error) }) });
    }
  }

  async function deleteSelectedSession(session: AgentSession) {
    try {
      const planResult = await window.agentscope.writeDeletePlan(session.agent, session.sessionId);
      setConfirmDialog({
        title: t("confirm.deleteSessionTitle"),
        detail: t("confirm.deleteSession", {
          title: displayTitle(session),
          backupDir: planResult.backupDir ?? "",
          quarantineDir: planResult.quarantineDir ?? "",
          journalPath: planResult.journalPath ?? ""
        }),
        confirmLabel: t("inspector.actions.deleteSession"),
        danger: true,
        onConfirm: () => void executeDeleteSession(session, planResult)
      });
    } catch (error) {
      showNotice({ message: t("toast.operationFailed", { message: errorMessage(error) }) });
    }
  }

  async function executeDeleteSession(session: AgentSession, planResult?: SessionOperationPlanResult) {
    try {
      const result = await window.agentscope.deleteSession(session.agent, session.sessionId, planResult?.plan.createdAt);
      showNotice({
        message: t("toast.sessionDeleted"),
        detail: result.journalPath,
        actions: [
          { label: t("common.action.revealJournal"), onClick: () => void window.agentscope.revealPath(result.journalPath) },
          ...noticePathActions(result.quarantineDir)
        ]
      });
      await window.agentscope.revealPath(result.quarantineDir);
      await refresh();
    } catch (error) {
      const journalPath = journalPathFromError(errorMessage(error));
      showNotice({
        message: t("toast.operationFailed", { message: errorMessage(error) }),
        detail: journalPath,
        actions: journalPath ? [{ label: t("common.action.revealJournal"), onClick: () => void window.agentscope.revealPath(journalPath) }] : undefined
      });
    }
  }

  async function chooseImportSession() {
    try {
      const result = await window.agentscope.chooseImportSession();
      if ("backupDir" in result) {
        showNotice({
          message: t("toast.sessionImported"),
          detail: result.backupDir,
          actions: noticePathActions(result.backupDir)
        });
        await refresh();
      } else {
        showNotice({ message: t("toast.importPlanCanceled") });
      }
    } catch (error) {
      showNotice({ message: t("toast.operationFailed", { message: errorMessage(error) }) });
    }
  }

  function noticePathActions(targetPath?: string): NoticeAction[] {
    if (!targetPath) return [];
    return [
      { label: t("common.action.reveal"), onClick: () => void window.agentscope.revealPath(targetPath) },
      { label: t("common.action.open"), onClick: () => void openPath(targetPath) }
    ];
  }

  function showNotice(next: Omit<NoticeState, "id">) {
    setNotice({ id: Date.now(), ...next });
  }

  const sessions = snapshot?.sessions ?? [];
  const rawProcesses = snapshot?.processes ?? [];
  const processes = useMemo(
    () => visibleProcesses(rawProcesses, settings),
    [
      rawProcesses,
      settings.runtimeWin32Enabled,
      settings.runtimeWindowTitlesEnabled,
      settings.runtimeCandidatesEnabled
    ]
  );
  const relations = snapshot?.relations ?? [];
  const selected = resolveSelection(selectionKey, sessions, processes);
  const activeProcesses = processes.filter((item) => item.agent !== "unknown");
  const matchedProcesses = processes.filter((item) => strongCandidates(item).length > 0).length;
  const initialLoading = snapshot === null && loading;
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
  const suggestions = useMemo(
    () =>
      buildSearchSuggestions(view, selected, sessions, processes, relations, doctor, (key, options) =>
        String(options ? t(key, options) : t(key))
      ),
    [view, selected, sessions, processes, relations, doctor, t]
  );

  return (
    <main
      className="shell"
      data-theme={settings.theme}
      data-density={settings.density}
      data-motion={settings.motion}
      data-inspector={settings.inspector}
      data-font={settings.fontScale}
      data-line-height={settings.uiLineHeight}
      style={
        {
          "--accent": settings.accent,
          ...fontStyleVariables(settings)
        } as CSSProperties
      }
    >
      <Sidebar
        view={view}
        setView={navigateView}
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
          openSearch={() => setSearchOpen(true)}
          counts={counts}
          loading={loading}
          onRefresh={() => void refresh()}
          onExport={() => void exportCurrentSnapshot()}
          onOpenPath={(targetPath) => void openPath(targetPath)}
          onRevealPath={(targetPath) => void revealPath(targetPath)}
          onOpenExternal={(url) => void openExternal(url)}
          onSetView={navigateView}
          settings={settings}
          updateSettings={updateSettings}
        />
        {searchOpen && (
          <CommandPalette
            query={query}
            setQuery={setQuery}
            runSearch={() => void runSearch()}
            runSearchText={(value) => void runSearchText(value)}
            clearSearch={clearSearchState}
            results={results}
            suggestions={settings.suggestionsEnabled ? suggestions : []}
            currentView={view}
            setView={navigateView}
            refresh={() => void refresh()}
            selectResult={(result) => {
              const target = searchResultSelection(result, sessions);
              if (target) {
                setSelectionKey(target);
                navigateView("sessions");
                setHighlightTarget(result);
              }
            }}
            close={() => setSearchOpen(false)}
          />
        )}
        <div className="content" key={settings.inspector}>
          <section className="listPane" key={view}>
            {view === "processes" && (
              <ProcessList
                processes={activeProcesses}
                sessions={sessions}
                selectedPid={selected?.type === "process" ? selected.value.pid : undefined}
                loading={initialLoading}
                runtimeWin32Enabled={settings.runtimeWin32Enabled}
                onSelect={(process) => setSelectionKey({ type: "process", pid: process.pid })}
                onSelectSession={(candidate) =>
                  setSelectionKey({
                    type: "session",
                    agent: candidate.agent,
                    id: candidate.sessionId
                  })
                }
              />
            )}
            {view === "sessions" && (
              <SessionList
                sessions={sessions}
                selectedKey={selected?.type === "session" ? sessionKey(selected.value) : undefined}
                loading={initialLoading}
                highlightTarget={highlightTarget}
                onImportSession={() => void chooseImportSession()}
                onSelect={(session) =>
                  setSelectionKey({ type: "session", agent: session.agent, id: session.sessionId })
                }
                onBackupSession={(session) => void backupSelectedSession(session)}
                onDeleteSession={(session) => void deleteSelectedSession(session)}
                onRevealTranscript={(session) => void revealPath(session.transcriptPath)}
              />
            )}
            {view === "graph" && (
            <RelationList relations={relations} sessions={sessions} loading={initialLoading} />
            )}
            {view === "doctor" && <DoctorPanel checks={doctor} loading={initialLoading} />}
            {view === "settings" && (
              <SettingsPanel
                appInfo={appInfo}
                settings={settings}
                updateSettings={updateSettings}
                resetSettings={resetSettings}
                doctor={doctor}
                processes={rawProcesses}
                sessions={sessions}
                installedFonts={installedFonts}
                onOpenPath={(targetPath) => void openPath(targetPath)}
                onOpenExternal={(url) => void openExternal(url)}
              />
            )}
          </section>
          {settings.inspector === "right" && (
            <Inspector
              selected={selected}
              relations={relations}
              loading={initialLoading}
              showUnknownCandidates={settings.showUnknownCandidates}
              transcriptPreviewEnabled={settings.transcriptPreviewEnabled}
              highlightTarget={highlightTarget}
              onOpenPath={(targetPath) => void openPath(targetPath)}
              onRevealPath={(targetPath) => void revealPath(targetPath)}
              onBackupSession={(session) => void backupSelectedSession(session)}
              onDeleteSession={(session) => void deleteSelectedSession(session)}
            />
          )}
        </div>
      </section>
      {notice && <Notification notice={notice} onClose={() => setNotice(null)} />}
      {confirmDialog && (
        <ConfirmDialog
          value={confirmDialog}
          onClose={() => setConfirmDialog(null)}
        />
      )}
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
          <AgentScopeMark size={21} />
        </div>
        <div>
          <h1>AgentScope</h1>
          <p>{t("app.tagline")}</p>
        </div>
      </div>
      <nav className="nav">
        <NavButton
          active={props.view === "processes"}
          icon={<Workflow size={17} />}
          label={t("nav.processes")}
          onClick={() => props.setView("processes")}
        />
        <NavButton
          active={props.view === "sessions"}
          icon={<MessagesSquare size={17} />}
          label={t("nav.sessions")}
          onClick={() => props.setView("sessions")}
        />
        <NavButton
          active={props.view === "graph"}
          icon={<Network size={17} />}
          label={t("nav.relations")}
          onClick={() => props.setView("graph")}
        />
        <NavButton
          active={props.view === "doctor"}
          icon={<Stethoscope size={17} />}
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
  openSearch: () => void;
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
          onFocus={props.openSearch}
          onClick={props.openSearch}
          onChange={(event) => {
            props.setQuery(event.target.value);
            props.openSearch();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              props.openSearch();
              props.runSearch();
            }
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

  useEffect(() => {
    if (!open) return undefined;
    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".menuText")) return;
      close();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="menuText">
      <MenuButton id="file" label={t("menu.file.label")} open={open} setOpen={setOpen}>
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
      <MenuButton id="view" label={t("menu.view.label")} open={open} setOpen={setOpen}>
        <MenuItem
          icon={<Workflow size={15} />}
          label={t("nav.processes")}
          active={props.currentView === "processes"}
          onClick={() => run(() => props.onSetView("processes"))}
        />
        <MenuItem
          icon={<MessagesSquare size={15} />}
          label={t("nav.sessions")}
          active={props.currentView === "sessions"}
          onClick={() => run(() => props.onSetView("sessions"))}
        />
        <MenuItem
          icon={<Network size={15} />}
          label={t("nav.relations")}
          active={props.currentView === "graph"}
          onClick={() => run(() => props.onSetView("graph"))}
        />
        <MenuItem
          icon={<Stethoscope size={15} />}
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
      <MenuButton id="trace" label={t("menu.trace.label")} open={open} setOpen={setOpen}>
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
          icon={<TranscriptGlyph size={15} />}
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
      <MenuButton id="help" label={t("menu.help.label")} open={open} setOpen={setOpen}>
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
  id: string;
  label: string;
  open: string | null;
  setOpen: (value: string | null) => void;
  children: ReactNode;
}) {
  const active = props.open === props.id;
  return (
    <div className="menuButtonWrap">
      <button
        className={`menuButton ${active ? "active" : ""}`}
        onClick={() => props.setOpen(active ? null : props.id)}
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
  loading: boolean;
  runtimeWin32Enabled: boolean;
  onSelect: (process: AgentProcess) => void;
  onSelectSession: (candidate: SessionCandidate) => void;
}) {
  const { t, i18n: activeI18n } = useTranslation();
  const locale = activeI18n.resolvedLanguage ?? activeI18n.language;
  const [sortMode, setSortMode] = useState<ProcessSortMode>("time");
  const [groupMode, setGroupMode] = useState<ProcessGroupMode>("none");
  const [, startProcessListTransition] = useTransition();
  const [isReordering, setIsReordering] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [contextMenu, setContextMenu] = useState<{
    process: AgentProcess;
    x: number;
    y: number;
  } | null>(null);
  const groups = useMemo(
    () => groupProcesses(props.processes, sortMode, groupMode),
    [props.processes, sortMode, groupMode]
  );
  const toggleGroup = (key: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const reorder = (action: () => void) => {
    setIsReordering(true);
    startProcessListTransition(action);
    window.setTimeout(() => setIsReordering(false), 140);
  };
  if (props.loading) return <LoadingState />;
  if (!props.processes.length) {
    return (
      <EmptyState
        icon={<Workflow size={22} />}
        title={t(
          props.runtimeWin32Enabled
            ? "views.processes.emptyTitle"
            : "views.processes.captureOffTitle"
        )}
        detail={t(
          props.runtimeWin32Enabled
            ? "views.processes.emptyDetail"
            : "views.processes.captureOffDetail"
        )}
      />
    );
  }
  return (
    <>
      <PaneHeader
        title={t("nav.processes")}
        subtitle={t("views.processes.subtitle", { count: props.processes.length })}
      />
      <div className="listToolbar">
        <ToolbarControl label={t("views.processes.sort.label")}>
          <MiniSegmentedControl
            value={sortMode}
            values={["time", "runtime", "memory", "score", "tree"]}
            label={(value) => t(`views.processes.sort.${value}`)}
            onChange={(value) =>
              reorder(() => setSortMode(value as ProcessSortMode))
            }
          />
        </ToolbarControl>
        <ToolbarControl label={t("views.processes.group.label")}>
          <MiniSegmentedControl
            value={groupMode}
            values={["agent", "parent", "cwd", "none"]}
            label={(value) => t(`views.processes.group.${value}`)}
            onChange={(value) =>
              reorder(() => setGroupMode(value as ProcessGroupMode))
            }
          />
        </ToolbarControl>
      </div>
      <div
        className={`rows processRows ${isReordering ? "reordering" : ""}`}
        onContextMenu={(event) => event.preventDefault()}
      >
        {groupMode === "none"
          ? groups[0]?.items.map((process) => (
              <ProcessRow
                key={process.pid}
                process={process}
                selected={props.selectedPid === process.pid}
                locale={locale}
                onSelect={() => props.onSelect(process)}
                onContextMenu={(event) =>
                  setContextMenu({ process, x: event.clientX, y: event.clientY })
                }
              />
            ))
          : groups.map((group) => {
          const isCollapsed = collapsed.has(group.key);
          return (
            <section className="processGroup" key={group.key}>
              <button className="groupHeader" onClick={() => toggleGroup(group.key)}>
                <ChevronRight size={15} className={isCollapsed ? "" : "open"} />
                <strong>{group.label}</strong>
                <span>{t("views.processes.groupCount", { count: group.items.length })}</span>
              </button>
              {!isCollapsed &&
                group.items.map((process) => (
                  <ProcessRow
                    key={process.pid}
                    process={process}
                    selected={props.selectedPid === process.pid}
                    locale={locale}
                    onSelect={() => props.onSelect(process)}
                    onContextMenu={(event) =>
                      setContextMenu({ process, x: event.clientX, y: event.clientY })
                    }
                  />
                ))}
            </section>
          );
        })}
      </div>
      {contextMenu && (
        <ProcessContextMenu
          process={contextMenu.process}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onInspect={() => {
            props.onSelect(contextMenu.process);
            setContextMenu(null);
          }}
          onSelectSession={(candidate) => {
            props.onSelectSession(candidate);
            setContextMenu(null);
          }}
        />
      )}
    </>
  );
}

function ProcessRow(props: {
  process: AgentProcess;
  selected: boolean;
  locale?: string;
  onSelect: () => void;
  onContextMenu: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const { t } = useTranslation();
  const process = props.process;
  const strong = strongCandidates(process);
  const top = strong[0] ?? process.sessionCandidates?.[0];
  const weakOnly = !strong.length && !!top;
  return (
    <button
      className={`processRow ${props.selected ? "selected" : ""}`}
      onClick={props.onSelect}
      onContextMenu={(event) => {
        event.preventDefault();
        props.onContextMenu(event);
      }}
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
            <span>{t("common.date.started", { date: formatDate(process.startTime, props.locale) })}</span>
          )}
          {process.startTime && <span>{formatDuration(process.startTime, props.locale)}</span>}
          {process.workingSetBytes !== undefined && (
            <span>{formatBytes(process.workingSetBytes, props.locale)}</span>
          )}
        </div>
        <div className="candidateLine">
          {top ? (
            <>
              <ConfidenceBadge value={top.confidence} />
              <span className="candidateTitle">{candidateTitle(top)}</span>
              <span className="scoreBadge">{t("views.processes.score", { score: top.score })}</span>
              <span>{weakOnly ? t("views.processes.weakEvidence") : explainTopCandidate(top)}</span>
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
}

function ProcessContextMenu(props: {
  process: AgentProcess;
  x: number;
  y: number;
  onClose: () => void;
  onInspect: () => void;
  onSelectSession: (candidate: SessionCandidate) => void;
}) {
  const { t } = useTranslation();
  const candidates = (props.process.sessionCandidates ?? []).slice(0, 5);
  const left = clampMenuCoordinate(props.x, window.innerWidth, 326);
  const top = clampMenuCoordinate(props.y, window.innerHeight, 280);
  useEffect(() => {
    const close = () => props.onClose();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [props]);
  return (
    <div
      className="contextMenu"
      style={{ left, top } as CSSProperties}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button onClick={props.onInspect}>{t("views.processes.context.inspect")}</button>
      <div className="menuDivider" />
      <span>{t("views.processes.context.jumpSession")}</span>
      {candidates.length ? (
        candidates.map((candidate) => (
          <button key={`${candidate.agent}:${candidate.sessionId}`} onClick={() => props.onSelectSession(candidate)}>
            <AgentPill agent={candidate.agent} />
            <strong>{candidateTitle(candidate)}</strong>
            <em>{candidateExplanation(candidate)}</em>
          </button>
        ))
      ) : (
        <p>{t("views.processes.noCandidate")}</p>
      )}
    </div>
  );
}

function MiniSegmentedControl<T extends string>(props: {
  value: T;
  values: T[];
  label: (value: T) => string;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented miniSegmented">
      {props.values.map((value) => (
        <button
          key={value}
          className={props.value === value ? "active" : ""}
          onClick={() => props.onChange(value)}
        >
          {props.label(value)}
        </button>
      ))}
    </div>
  );
}

function ToolbarControl(props: { label: string; children: ReactNode }) {
  return (
    <div className="toolbarControl">
      <span>{props.label}</span>
      {props.children}
    </div>
  );
}

function SessionList(props: {
  sessions: AgentSession[];
  selectedKey?: string | undefined;
  loading: boolean;
  highlightTarget: SearchResultRecord | null;
  onImportSession: () => void;
  onSelect: (session: AgentSession) => void;
  onBackupSession: (session: AgentSession) => void;
  onDeleteSession: (session: AgentSession) => void;
  onRevealTranscript: (session: AgentSession) => void;
}) {
  const { t, i18n: activeI18n } = useTranslation();
  const locale = activeI18n.resolvedLanguage ?? activeI18n.language;
  const [groupMode, setGroupMode] = useState<SessionGroupMode>("none");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [contextMenu, setContextMenu] = useState<{
    session: AgentSession;
    x: number;
    y: number;
  } | null>(null);
  const groups = useMemo(
    () => groupSessions(props.sessions, groupMode),
    [props.sessions, groupMode]
  );
  const highlightedKey = props.highlightTarget
    ? `${props.highlightTarget.agent ?? ""}:${props.highlightTarget.sessionId ?? ""}`
    : undefined;
  const toggleGroup = (key: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  if (props.loading) return <LoadingState />;
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
        action={<ActionButton label={t("inspector.actions.importSession")} onClick={props.onImportSession} />}
      />
      <div className="listToolbar">
        <MiniSegmentedControl
          value={groupMode}
          values={["cwd", "parent", "agent", "none"]}
          label={(value) => t(`views.sessions.group.${value}`)}
          onChange={(value) => setGroupMode(value as SessionGroupMode)}
        />
      </div>
      <div className="rows">
        {groupMode === "none"
          ? groups[0]?.items.map((session) => (
              <SessionRow
                key={`${session.agent}:${session.sessionId}`}
                session={session}
                selected={props.selectedKey === sessionKey(session)}
                highlighted={highlightedKey === sessionKey(session)}
                locale={locale}
                onSelect={() => props.onSelect(session)}
                onContextMenu={(event) =>
                  setContextMenu({ session, x: event.clientX, y: event.clientY })
                }
              />
            ))
          : groups.map((group) => {
          const isCollapsed = collapsed.has(group.key);
          return (
            <section className="processGroup" key={group.key}>
              <button className="groupHeader" onClick={() => toggleGroup(group.key)}>
                <ChevronRight size={15} className={isCollapsed ? "" : "open"} />
                <strong>{group.label}</strong>
                <span>{t("views.sessions.groupCount", { count: group.items.length })}</span>
              </button>
              {!isCollapsed &&
                group.items.map((session) => (
                  <SessionRow
                    key={`${session.agent}:${session.sessionId}`}
                    session={session}
                    selected={props.selectedKey === sessionKey(session)}
                    highlighted={highlightedKey === sessionKey(session)}
                    locale={locale}
                    onSelect={() => props.onSelect(session)}
                    onContextMenu={(event) =>
                      setContextMenu({ session, x: event.clientX, y: event.clientY })
                    }
                  />
                ))}
            </section>
          );
        })}
      </div>
      {contextMenu && (
        <SessionContextMenu
          session={contextMenu.session}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onBackup={() => {
            props.onBackupSession(contextMenu.session);
            setContextMenu(null);
          }}
          onDelete={() => {
            props.onDeleteSession(contextMenu.session);
            setContextMenu(null);
          }}
          onRevealTranscript={() => {
            props.onRevealTranscript(contextMenu.session);
            setContextMenu(null);
          }}
        />
      )}
    </>
  );
}

function SessionRow(props: {
  session: AgentSession;
  selected: boolean;
  highlighted: boolean;
  locale?: string;
  onSelect: () => void;
  onContextMenu: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const { t } = useTranslation();
  const session = props.session;
  const rowRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!props.highlighted) return;
    rowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [props.highlighted]);
  return (
    <button
      ref={rowRef}
      className={`sessionRow ${props.selected ? "selected" : ""} ${props.highlighted ? "highlighted" : ""}`}
      onClick={props.onSelect}
      onContextMenu={(event) => {
        event.preventDefault();
        props.onContextMenu(event);
      }}
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
          {session.childSessionIds.length > 0 && (
            <span>{t("views.sessions.children", { count: session.childSessionIds.length })}</span>
          )}
          {session.startedAt && (
            <span>{t("common.date.started", { date: formatDate(session.startedAt, props.locale) })}</span>
          )}
          {session.updatedAt && (
            <span>{t("common.date.updated", { date: formatDate(session.updatedAt, props.locale) })}</span>
          )}
        </div>
        <div className="rowPath mono">
          {session.cwd || session.transcriptPath || t("common.path.noPathEvidence")}
        </div>
        <EvidenceSummary evidence={session.evidence} />
      </div>
      <ChevronRight size={16} />
    </button>
  );
}

function SessionContextMenu(props: {
  session: AgentSession;
  x: number;
  y: number;
  onClose: () => void;
  onBackup: () => void;
  onDelete: () => void;
  onRevealTranscript: () => void;
}) {
  const { t } = useTranslation();
  const left = clampMenuCoordinate(props.x, window.innerWidth, 300);
  const top = clampMenuCoordinate(props.y, window.innerHeight, 230);
  useEffect(() => {
    const close = () => props.onClose();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [props]);
  return (
    <div
      className="contextMenu sessionContextMenu"
      style={{ left, top } as CSSProperties}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <span>{displayTitle(props.session)}</span>
      <button onClick={props.onBackup}>
        <Download size={15} />
        <strong>{t("inspector.actions.backupSession")}</strong>
      </button>
      <button disabled={!props.session.transcriptPath} onClick={props.onRevealTranscript}>
        <FolderOpen size={15} />
        <strong>{t("inspector.actions.revealTranscript")}</strong>
      </button>
      <div className="menuDivider" />
      <button className="dangerItem" onClick={props.onDelete}>
        <AlertTriangle size={15} />
        <strong>{t("inspector.actions.deleteSession")}</strong>
      </button>
    </div>
  );
}

function RelationList(props: { relations: Relation[]; sessions: AgentSession[]; loading: boolean }) {
  const { t } = useTranslation();
  if (props.loading) return <LoadingState />;
  if (!props.relations.length) {
    return (
      <EmptyState
        icon={<Network size={22} />}
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
        {props.relations.map((relation, index) => {
          const sourceLabel = t(`relations.endpoint.${relation.kind}.source`);
          const targetLabel = t(`relations.endpoint.${relation.kind}.target`);
          const source = relationEndpointDisplay(props.sessions, relation, "source", sourceLabel);
          const target = relationEndpointDisplay(props.sessions, relation, "target", targetLabel);
          return (
            <div
              className="relationItem"
              key={`${relation.kind}:${relation.sourceId}:${relation.targetId}:${index}`}
            >
              <div className="relationKind">
                <Badge text={t(`relations.kind.${relation.kind}`)} />
              </div>
              <RelationEndpoint label={sourceLabel} endpoint={source} />
              <span className="arrow">{"->"}</span>
              <RelationEndpoint label={targetLabel} endpoint={target} />
              <ConfidenceBadge value={relation.confidence} />
              <div className="relationEvidence">
                {relation.evidence[0]?.source ?? t("inspector.noEvidence")}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function RelationEndpoint(props: { label: string; endpoint: RelationEndpointDisplay }) {
  return (
    <div className="relationEndpoint">
      <span>{props.label}</span>
      <strong title={props.endpoint.raw}>{props.endpoint.title}</strong>
      {props.endpoint.detail && (
        <em className="mono" title={props.endpoint.raw}>
          {props.endpoint.detail}
        </em>
      )}
    </div>
  );
}

function DoctorPanel(props: { checks: Diagnostic[]; loading: boolean }) {
  const { t } = useTranslation();
  if (props.loading) return <LoadingState />;
  if (!props.checks.length) {
    return (
      <EmptyState
        icon={<Stethoscope size={22} />}
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
  installedFonts: string[];
  onOpenPath: (targetPath?: string) => void;
  onOpenExternal: (url: string) => void;
}) {
  const { t } = useTranslation();
  const [section, setSection] = useState<SettingsSection>("general");
  const warnings = props.doctor.filter((item) => item.status === "warn").length;
  return (
    <>
      <PaneHeader title={t("settings.title")} subtitle={t("settings.subtitle")} />
      <div className="settingsShell">
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
            icon={<Cpu size={16} />}
            label={t("settings.sections.runtime")}
            onClick={() => setSection("runtime")}
          />
          <SettingsNavItem
            active={section === "diagnostics"}
            icon={<Stethoscope size={16} />}
            label={t("settings.sections.diagnostics")}
            onClick={() => setSection("diagnostics")}
          />
        </aside>
        <section className="settingsRows animatedPane" key={section}>
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
                  label={t("settings.suggestions.label")}
                  detail={t("settings.suggestions.detail")}
                >
                  <button
                    className={`toggleButton ${props.settings.suggestionsEnabled ? "on" : ""}`}
                    onClick={() =>
                      props.updateSettings({
                        suggestionsEnabled: !props.settings.suggestionsEnabled
                      })
                    }
                  >
                    {props.settings.suggestionsEnabled
                      ? t("common.action.show")
                      : t("common.action.hide")}
                  </button>
                </SettingRow>
                <SettingRow
                  label={t("settings.transcriptPreview.label")}
                  detail={t("settings.transcriptPreview.detail")}
                >
                  <button
                    className={`toggleButton ${props.settings.transcriptPreviewEnabled ? "on" : ""}`}
                    onClick={() =>
                      props.updateSettings({
                        transcriptPreviewEnabled: !props.settings.transcriptPreviewEnabled
                      })
                    }
                  >
                    {props.settings.transcriptPreviewEnabled
                      ? t("common.action.show")
                      : t("common.action.hide")}
                  </button>
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
                <TypographyPreviewClean settings={props.settings} />
                <SettingRow
                  label={t("settings.fontMode.label")}
                  detail={t("settings.fontMode.detail")}
                >
                  <SegmentedControl
                    value={props.settings.fontMode}
                    values={[
                      ["language", t("settings.fontMode.language")],
                      ["unified", t("settings.fontMode.unified")],
                      ["custom", t("settings.fontMode.custom")]
                    ]}
                    onChange={(value) =>
                      props.updateSettings({ fontMode: value as AppSettings["fontMode"] })
                    }
                  />
                </SettingRow>
                <SettingRow
                  label={t("settings.fontPreset.label")}
                  detail={t("settings.fontPreset.detail")}
                >
                  <FontPresetControl
                    value={props.settings.fontPreset}
                    onChange={(preset) => props.updateSettings(fontPresetSettings(preset))}
                  />
                </SettingRow>
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
                  label={t("settings.lineHeight.label")}
                  detail={t("settings.lineHeight.detail")}
                >
                  <SegmentedControl
                    value={props.settings.uiLineHeight}
                    values={[
                      ["compact", t("settings.lineHeight.compact")],
                      ["normal", t("settings.lineHeight.normal")],
                      ["spacious", t("settings.lineHeight.spacious")]
                    ]}
                    onChange={(value) =>
                      props.updateSettings({ uiLineHeight: value as AppSettings["uiLineHeight"] })
                    }
                  />
                </SettingRow>
                <FontSettingRow
                  label={t("settings.fonts.unified")}
                  detail={t("settings.fonts.unifiedDetail")}
                  value={props.settings.unifiedFont}
                  fonts={props.installedFonts}
                  onChange={(unifiedFont) =>
                    props.updateSettings({ unifiedFont, fontPreset: "custom" })
                  }
                />
                <FontSettingRow
                  label={t("settings.fonts.latin")}
                  detail={t("settings.fonts.latinDetail")}
                  value={props.settings.latinFont}
                  fonts={props.installedFonts}
                  onChange={(latinFont) => props.updateSettings({ latinFont, fontPreset: "custom" })}
                />
                <FontSettingRow
                  label={t("settings.fonts.chinese")}
                  detail={t("settings.fonts.chineseDetail")}
                  value={props.settings.chineseFont}
                  fonts={props.installedFonts}
                  onChange={(chineseFont) =>
                    props.updateSettings({ chineseFont, fontPreset: "custom" })
                  }
                />
                <FontSettingRow
                  label={t("settings.fonts.japanese")}
                  detail={t("settings.fonts.japaneseDetail")}
                  value={props.settings.japaneseFont}
                  fonts={props.installedFonts}
                  onChange={(japaneseFont) =>
                    props.updateSettings({ japaneseFont, fontPreset: "custom" })
                  }
                />
                <FontSettingRow
                  label={t("settings.fonts.korean")}
                  detail={t("settings.fonts.koreanDetail")}
                  value={props.settings.koreanFont}
                  fonts={props.installedFonts}
                  onChange={(koreanFont) =>
                    props.updateSettings({ koreanFont, fontPreset: "custom" })
                  }
                />
                <FontSettingRow
                  label={t("settings.codeFont.label")}
                  detail={t("settings.codeFont.detail")}
                  value={props.settings.codeFont}
                  fonts={props.installedFonts}
                  onChange={(codeFont) => props.updateSettings({ codeFont, fontPreset: "custom" })}
                />
                <SettingRow
                  label={t("settings.fonts.detected")}
                  detail={t("settings.fonts.detectedDetail", {
                    count: props.installedFonts.length
                  })}
                >
                  <CodeValue value={String(props.installedFonts.length)} />
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
                  <SwitchControl
                    checked={props.settings.runtimeWin32Enabled}
                    onChange={(runtimeWin32Enabled) =>
                      props.updateSettings({ runtimeWin32Enabled })
                    }
                  />
                </SettingRow>
                <SettingRow
                  label={t("settings.runtime.windowTitlesLabel")}
                  detail={t("settings.runtime.windowTitlesDetail")}
                >
                  <SwitchControl
                    checked={props.settings.runtimeWindowTitlesEnabled}
                    onChange={(runtimeWindowTitlesEnabled) =>
                      props.updateSettings({ runtimeWindowTitlesEnabled })
                    }
                  />
                </SettingRow>
                <SettingRow
                  label={t("settings.runtime.candidatesLabel")}
                  detail={t("settings.runtime.candidatesDetail", { count: props.sessions.length })}
                >
                  <SwitchControl
                    checked={props.settings.runtimeCandidatesEnabled}
                    onChange={(runtimeCandidatesEnabled) =>
                      props.updateSettings({ runtimeCandidatesEnabled })
                    }
                  />
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

function FontPresetControl(props: { value: FontPreset; onChange: (value: FontPreset) => void }) {
  const { t } = useTranslation();
  return (
    <span className="segmented fontPresetControl">
      {fontPresetValues.map((value) => (
        <button
          className={props.value === value ? "active" : ""}
          key={value}
          onClick={() => props.onChange(value)}
        >
          {t(`settings.fontPreset.${value}`)}
        </button>
      ))}
    </span>
  );
}

function FontSettingRow(props: {
  label: string;
  detail: string;
  value: string;
  fonts: string[];
  onChange: (value: string) => void;
}) {
  return (
    <SettingRow label={props.label} detail={props.detail}>
      <FontComboBox value={props.value} fonts={props.fonts} onChange={props.onChange} />
    </SettingRow>
  );
}

function FontComboBox(props: {
  value: string;
  fonts: string[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const comboRef = useRef<HTMLDivElement | null>(null);
  const options = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return fontOptions(props.fonts)
      .filter((font) => !query || font.toLowerCase().includes(query))
      .slice(0, 12);
  }, [filter, props.fonts]);

  useEffect(() => setHighlightedIndex(0), [filter, open]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event: PointerEvent) => {
      if (comboRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      setFilter("");
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  const commit = (value: string) => {
    const next = value.trim();
    if (next) props.onChange(next);
    setFilter("");
  };

  return (
    <div className={`fontCombo ${open ? "open" : ""}`} ref={comboRef}>
      <button
        type="button"
        className="fontComboTrigger"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
          if (event.key === "Escape") setOpen(false);
        }}
      >
        <span style={{ fontFamily: fontStack(props.value, ["sans-serif"]) }}>{props.value}</span>
        <ChevronRight size={15} className={open ? "open" : ""} />
      </button>
      {open && (
        <div className="fontComboMenu">
          <input
            className="fontComboSearch"
            autoFocus
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setOpen(false);
                setFilter("");
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setHighlightedIndex((index) => Math.min(options.length - 1, index + 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setHighlightedIndex((index) => Math.max(0, index - 1));
              }
              if (event.key === "Enter") {
                event.preventDefault();
                commit(options[highlightedIndex] ?? filter);
                setOpen(false);
              }
            }}
            spellCheck={false}
          />
          {options.map((font, index) => (
            <button
              type="button"
              key={font}
              className={`${font === props.value ? "active" : ""} ${
                index === highlightedIndex ? "highlighted" : ""
              }`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                props.onChange(font);
                setFilter("");
                setOpen(false);
              }}
            >
              <span style={{ fontFamily: fontStack(font, ["sans-serif"]) }}>{font}</span>
            </button>
          ))}
          {!options.length && <span className="fontComboEmpty">{filter}</span>}
        </div>
      )}
    </div>
  );
}

function TypographyPreviewClean(props: { settings: AppSettings }) {
  const { t } = useTranslation();
  return (
    <section className="typographyPreview">
      <div>
        <span>{t("settings.fontPreview.title")}</span>
        <strong>AgentScope trace layer</strong>
        <p>Windows-native control console | PID 31720 | cwd D:\Project\AgentScope</p>
      </div>
      <div className="fontPreviewGrid">
        <p lang="en">Process evidence, session index, transcript search.</p>
        <p lang="zh-CN">中文路径、会话标题、进程证据和索引元数据。</p>
        <p lang="ja-JP">日本語の設定、教科書体プレビュー、検索結果。</p>
        <p lang="ko-KR">한국어 세션, 프로세스, 진단 정보 표시.</p>
      </div>
      <pre className="mono">{`function trace(pid: number) {
  return sessions.find((s) => s.pid === pid);
}`}</pre>
      <div className="fontPreviewMeta">
        <CodeValue value={props.settings.fontMode} />
        <CodeValue value={props.settings.fontPreset} />
      </div>
    </section>
  );
}

function fontOptions(installedFonts: string[]): string[] {
  const preferred = [
    "Segoe UI Variable Text",
    "Segoe UI",
    "Anthropic Sans",
    "Inter",
    "SF Pro Text",
    "PingFang SC",
    "PingFang TC",
    "Microsoft YaHei UI",
    "Microsoft YaHei",
    "Noto Sans SC",
    "Source Han Sans SC",
    "Yu Gothic UI",
    "Yu Gothic",
    "Meiryo UI",
    "BIZ UDPGothic",
    "UD Digi Kyokasho N",
    "UD Digi Kyokasho NP",
    "Malgun Gothic",
    "Noto Sans KR",
    "Source Han Sans KR",
    "Cascadia Code",
    "JetBrains Mono",
    "Consolas",
    "SFMono-Regular"
  ];
  return [...new Set([...preferred, ...installedFonts])].sort((left, right) =>
    left.localeCompare(right)
  );
}

function fontPresetSettings(preset: FontPreset): Partial<AppSettings> {
  const presets: Record<FontPreset, Partial<AppSettings>> = {
    windows: {
      fontPreset: "windows",
      fontMode: "unified",
      unifiedFont: "Segoe UI Variable Text",
      latinFont: "Segoe UI Variable Text",
      chineseFont: "Microsoft YaHei UI",
      japaneseFont: "Yu Gothic UI",
      koreanFont: "Malgun Gothic",
      codeFont: "Cascadia Code",
      uiLineHeight: "normal"
    },
    language: {
      fontPreset: "language",
      fontMode: "language",
      unifiedFont: "Segoe UI Variable Text",
      latinFont: "Segoe UI Variable Text",
      chineseFont: "Microsoft YaHei UI",
      japaneseFont: "Yu Gothic UI",
      koreanFont: "Malgun Gothic",
      codeFont: "Cascadia Code",
      uiLineHeight: "normal"
    },
    claude: {
      fontPreset: "claude",
      fontMode: "language",
      unifiedFont: "Anthropic Sans",
      latinFont: "Anthropic Sans",
      chineseFont: "Noto Sans SC",
      japaneseFont: "Noto Sans JP",
      koreanFont: "Noto Sans KR",
      codeFont: "JetBrains Mono",
      uiLineHeight: "spacious"
    },
    japaneseTextbook: {
      fontPreset: "japaneseTextbook",
      fontMode: "language",
      unifiedFont: "Segoe UI Variable Text",
      latinFont: "Segoe UI Variable Text",
      chineseFont: "Noto Sans SC",
      japaneseFont: "UD Digi Kyokasho NP",
      koreanFont: "Malgun Gothic",
      codeFont: "Cascadia Code",
      uiLineHeight: "spacious"
    },
    dense: {
      fontPreset: "dense",
      fontMode: "language",
      unifiedFont: "Segoe UI",
      latinFont: "Segoe UI",
      chineseFont: "Microsoft YaHei UI",
      japaneseFont: "Yu Gothic UI",
      koreanFont: "Malgun Gothic",
      codeFont: "Cascadia Code",
      uiLineHeight: "compact"
    },
    custom: {
      fontPreset: "custom"
    }
  };
  return presets[preset];
}

function fontStyleVariables(settings: AppSettings): Record<string, string> {
  const latin = fontStack(settings.latinFont, [
    "Segoe UI Variable Text",
    "Segoe UI",
    "Arial",
    "sans-serif"
  ]);
  const zh = fontStack(settings.chineseFont, [
    "Microsoft YaHei UI",
    "Noto Sans SC",
    "Microsoft YaHei",
    "SimHei",
    "sans-serif"
  ]);
  const ja = fontStack(settings.japaneseFont, [
    "Yu Gothic UI",
    "BIZ UDPGothic",
    "Meiryo UI",
    "Meiryo",
    "sans-serif"
  ]);
  const ko = fontStack(settings.koreanFont, ["Malgun Gothic", "Noto Sans KR", "sans-serif"]);
  const unified = fontStack(settings.unifiedFont, [
    "Segoe UI Variable Text",
    "Segoe UI",
    "Microsoft YaHei UI",
    "Yu Gothic UI",
    "Malgun Gothic",
    "sans-serif"
  ]);
  const languageAware = `${latin}, ${zh}, ${ja}, ${ko}, sans-serif`;
  const ui = settings.fontMode === "unified" ? unified : languageAware;
  return {
    "--font-ui": ui,
    "--font-latin": latin,
    "--font-zh": zh,
    "--font-ja": ja,
    "--font-ko": ko,
    "--font-code": fontStack(settings.codeFont, [
      "Cascadia Code",
      "Cascadia Mono",
      "Consolas",
      "monospace"
    ])
  };
}

function fontStack(primary: string, fallbacks: string[]): string {
  return [...new Set([primary.trim(), ...fallbacks].filter(Boolean))]
    .map((font) => (isGenericFont(font) ? font : JSON.stringify(font)))
    .join(", ");
}

function isGenericFont(font: string): boolean {
  return ["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui"].includes(
    font.toLowerCase()
  );
}

function ColorSwatches(props: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const normalized = normalizeHexColor(props.value);
  const custom = normalized ?? defaultSettings.accent;
  useEffect(() => {
    if (!open) return undefined;
    const close = (event: PointerEvent) => {
      if (ref.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);
  return (
    <div className={`accentControl ${open ? "open" : ""}`} ref={ref}>
      <button className="accentTrigger" type="button" onClick={() => setOpen((value) => !value)}>
        <span className="accentPreview" style={{ background: custom }} />
        <strong className="mono">{custom}</strong>
        <ChevronRight size={14} className={open ? "open" : ""} />
      </button>
      {open && (
        <div className="accentPopover">
          <div className="swatches">
            {accentValues.map((color) => (
              <button
                className={normalized === color ? "active" : ""}
                key={color}
                onClick={() => props.onChange(color)}
                style={{ background: color }}
                title={color}
              />
            ))}
          </div>
          <div className="accentAdvanced">
            <label className="colorWheel" title={custom}>
              <input
                type="color"
                value={custom}
                onChange={(event) => props.onChange(event.target.value)}
              />
              <span style={{ background: custom }} />
            </label>
            <input
              className="hexInput mono"
              value={props.value}
              onChange={(event) => props.onChange(event.target.value)}
              onBlur={(event) =>
                props.onChange(normalizeHexColor(event.target.value) ?? defaultSettings.accent)
              }
              spellCheck={false}
            />
          </div>
        </div>
      )}
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
  loading: boolean;
  showUnknownCandidates: boolean;
  transcriptPreviewEnabled: boolean;
  highlightTarget: SearchResultRecord | null;
  onOpenPath: (targetPath?: string) => void;
  onRevealPath: (targetPath?: string) => void;
  onBackupSession: (session: AgentSession) => void;
  onDeleteSession: (session: AgentSession) => void;
}) {
  const { t, i18n: activeI18n } = useTranslation();
  const locale = activeI18n.resolvedLanguage ?? activeI18n.language;
  if (props.loading) {
    return (
      <aside className="inspector">
        <LoadingState compact />
      </aside>
    );
  }
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
      <ModelRuntimeSummary session={session} />
      <ControlSummary
        session={session}
        onOpenPath={props.onOpenPath}
        onRevealPath={props.onRevealPath}
        onBackupSession={props.onBackupSession}
        onDeleteSession={props.onDeleteSession}
      />
      {props.transcriptPreviewEnabled && (
        <TranscriptHitContext
          context={transcriptContextForSession(session, props.highlightTarget)}
        />
      )}
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
      <Field
        label={t("inspector.fields.lines")}
        value={formatNumber(activity.lineCount, props.locale)}
      />
      <Field
        label={t("inspector.fields.bytes")}
        value={formatBytes(activity.byteSize, props.locale)}
      />
      <Field
        label={t("inspector.fields.firstEvent")}
        value={formatMaybeDate(activity.firstTimestamp, props.locale)}
      />
      <Field
        label={t("inspector.fields.lastEvent")}
        value={formatMaybeDate(activity.lastTimestamp, props.locale)}
      />
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
            <StatChip
              label={t("inspector.fields.inputTokens")}
              value={usage.inputTokens}
              locale={props.locale}
            />
            <StatChip
              label={t("inspector.fields.outputTokens")}
              value={usage.outputTokens}
              locale={props.locale}
            />
            <StatChip
              label={t("inspector.fields.cacheRead")}
              value={usage.cacheReadInputTokens}
              locale={props.locale}
            />
            <StatChip
              label={t("inspector.fields.cacheWrite")}
              value={usage.cacheCreationInputTokens}
              locale={props.locale}
            />
          </div>
        </div>
      )}
    </FieldGroup>
  );
}

function ModelRuntimeSummary(props: { session: AgentSession }) {
  const { t } = useTranslation();
  const metadata = props.session.indexMetadata ?? {};
  const activity = props.session.activity;
  const modelCounts = activity?.modelCounts ?? {};
  const hasModelCounts = Object.keys(modelCounts).length > 0;
  const fields = [
    ["modelProvider", metadataValue(metadata, "model_provider", "provider")],
    ["model", metadataValue(metadata, "model") ?? firstCounterKey(modelCounts)],
    ["reasoningEffort", metadataValue(metadata, "reasoning_effort", "reasoning")],
    ["tokensUsed", metadataValue(metadata, "tokens_used", "total_tokens")],
    ["approvalMode", metadataValue(metadata, "approval_mode", "approval_policy")],
    ["sandboxPolicy", metadataValue(metadata, "sandbox_policy", "sandbox_mode")],
    ["gitBranch", metadataValue(metadata, "git_branch") ?? activity?.gitBranch],
    ["cliVersion", metadataValue(metadata, "cli_version", "version") ?? activity?.cliVersion],
    ["entrypoint", metadataValue(metadata, "entrypoint")]
  ] as const;
  const hasFields = fields.some(([, value]) => value !== undefined);
  if (!hasFields && !hasModelCounts) return null;
  return (
    <FieldGroup title={t("inspector.modelRuntime")}>
      {fields.map(([key, value]) => (
        <Field
          key={key}
          label={t(`inspector.fields.${key}`)}
          value={value}
          mono={key !== "tokensUsed"}
          long={key === "entrypoint"}
        />
      ))}
      {hasModelCounts && <StatChips title={t("inspector.models")} values={modelCounts} />}
    </FieldGroup>
  );
}

function ControlSummary(props: {
  session: AgentSession;
  onOpenPath: (targetPath?: string) => void;
  onRevealPath: (targetPath?: string) => void;
  onBackupSession: (session: AgentSession) => void;
  onDeleteSession: (session: AgentSession) => void;
}) {
  const { t } = useTranslation();
  const resumeCommand = suggestedResumeCommand(props.session);
  return (
    <FieldGroup title={t("inspector.control")}>
      <div className="actionGrid">
        <ActionButton
          label={t("inspector.actions.backupSession")}
          onClick={() => props.onBackupSession(props.session)}
        />
        <ActionButton
          label={t("inspector.actions.deleteSession")}
          onClick={() => props.onDeleteSession(props.session)}
        />
        <ActionButton
          label={t("inspector.actions.revealTranscript")}
          disabled={!props.session.transcriptPath}
          onClick={() => props.onRevealPath(props.session.transcriptPath)}
        />
      </div>
      <Field label={t("inspector.fields.resumeCommand")} value={resumeCommand} mono long />
      <Field label={t("inspector.fields.safeControl")} value={t("inspector.safeControlDetail")} long />
    </FieldGroup>
  );
}

function TranscriptHitContext(props: { context: TranscriptContext | undefined }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!props.context) return;
    window.setTimeout(() => {
      ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 80);
  }, [props.context]);
  if (!props.context) return null;
  return (
    <FieldGroup title={t("inspector.searchHit")}>
      <section className="transcriptHit" ref={ref}>
        <div className="candidateHead">
          <Badge text={`line ${props.context.line}`} tone="ok" />
          {props.context.eventType && <Badge text={props.context.eventType} />}
          {props.context.timestamp && <span>{formatMaybeDate(props.context.timestamp)}</span>}
        </div>
        {props.context.excerpt && (
          <p className="hitExcerpt mono">
            {highlightExcerpt(props.context.excerpt, props.context.query)}
          </p>
        )}
        <span className="mono">{props.context.path}</span>
      </section>
    </FieldGroup>
  );
}

function highlightExcerpt(excerpt: string, query?: string): ReactNode {
  if (!query?.trim()) return excerpt;
  const index = excerpt.toLowerCase().indexOf(query.trim().toLowerCase());
  if (index < 0) return excerpt;
  return (
    <>
      {excerpt.slice(0, index)}
      <mark>{excerpt.slice(index, index + query.trim().length)}</mark>
      {excerpt.slice(index + query.trim().length)}
    </>
  );
}

function metadataValue(metadata: Record<string, unknown>, ...keys: string[]): string | number | undefined {
  for (const key of keys) {
    const value = metadata[key];
    if (value === undefined || value === null || value === "") continue;
    if (typeof value === "number" || typeof value === "string") return value;
    if (typeof value === "boolean") return value ? "true" : "false";
    return JSON.stringify(value);
  }
  return undefined;
}

function firstCounterKey(values: Record<string, number> | undefined): string | undefined {
  if (!values) return undefined;
  return Object.entries(values).sort((a, b) => b[1] - a[1])[0]?.[0];
}

function suggestedResumeCommand(session: AgentSession): string | undefined {
  if (!session.sessionId) return undefined;
  if (session.agent === "codex") return `codex resume ${quoteCommandArg(session.sessionId)}`;
  if (session.agent === "claude") return `claude --resume ${quoteCommandArg(session.sessionId)}`;
  return undefined;
}

function quoteCommandArg(value: string): string {
  return /^[A-Za-z0-9._:-]+$/.test(value) ? value : `"${value.replaceAll('"', '\\"')}"`;
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

function StatChip(props: {
  label: string;
  value?: number | undefined;
  locale?: string | undefined;
}) {
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
          <div className="candidateFacts">
            <Field label={t("inspector.fields.session")} value={candidate.sessionId} mono />
            <Field label={t("inspector.fields.path")} value={candidate.transcriptPath} mono long />
            <Field
              label={t("inspector.fields.started")}
              value={formatMaybeDate(candidate.startedAt)}
            />
            <Field
              label={t("inspector.fields.updated")}
              value={formatMaybeDate(candidate.updatedAt)}
            />
          </div>
          <div className="reasonList">
            {(
              candidate.scoreParts ?? candidate.reasons.map((reason) => ({ ...reason, points: 0 }))
            ).map((reason, index) => (
              <div className="scorePart" key={`${reason.source}:${index}`}>
                <strong>{reason.points ? `+${reason.points}` : ""}</strong>
                <span>{reason.source.replace("process.match.", "")}</span>
                {reason.field && <em>{reason.field}</em>}
                <p>{reason.detail}</p>
              </div>
            ))}
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

function PaneHeader(props: { title: string; subtitle: string; action?: ReactNode | undefined }) {
  return (
    <div className="paneHeader">
      <div>
        <h2>{props.title}</h2>
        <p>{props.subtitle}</p>
      </div>
      {props.action && <div className="paneHeaderAction">{props.action}</div>}
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

function CommandPalette(props: {
  query: string;
  setQuery: (value: string) => void;
  runSearch: () => void;
  runSearchText: (value: string) => void;
  clearSearch: () => void;
  results: SearchResultRecord[];
  suggestions: SearchSuggestion[];
  currentView: View;
  setView: (view: View) => void;
  refresh: () => void;
  selectResult: (result: SearchResultRecord) => void;
  close: () => void;
}) {
  const { t } = useTranslation();
  const runQuick = (action: () => void) => {
    action();
    props.close();
  };
  const useSuggestion = (suggestion: SearchSuggestion) => {
    if (suggestion.targetView) props.setView(suggestion.targetView);
    if (suggestion.query) {
      props.setQuery(suggestion.query);
      props.runSearchText(suggestion.query);
    }
  };
  return (
    <div className="paletteOverlay" onMouseDown={props.close}>
      <section className="commandPalette" onMouseDown={(event) => event.stopPropagation()}>
        <div className="paletteSearch">
          <Search size={19} />
          <input
            autoFocus
            value={props.query}
            onChange={(event) => props.setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") props.close();
            }}
            placeholder={t("command.palettePlaceholder")}
          />
          <button className="iconButton" onClick={props.close} title={t("common.action.hide")}>
            <X size={16} />
          </button>
        </div>
        <div className="quickActions">
          <button onClick={() => runQuick(() => props.setView("processes"))}>
            {t("nav.processes")}
          </button>
          <button onClick={() => runQuick(() => props.setView("sessions"))}>
            {t("nav.sessions")}
          </button>
          <button onClick={() => runQuick(() => props.setView("graph"))}>
            {t("nav.relations")}
          </button>
          <button onClick={() => runQuick(props.refresh)}>{t("nav.refreshIndex")}</button>
        </div>
        <div className="paletteBody">
          <section>
            <div className="paletteSectionTitle">
              <span>
                {props.query.trim()
                  ? t("command.results")
                  : t("command.contextTitle", { view: t(`nav.${props.currentView}`) })}
              </span>
              {props.query.trim() && <em>{t("command.autoSearch")}</em>}
            </div>
            <SearchResults
              results={props.results}
              onPick={(result) => {
                props.selectResult(result);
                props.close();
              }}
            />
          </section>
          <section>
            <div className="paletteSectionTitle">
              <span>{t("command.suggestions")}</span>
              <button
                type="button"
                disabled={!props.query && props.results.length === 0}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  props.clearSearch();
                }}
              >
                {t("command.clearSearch")}
              </button>
            </div>
            <div className="suggestionList">
              {props.suggestions.length ? (
                props.suggestions.map((item) => (
                  <button
                    key={`${item.label}:${item.query ?? item.targetView ?? ""}`}
                    onClick={() => useSuggestion(item)}
                  >
                    <Search size={14} />
                    <span>{item.label}</span>
                    <em>{item.detail}</em>
                  </button>
                ))
              ) : (
                <p className="muted">{t("command.noSuggestions")}</p>
              )}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function MetadataSummary(props: { metadata?: Record<string, unknown> | undefined }) {
  const { t } = useTranslation();
  const entries = Object.entries(props.metadata ?? {}).filter(
    ([, value]) => value !== undefined && value !== null && value !== ""
  );
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

function SearchResults(props: {
  results: SearchResultRecord[];
  onPick: (result: SearchResultRecord) => void;
}) {
  return (
    <section className="results">
      {props.results.map((result, index) => (
        <button className="result" key={index} onClick={() => props.onPick(result)}>
          <AgentPill agent={String(result.agent ?? "unknown")} />
          <span>{String(result.source ?? "")}</span>
          <span className="mono">{short(String(result.sessionId ?? ""))}</span>
          <strong>{searchResultTitle(result)}</strong>
          {typeof result.excerpt === "string" && <em className="mono">{result.excerpt}</em>}
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

function LoadingState(props: { compact?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className={`emptyState loadingState ${props.compact ? "compact" : ""}`}>
      <div>
        <RefreshCw size={22} className="spin" />
      </div>
      <h2>{t("views.loading.title")}</h2>
      <p>{t("views.loading.detail")}</p>
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
  if (props.agent === "claude") {
    return <img className="agentBrandIcon" src={claudeLogoUrl} alt="" aria-hidden="true" />;
  }
  if (props.agent === "codex") {
    return <img className="agentBrandIcon" src={codexLogoUrl} alt="" aria-hidden="true" />;
  }
  return <Bot size={18} />;
}

function AgentScopeMark(props: { size?: number }) {
  const size = props.size ?? 24;
  return (
    <svg
      className="agentGlyph"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
    >
      <path
        d="M5.4 7.1c0-1.2 1-2.1 2.1-2.1h9c1.2 0 2.1 1 2.1 2.1v8.2c0 1.2-1 2.1-2.1 2.1h-9c-1.2 0-2.1-1-2.1-2.1V7.1Z"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinejoin="round"
      />
      <path
        d="M8.2 10.6h4.1M8.2 13.8h2.2M15.6 8.7v3.1M14 10.2h3.1"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
      />
      <path
        d="M12.5 17.6v2.2h3.3M18.6 17.4l2.1 2.1"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="18" cy="19.8" r="1.25" fill="currentColor" />
      <circle cx="20.6" cy="20.4" r=".8" fill="currentColor" />
    </svg>
  );
}

function TranscriptGlyph(props: { size?: number }) {
  const size = props.size ?? 24;
  return (
    <svg
      className="agentGlyph"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
    >
      <path
        d="M6.5 4.8h8l3 3v11.4H6.5V4.8Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M14.3 5v3.1h3" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M8.8 11h5.4M8.8 14h6.1M8.8 17h3.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
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

function SwitchControl(props: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      className={`switchControl ${props.checked ? "checked" : ""}`}
      aria-pressed={props.checked}
      onClick={() => props.onChange(!props.checked)}
    >
      <span />
    </button>
  );
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

function candidateExplanation(candidate: SessionCandidate): string {
  const parts = (candidate.scoreParts ?? [])
    .slice()
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
    .slice(0, 3)
    .map((part) => `${part.points > 0 ? "+" : ""}${part.points} ${part.source.replace("process.match.", "")}`);
  return parts.length ? parts.join(" / ") : candidate.reasons[0]?.source ?? "";
}

function explainTopCandidate(candidate: SessionCandidate): string {
  const exact = candidate.scoreParts?.find((part) => part.source === "process.match.pid");
  if (exact) return "PID exact";
  return candidateExplanation(candidate);
}

function groupProcesses(
  processes: AgentProcess[],
  sortMode: ProcessSortMode,
  groupMode: ProcessGroupMode
): Array<{ key: string; label: string; items: AgentProcess[] }> {
  const sorted = [...processes].sort((left, right) => compareProcesses(left, right, sortMode));
  const groups = new Map<string, { key: string; label: string; items: AgentProcess[] }>();
  for (const process of sorted) {
    const key = processGroupKey(process, groupMode);
    const label = processGroupLabel(process, groupMode);
    if (!groups.has(key)) groups.set(key, { key, label, items: [] });
    groups.get(key)!.items.push(process);
  }
  return [...groups.values()];
}

function groupSessions(
  sessions: AgentSession[],
  groupMode: SessionGroupMode
): Array<{ key: string; label: string; items: AgentSession[] }> {
  const sorted = [...sessions].sort(
    (left, right) =>
      parseDate(right.updatedAt ?? right.startedAt) - parseDate(left.updatedAt ?? left.startedAt) ||
      displayTitle(left).localeCompare(displayTitle(right))
  );
  const groups = new Map<string, { key: string; label: string; items: AgentSession[] }>();
  for (const session of sorted) {
    const key = sessionGroupKey(session, groupMode);
    const label = sessionGroupLabel(session, groupMode);
    if (!groups.has(key)) groups.set(key, { key, label, items: [] });
    groups.get(key)!.items.push(session);
  }
  return [...groups.values()];
}

function sessionGroupKey(session: AgentSession, groupMode: SessionGroupMode): string {
  if (groupMode === "none") return "all";
  if (groupMode === "parent") return `parent:${session.parentSessionId ?? "root"}`;
  if (groupMode === "agent") return `agent:${session.agent}`;
  return `cwd:${session.cwd ?? "unknown"}`;
}

function sessionGroupLabel(session: AgentSession, groupMode: SessionGroupMode): string {
  if (groupMode === "none") return "All sessions";
  if (groupMode === "parent") return session.parentSessionId ? `Parent ${short(session.parentSessionId)}` : "Root / no parent";
  if (groupMode === "agent") return session.agent;
  return session.cwd ?? "No cwd";
}

function compareProcesses(left: AgentProcess, right: AgentProcess, sortMode: ProcessSortMode): number {
  if (sortMode === "memory") {
    return (right.workingSetBytes ?? 0) - (left.workingSetBytes ?? 0) || compareProcesses(left, right, "time");
  }
  if (sortMode === "runtime") {
    return runtimeMs(right) - runtimeMs(left) || compareProcesses(left, right, "time");
  }
  if (sortMode === "score") {
    return topScore(right) - topScore(left) || compareProcesses(left, right, "time");
  }
  if (sortMode === "tree") {
    return (left.ppid ?? 0) - (right.ppid ?? 0) || left.pid - right.pid;
  }
  return parseDate(right.startTime ?? right.creationDate) - parseDate(left.startTime ?? left.creationDate);
}

function processGroupKey(process: AgentProcess, groupMode: ProcessGroupMode): string {
  if (groupMode === "none") return "all";
  if (groupMode === "parent") return `ppid:${process.ppid ?? "root"}`;
  if (groupMode === "cwd") return `cwd:${topProcessCwd(process) ?? "unknown"}`;
  return `agent:${process.agent}`;
}

function processGroupLabel(process: AgentProcess, groupMode: ProcessGroupMode): string {
  if (groupMode === "none") return "All processes";
  if (groupMode === "parent") return process.ppid === undefined ? "No parent PID" : `Parent PID ${process.ppid}`;
  if (groupMode === "cwd") return topProcessCwd(process) ?? "No cwd candidate";
  return process.agent === "unknown" ? "Unknown" : process.agent;
}

function topProcessCwd(process: AgentProcess): string | undefined {
  return strongCandidates(process)[0]?.cwd ?? process.sessionCandidates?.[0]?.cwd;
}

function topScore(process: AgentProcess): number {
  return strongCandidates(process)[0]?.score ?? process.sessionCandidates?.[0]?.score ?? 0;
}

function visibleProcesses(processes: AgentProcess[], settings: AppSettings): AgentProcess[] {
  if (!settings.runtimeWin32Enabled) return [];
  return processes.map((process) => ({
    ...process,
    windowTitle: settings.runtimeWindowTitlesEnabled ? process.windowTitle : undefined,
    sessionCandidates: settings.runtimeCandidatesEnabled ? process.sessionCandidates : []
  }));
}

function runtimeMs(process: AgentProcess): number {
  const start = parseDate(process.startTime ?? process.creationDate);
  return start ? Date.now() - start : 0;
}

function relationEndpointDisplay(
  sessions: AgentSession[],
  relation: Relation,
  side: RelationSide,
  label: string
): RelationEndpointDisplay {
  const id = side === "source" ? relation.sourceId : relation.targetId;
  if (relation.kind === "process_parent") {
    const detail = relation.evidence[0]?.source;
    return {
      title: id === "unknown" ? label : `PID ${id}`,
      ...(detail ? { detail } : {}),
      raw: id
    };
  }

  const session = sessions.find((item) => item.sessionId === id);
  if (session) {
    return {
      title: displayTitle(session),
      detail: session.cwd || short(session.sessionId),
      raw: session.sessionId
    };
  }

  if (relation.kind === "transcript" && id.includes("\\")) {
    return {
      title: id.split("\\").pop() || label,
      detail: short(id),
      raw: id
    };
  }

  const fallbackDetail = id.length > 28 ? short(id) : relation.evidence[0]?.source;
  return {
    title: relation.kind === "subagent" && side === "target" ? label : short(id),
    ...(fallbackDetail ? { detail: fallbackDetail } : {}),
    raw: id
  };
}

function searchResultTitle(result: Record<string, unknown>): string {
  if (result.title) return String(result.title);
  const eventType = result.eventType ? String(result.eventType) : "jsonl";
  const line = result.line ? `line ${String(result.line)}` : "";
  const fields =
    Array.isArray(result.matchedFields) && result.matchedFields.length
      ? `fields ${result.matchedFields.map(String).join(", ")}`
      : "";
  return [eventType, line, fields, result.path ? String(result.path) : ""]
    .filter(Boolean)
    .join(" · ");
}

function searchResultSelection(
  result: SearchResultRecord,
  sessions: AgentSession[]
): SelectionKey {
  const sessionId = typeof result.sessionId === "string" ? result.sessionId : undefined;
  if (!sessionId) return null;
  const agent = typeof result.agent === "string" ? result.agent : undefined;
  const session = sessions.find(
    (item) => item.sessionId === sessionId && (!agent || item.agent === agent)
  );
  return session ? { type: "session", agent: session.agent, id: session.sessionId } : null;
}

function transcriptContextForSession(
  session: AgentSession,
  result: SearchResultRecord | null
): TranscriptContext | undefined {
  if (!result || !result.path || !result.line) return undefined;
  if (result.sessionId && result.sessionId !== session.sessionId) return undefined;
  if (result.agent && result.agent !== session.agent) return undefined;
  const query = typeof result.query === "string" ? result.query : undefined;
  const eventType = typeof result.eventType === "string" ? result.eventType : undefined;
  const timestamp = typeof result.timestamp === "string" ? result.timestamp : undefined;
  const excerpt = typeof result.excerpt === "string" ? result.excerpt : undefined;
  return {
    path: String(result.path),
    line: Number(result.line),
    ...(query ? { query } : {}),
    ...(eventType ? { eventType } : {}),
    ...(timestamp ? { timestamp } : {}),
    ...(excerpt ? { excerpt } : {})
  };
}

function buildSearchSuggestions(
  view: View,
  selected: Selection,
  sessions: AgentSession[],
  processes: AgentProcess[],
  relations: Relation[],
  doctor: Diagnostic[],
  t: (key: string, options?: Record<string, unknown>) => string
): SearchSuggestion[] {
  const out: SearchSuggestion[] = [];
  const add = (suggestion: SearchSuggestion | undefined) => {
    if (!suggestion) return;
    const key = `${suggestion.label}\0${suggestion.query ?? ""}\0${suggestion.targetView ?? ""}`;
    if (out.some((item) => `${item.label}\0${item.query ?? ""}\0${item.targetView ?? ""}` === key)) return;
    out.push(suggestion);
  };

  add({ label: t("command.suggestion.refresh"), detail: t("nav.refreshIndex"), targetView: view });
  if (view !== "processes") add({ label: t("nav.processes"), detail: t("command.suggestion.processes"), targetView: "processes" });
  if (view !== "sessions") add({ label: t("nav.sessions"), detail: t("command.suggestion.sessions"), targetView: "sessions" });
  if (view !== "graph") add({ label: t("nav.relations"), detail: t("command.suggestion.relations"), targetView: "graph" });
  if (view !== "settings") add({ label: t("nav.settings"), detail: t("command.suggestion.settings"), targetView: "settings" });

  if (selected?.type === "process") {
    const process = selected.value;
    add(searchSuggestion(`PID ${process.pid}`, "pid", String(process.pid), t));
    add(searchSuggestion(process.windowTitle, "title", process.windowTitle, t));
    add(searchSuggestion(process.processName, "process", process.processName, t));
    add(searchSuggestion(topProcessCwd(process), "cwd", topProcessCwd(process), t));
    for (const candidate of (process.sessionCandidates ?? []).slice(0, 3)) {
      add(searchSuggestion(candidate.title ?? short(candidate.sessionId), "candidate", candidate.sessionId, t));
      add(searchSuggestion(candidate.cwd, "cwd", candidate.cwd, t));
    }
  }

  if (selected?.type === "session") {
    const session = selected.value;
    add(searchSuggestion(displayTitle(session), "title", displayTitle(session), t));
    add(searchSuggestion(short(session.sessionId), "session", session.sessionId, t));
    add(searchSuggestion(session.cwd, "cwd", session.cwd, t));
    add(searchSuggestion(session.status, "status", session.status, t));
    add(searchSuggestion(firstCounterKey(session.activity?.modelCounts), "model", firstCounterKey(session.activity?.modelCounts), t));
    for (const [tool] of topEntries(session.activity?.toolCounts, 3)) {
      add(searchSuggestion(tool, "tool", tool, t));
    }
  }

  if (view === "processes") {
    for (const process of processes.slice(0, 5)) {
      add(searchSuggestion(process.windowTitle || process.processName, "process", process.windowTitle || process.processName, t));
    }
  } else if (view === "sessions") {
    for (const session of sessions.slice(-6).reverse()) {
      add(searchSuggestion(displayTitle(session), "session", session.sessionId, t));
    }
  } else if (view === "graph") {
    for (const relation of relations.slice(0, 5)) {
      add(searchSuggestion(relation.kind, "relation", relation.kind, t));
    }
  } else if (view === "doctor") {
    for (const warning of doctor.filter((item) => item.status === "warn").slice(0, 5)) {
      add(searchSuggestion(warning.name, "diagnostic", warning.name, t));
    }
  } else if (view === "settings") {
    for (const key of ["theme", "language", "motion", "indexing", "runtime"]) {
      add(searchSuggestion(t(`settings.suggestion.${key}`), "setting", key, t));
    }
  }

  return out.slice(0, 12);
}

function searchSuggestion(
  label: string | undefined,
  kind: string,
  query: string | undefined,
  t: (key: string, options?: Record<string, unknown>) => string
): SearchSuggestion | undefined {
  const cleaned = query?.trim();
  if (!label || !cleaned) return undefined;
  return {
    label,
    detail: t("command.suggestion.query", { kind }),
    query: cleaned
  };
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

function topEntries(
  values: Record<string, number> | undefined,
  limit: number
): Array<[string, number]> {
  return Object.entries(values ?? {})
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

function formatNumber(value: number | undefined, locale?: string): string | undefined {
  return value === undefined ? undefined : new Intl.NumberFormat(locale).format(value);
}

function formatBytes(value: number | undefined, locale?: string): string | undefined {
  if (value === undefined) return undefined;
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: size >= 10 ? 0 : 1 }).format(size)} ${units[unit]}`;
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function journalPathFromError(message: string): string | undefined {
  const match = /\bjournalPath=([^\r\n]+)/.exec(message);
  return match?.[1]?.trim();
}

function formatDuration(startTime: string, locale?: string): string {
  const start = parseDate(startTime);
  if (!start) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - start) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours < 24) return `${hours}h ${restMinutes}m`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return `${new Intl.NumberFormat(locale).format(days)}d ${restHours}h`;
}

function parseDate(value?: string): number {
  if (!value) return 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && value.length >= 10) return numeric;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function clampMenuCoordinate(value: number, viewport: number, size: number): number {
  return Math.max(8, Math.min(value, viewport - size - 8));
}

function displayTitle(session: AgentSession) {
  const title = session.title || inferredSessionTitle(session) || short(session.sessionId);
  return title.length > 160 ? `${title.slice(0, 157)}...` : title;
}

function inferredSessionTitle(session: AgentSession): string | undefined {
  const metadata = session.indexMetadata ?? {};
  const agentName = metadataValue(metadata, "agent_nickname", "agent_role", "agent_path");
  if (agentName) return cleanTitle(String(agentName));
  const batch = fileBatchTitle(session.transcriptPath);
  if (batch) return batch;
  const cwdName = basename(session.cwd);
  if (cwdName && session.parentSessionId) return `${cwdName} child`;
  if (cwdName) return cwdName;
  return basename(session.transcriptPath);
}

function fileBatchTitle(filePath?: string): string | undefined {
  if (!filePath) return undefined;
  const match = /batch[_-](\d+)/i.exec(filePath);
  return match ? `batch ${match[1]}` : undefined;
}

function basename(value?: string): string | undefined {
  if (!value) return undefined;
  const parts = value.split(/[\\/]+/).filter(Boolean);
  return parts.at(-1);
}

function cleanTitle(value: string): string {
  return value.replaceAll("_", " ").replace(/\s+/g, " ").trim();
}

function Notification(props: { notice: NoticeState; onClose: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(props.onClose, 7800);
    return () => window.clearTimeout(timer);
  }, [props.notice.id, props.onClose]);
  return (
    <section className="notification" role="status" aria-live="polite">
      <div>
        <strong>{props.notice.message}</strong>
        {props.notice.detail && <span className="mono">{props.notice.detail}</span>}
      </div>
      {props.notice.actions?.length ? (
        <div className="notificationActions">
          {props.notice.actions.map((action) => (
            <button key={action.label} type="button" onClick={action.onClick}>
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
      <button className="notificationClose" type="button" onClick={props.onClose} aria-label="Close">
        <X size={14} />
      </button>
    </section>
  );
}

function ConfirmDialog(props: { value: ConfirmState; onClose: () => void }) {
  const { t } = useTranslation();
  const confirm = () => {
    props.onClose();
    props.value.onConfirm();
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props]);
  return (
    <div className="confirmOverlay" onMouseDown={props.onClose}>
      <section className="confirmDialog" onMouseDown={(event) => event.stopPropagation()}>
        <h2>{props.value.title}</h2>
        <p>{props.value.detail}</p>
        <div className="confirmActions">
          <button type="button" onClick={props.onClose}>
            {t("common.action.cancel")}
          </button>
          <button
            type="button"
            className={props.value.danger ? "dangerAction" : ""}
            onClick={confirm}
          >
            {props.value.confirmLabel}
          </button>
        </div>
      </section>
    </div>
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
    accent: normalizeHexColor(settings.accent) ?? defaultSettings.accent,
    runtimeWin32Enabled: pickBoolean(
      settings.runtimeWin32Enabled,
      defaultSettings.runtimeWin32Enabled
    ),
    runtimeWindowTitlesEnabled: pickBoolean(
      settings.runtimeWindowTitlesEnabled,
      defaultSettings.runtimeWindowTitlesEnabled
    ),
    runtimeCandidatesEnabled: pickBoolean(
      settings.runtimeCandidatesEnabled,
      defaultSettings.runtimeCandidatesEnabled
    ),
    defaultView: pickEnum(settings.defaultView, defaultViewValues, defaultSettings.defaultView),
    inspector: pickEnum(settings.inspector, inspectorValues, defaultSettings.inspector),
    fontScale: pickEnum(settings.fontScale, fontScaleValues, defaultSettings.fontScale),
    fontMode: pickEnum(settings.fontMode, fontModeValues, defaultSettings.fontMode),
    fontPreset: pickEnum(settings.fontPreset, fontPresetValues, defaultSettings.fontPreset),
    unifiedFont: pickFont(settings.unifiedFont, defaultSettings.unifiedFont),
    latinFont: pickFont(settings.latinFont, defaultSettings.latinFont),
    chineseFont: pickFont(settings.chineseFont, defaultSettings.chineseFont),
    japaneseFont: pickFont(settings.japaneseFont, defaultSettings.japaneseFont),
    koreanFont: pickFont(settings.koreanFont, defaultSettings.koreanFont),
    codeFont: pickFont(settings.codeFont, defaultSettings.codeFont),
    uiLineHeight: pickEnum(settings.uiLineHeight, lineHeightValues, defaultSettings.uiLineHeight),
    searchLimit: clampNumber(settings.searchLimit, 8, 80, defaultSettings.searchLimit),
    suggestionsEnabled: pickBoolean(settings.suggestionsEnabled, defaultSettings.suggestionsEnabled),
    transcriptPreviewEnabled: pickBoolean(
      settings.transcriptPreviewEnabled,
      defaultSettings.transcriptPreviewEnabled
    ),
    showUnknownCandidates: pickBoolean(
      settings.showUnknownCandidates,
      defaultSettings.showUnknownCandidates
    )
  };
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

function pickFont(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : fallback;
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeHexColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  const shortHex = /^#([0-9a-f]{3})$/i.exec(trimmed);
  if (shortHex?.[1]) {
    return `#${shortHex[1]
      .split("")
      .map((char) => char + char)
      .join("")
      .toLowerCase()}`;
  }
  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed.toLowerCase() : undefined;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;
}

createRoot(document.getElementById("root")!).render(<App />);
