import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  FileText,
  GitBranch,
  LayoutList,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AgentProcess, AgentSession, Diagnostic, Evidence, Relation, ScopeSnapshot } from "@agentscope/shared";
import "./styles.css";

type View = "sessions" | "processes" | "graph" | "doctor";
type Selection = { type: "session"; value: AgentSession } | { type: "process"; value: AgentProcess } | null;

function App() {
  const [snapshot, setSnapshot] = useState<ScopeSnapshot | null>(null);
  const [doctor, setDoctor] = useState<Diagnostic[]>([]);
  const [view, setView] = useState<View>("sessions");
  const [selected, setSelected] = useState<Selection>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const [nextSnapshot, nextDoctor] = await Promise.all([window.agentscope.getSnapshot(), window.agentscope.getDoctor()]);
      setSnapshot(nextSnapshot);
      setDoctor(nextDoctor);
      setSelected((current) => current ?? firstSelection(nextSnapshot));
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
  const counts = useMemo(
    () => ({
      sessions: sessions.length,
      processes: processes.length,
      codex: sessions.filter((item) => item.agent === "codex").length,
      claude: sessions.filter((item) => item.agent === "claude").length,
      warnings: doctor.filter((item) => item.status === "warn").length
    }),
    [sessions, processes, doctor]
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
            {view === "sessions" && (
              <SessionList
                sessions={sessions}
                selectedId={selected?.type === "session" ? selected.value.sessionId : undefined}
                onSelect={(session) => setSelected({ type: "session", value: session })}
              />
            )}
            {view === "processes" && (
              <ProcessList
                processes={processes}
                selectedPid={selected?.type === "process" ? selected.value.pid : undefined}
                onSelect={(process) => setSelected({ type: "process", value: process })}
              />
            )}
            {view === "graph" && <RelationList relations={relations} />}
            {view === "doctor" && <DoctorPanel checks={doctor} />}
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
      <div className="brand">
        <div className="brandMark">
          <Sparkles size={18} />
        </div>
        <div>
          <h1>AgentScope</h1>
          <p>Windows agent trace</p>
        </div>
      </div>
      <nav className="nav">
        <NavButton active={props.view === "sessions"} icon={<LayoutList size={18} />} label="Sessions" onClick={() => props.setView("sessions")} />
        <NavButton active={props.view === "processes"} icon={<Activity size={18} />} label="Processes" onClick={() => props.setView("processes")} />
        <NavButton active={props.view === "graph"} icon={<GitBranch size={18} />} label="Relations" onClick={() => props.setView("graph")} />
        <NavButton active={props.view === "doctor"} icon={<ShieldCheck size={18} />} label="Doctor" badge={props.warnings} onClick={() => props.setView("doctor")} />
      </nav>
      <button className="refreshButton" onClick={props.onRefresh}>
        <RefreshCw size={16} className={props.loading ? "spin" : ""} />
        <span>Refresh</span>
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
  counts: { sessions: number; processes: number; codex: number; claude: number; warnings: number };
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <header className="commandBar">
      <div className="searchBox">
        <Search size={17} />
        <input
          value={props.query}
          onChange={(event) => props.setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") props.runSearch();
          }}
          placeholder="Search sessions, transcripts, paths"
        />
      </div>
      <div className="statusChips">
        <StatusChip label="Sessions" value={props.counts.sessions} />
        <StatusChip label="Codex" value={props.counts.codex} />
        <StatusChip label="Claude" value={props.counts.claude} />
        <StatusChip label="Processes" value={props.counts.processes} />
        <StatusChip label="Warnings" value={props.counts.warnings} tone={props.counts.warnings ? "warn" : "ok"} />
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

function SessionList(props: { sessions: AgentSession[]; selectedId?: string | undefined; onSelect: (session: AgentSession) => void }) {
  if (!props.sessions.length) {
    return <EmptyState icon={<Database size={22} />} title="No sessions indexed" detail="Run Doctor to check Codex and Claude local paths." />;
  }
  return (
    <>
      <PaneHeader title="Sessions" subtitle={`${props.sessions.length} indexed records`} />
      <div className="rows">
        {props.sessions.map((session) => (
          <button
            className={`sessionRow ${props.selectedId === session.sessionId ? "selected" : ""}`}
            key={`${session.agent}:${session.sessionId}`}
            onClick={() => props.onSelect(session)}
          >
            <AgentPill agent={session.agent} />
            <div className="rowMain">
              <div className="rowTitle">{session.title || short(session.sessionId)}</div>
              <div className="rowMeta">
                <span className="mono">{short(session.sessionId)}</span>
                {session.pid !== undefined && <span>PID {session.pid}</span>}
                {session.updatedAt && <span>{formatDate(session.updatedAt)}</span>}
              </div>
              <div className="rowPath">{session.cwd || session.transcriptPath || "No path evidence"}</div>
            </div>
            <ConfidenceBadge value={session.confidence} />
          </button>
        ))}
      </div>
    </>
  );
}

function ProcessList(props: { processes: AgentProcess[]; selectedPid?: number | undefined; onSelect: (process: AgentProcess) => void }) {
  if (!props.processes.length) {
    return <EmptyState icon={<Activity size={22} />} title="No related processes" detail="AgentScope did not find Codex, Claude, node, app-server, or daemon processes." />;
  }
  return (
    <>
      <PaneHeader title="Processes" subtitle={`${props.processes.length} related Win32_Process rows`} />
      <div className="rows">
        {props.processes.map((process) => (
          <button className={`processRow ${props.selectedPid === process.pid ? "selected" : ""}`} key={process.pid} onClick={() => props.onSelect(process)}>
            <AgentPill agent={process.agent} />
            <div className="rowMain">
              <div className="rowTitle">{process.processName}</div>
              <div className="rowMeta">
                <span>PID {process.pid}</span>
                {process.ppid !== undefined && <span>PPID {process.ppid}</span>}
              </div>
              <div className="rowPath">{process.commandLine || process.executablePath || "No command line"}</div>
            </div>
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
      <PaneHeader title="Relations" subtitle={`${props.relations.length} graph edges`} />
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
    return <EmptyState icon={<ShieldCheck size={22} />} title="Doctor has not run" detail="Refresh to run the local environment checks." />;
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

function Inspector(props: { selected: Selection; relations: Relation[] }) {
  if (!props.selected) {
    return (
      <aside className="inspector">
        <EmptyState icon={<FileText size={22} />} title="Nothing selected" detail="Choose a session or process to inspect evidence." />
      </aside>
    );
  }

  if (props.selected.type === "process") {
    const process = props.selected.value;
    return (
      <aside className="inspector">
        <InspectorHeader title={process.processName} subtitle={`PID ${process.pid}`} agent={process.agent} />
        <FieldGroup title="Process">
          <Field label="PID" value={process.pid} />
          <Field label="PPID" value={process.ppid} />
          <Field label="Executable" value={process.executablePath} mono />
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
        <Field label="Updated" value={session.updatedAt} />
      </FieldGroup>
      <FieldGroup title="Process">
        <Field label="PID" value={session.pid} />
        <Field label="PPID" value={session.ppid} />
        <Field label="Name" value={session.processName} />
        <Field label="Command" value={session.commandLine} mono long />
      </FieldGroup>
      <FieldGroup title="Transcript">
        <Field label="Path" value={session.transcriptPath} mono long />
        <Field label="Index" value={session.indexSource} />
        <Field label="Parent" value={session.parentSessionId} mono />
        <Field label="Children" value={session.childSessionIds.length ? session.childSessionIds.join(", ") : undefined} mono />
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

function firstSelection(snapshot: ScopeSnapshot): Selection {
  if (snapshot.sessions.length) return { type: "session", value: snapshot.sessions.at(-1)! };
  if (snapshot.processes.length) return { type: "process", value: snapshot.processes[0]! };
  return null;
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
