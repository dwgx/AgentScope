import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Database,
  FileJson,
  FileText,
  GitBranch,
  LayoutList,
  MonitorCog,
  Palette,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Terminal
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AgentKind, AgentProcess, AgentSession, Diagnostic, Evidence, Relation, ScopeSnapshot, SessionCandidate } from "@agentscope/shared";
import "./styles.css";

type View = "processes" | "sessions" | "graph" | "doctor" | "settings";
type SettingsSection = "general" | "appearance" | "indexing" | "runtime" | "diagnostics";
type SelectionKey = { type: "session"; id: string } | { type: "process"; pid: number } | null;
type Selection = { type: "session"; value: AgentSession } | { type: "process"; value: AgentProcess } | null;

function App() {
  const [snapshot, setSnapshot] = useState<ScopeSnapshot | null>(null);
  const [doctor, setDoctor] = useState<Diagnostic[]>([]);
  const [view, setView] = useState<View>("processes");
  const [selectionKey, setSelectionKey] = useState<SelectionKey>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);

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
  }, []);

  async function runSearch() {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setResults(await window.agentscope.search(query, 24));
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

  return (
    <main className="shell">
      <Sidebar view={view} setView={setView} warnings={counts.warnings} loading={loading} onRefresh={() => void refresh()} />
      <section className="workspace">
        <CommandBar
          query={query}
          setQuery={setQuery}
          runSearch={() => void runSearch()}
          counts={counts}
          loading={loading}
          onRefresh={() => void refresh()}
        />
        {results.length > 0 && <SearchResults results={results} onPick={() => setResults([])} />}
        <div className="content">
          <section className="listPane">
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
            {view === "settings" && <SettingsPanel doctor={doctor} processes={processes} sessions={sessions} />}
          </section>
          <Inspector selected={selected} relations={relations} />
        </div>
      </section>
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
  query: string;
  setQuery: (value: string) => void;
  runSearch: () => void;
  counts: { sessions: number; processes: number; codex: number; claude: number; matched: number; warnings: number };
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <header className="commandBar">
      <div className="menuText">
        <span>File</span>
        <span>View</span>
        <span>Trace</span>
        <span>Help</span>
      </div>
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

function SettingsPanel(props: { doctor: Diagnostic[]; processes: AgentProcess[]; sessions: AgentSession[] }) {
  const [section, setSection] = useState<SettingsSection>("general");
  const [defaultView, setDefaultView] = useState("Processes");
  const [density, setDensity] = useState("Compact");
  const [motion, setMotion] = useState(true);
  const [theme, setTheme] = useState("Graphite");
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
                  <Toggle checked />
                </SettingRow>
                <SettingRow label="Default view" detail="Entry point used when AgentScope opens.">
                  <SegmentedControl value={defaultView} values={["Processes", "Sessions"]} onChange={setDefaultView} />
                </SettingRow>
              </SettingGroup>
              <SettingGroup title="Workspace">
                <SettingRow label="Inspector" detail="Right rail keeps runtime evidence visible while switching main views.">
                  <Badge text="pinned" />
                </SettingRow>
                <SettingRow label="Search scope" detail="SQLite title/preview plus local Codex and Claude JSONL transcripts.">
                  <Badge text="local" tone="ok" />
                </SettingRow>
              </SettingGroup>
            </>
          )}
          {section === "appearance" && (
            <>
              <SettingGroup title="Appearance">
                <SettingRow label="Theme" detail="Flat graphite metal with cool blue state accents.">
                  <SegmentedControl value={theme} values={["Graphite", "Blue", "Contrast"]} onChange={setTheme} />
                </SettingRow>
                <SettingRow label="Density" detail="Controls row spacing in process and session lists.">
                  <SegmentedControl value={density} values={["Compact", "Roomy"]} onChange={setDensity} />
                </SettingRow>
                <SettingRow label="Motion" detail="Subtle transitions for row selection and setting section changes.">
                  <button className={`toggleButton ${motion ? "on" : ""}`} onClick={() => setMotion((value) => !value)}>
                    {motion ? "On" : "Off"}
                  </button>
                </SettingRow>
              </SettingGroup>
              <SettingGroup title="Typography">
                <SettingRow label="UI font" detail="Segoe UI Variable">
                  <CodeValue value="system" />
                </SettingRow>
                <SettingRow label="Code font" detail="Cascadia Code">
                  <CodeValue value="mono" />
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
                  <Badge text="weak" />
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

function Toggle(props: { checked?: boolean }) {
  return <span className={`toggle ${props.checked ? "checked" : ""}`} />;
}

function SegmentedControl(props: { value: string; values: string[]; onChange: (value: string) => void }) {
  return (
    <span className="segmented">
      {props.values.map((value) => (
        <button className={props.value === value ? "active" : ""} key={value} onClick={() => props.onChange(value)}>
          {value}
        </button>
      ))}
    </span>
  );
}

function CodeValue(props: { value: string }) {
  return <span className="codeValue mono">{props.value}</span>;
}

function Inspector(props: { selected: Selection; relations: Relation[] }) {
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
          <CandidateList candidates={process.sessionCandidates ?? []} />
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

function CandidateList(props: { candidates: SessionCandidate[] }) {
  if (!props.candidates.length) return <p className="muted blockText">No candidate session. AgentScope will not guess without PID, cwd, transcript, title, or time evidence.</p>;
  return (
    <div className="candidateList">
      {props.candidates.map((candidate) => (
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

function strongCandidates(process: AgentProcess) {
  return (process.sessionCandidates ?? []).filter((candidate) => candidate.confidence === "exact" || candidate.confidence === "heuristic");
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

createRoot(document.getElementById("root")!).render(<App />);
