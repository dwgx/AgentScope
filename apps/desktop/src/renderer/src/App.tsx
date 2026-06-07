import { Activity, Database, GitBranch, RefreshCw, Search, ShieldCheck, Terminal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AgentProcess, AgentSession, Diagnostic, ScopeSnapshot } from "@agentscope/shared";
import "./styles.css";

type View = "sessions" | "processes" | "graph" | "doctor";

function App() {
  const [snapshot, setSnapshot] = useState<ScopeSnapshot | null>(null);
  const [doctor, setDoctor] = useState<Diagnostic[]>([]);
  const [view, setView] = useState<View>("sessions");
  const [selected, setSelected] = useState<AgentSession | AgentProcess | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const [nextSnapshot, nextDoctor] = await Promise.all([window.agentscope.getSnapshot(), window.agentscope.getDoctor()]);
      setSnapshot(nextSnapshot);
      setDoctor(nextDoctor);
      setSelected((current) => current ?? nextSnapshot.sessions.at(-1) ?? nextSnapshot.processes[0] ?? null);
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
    setResults(await window.agentscope.search(query, 25));
  }

  const counts = useMemo(() => {
    const sessions = snapshot?.sessions ?? [];
    const processes = snapshot?.processes ?? [];
    return {
      codex: sessions.filter((item) => item.agent === "codex").length,
      claude: sessions.filter((item) => item.agent === "claude").length,
      running: processes.length,
      warnings: doctor.filter((item) => item.status === "warn").length
    };
  }, [snapshot, doctor]);

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <Terminal size={22} />
          <div>
            <h1>AgentScope</h1>
            <p>Local agent trace console</p>
          </div>
        </div>
        <NavButton active={view === "sessions"} icon={<Database size={17} />} label="Sessions" onClick={() => setView("sessions")} />
        <NavButton active={view === "processes"} icon={<Activity size={17} />} label="Processes" onClick={() => setView("processes")} />
        <NavButton active={view === "graph"} icon={<GitBranch size={17} />} label="Graph" onClick={() => setView("graph")} />
        <NavButton active={view === "doctor"} icon={<ShieldCheck size={17} />} label="Doctor" onClick={() => setView("doctor")} />
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="metrics">
            <Metric label="Codex" value={counts.codex} />
            <Metric label="Claude" value={counts.claude} />
            <Metric label="Processes" value={counts.running} />
            <Metric label="Warnings" value={counts.warnings} tone={counts.warnings ? "warn" : "ok"} />
          </div>
          <button className="iconButton" onClick={() => void refresh()} title="Refresh">
            <RefreshCw size={17} className={loading ? "spin" : ""} />
          </button>
        </header>

        <div className="searchbar">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void runSearch();
            }}
            placeholder="Search transcripts, titles, previews"
          />
          <button onClick={() => void runSearch()}>Search</button>
        </div>

        {results.length > 0 && <SearchResults results={results} />}

        <div className="content">
          <section className="primary">
            {view === "sessions" && <SessionsTable sessions={snapshot?.sessions ?? []} onSelect={setSelected} />}
            {view === "processes" && <ProcessesTable processes={snapshot?.processes ?? []} onSelect={setSelected} />}
            {view === "graph" && <GraphView snapshot={snapshot} />}
            {view === "doctor" && <DoctorView checks={doctor} />}
          </section>
          <InspectPanel selected={selected} />
        </div>
      </section>
    </main>
  );
}

function NavButton(props: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button className={`navButton ${props.active ? "active" : ""}`} onClick={props.onClick}>
      {props.icon}
      <span>{props.label}</span>
    </button>
  );
}

function Metric(props: { label: string; value: number; tone?: "ok" | "warn" }) {
  return (
    <div className={`metric ${props.tone ?? ""}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function SessionsTable(props: { sessions: AgentSession[]; onSelect: (session: AgentSession) => void }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Agent</th>
          <th>Session</th>
          <th>PID</th>
          <th>Confidence</th>
          <th>CWD</th>
          <th>Title</th>
          <th>Updated</th>
        </tr>
      </thead>
      <tbody>
        {props.sessions.map((session) => (
          <tr key={`${session.agent}:${session.sessionId}`} onClick={() => props.onSelect(session)}>
            <td><Badge text={session.agent} /></td>
            <td className="mono">{short(session.sessionId)}</td>
            <td>{session.pid ?? ""}</td>
            <td><ConfidenceBadge value={session.confidence} /></td>
            <td className="path">{session.cwd}</td>
            <td>{session.title}</td>
            <td>{session.updatedAt}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ProcessesTable(props: { processes: AgentProcess[]; onSelect: (process: AgentProcess) => void }) {
  return (
    <table>
      <thead>
        <tr>
          <th>PID</th>
          <th>PPID</th>
          <th>Agent</th>
          <th>Name</th>
          <th>Command</th>
        </tr>
      </thead>
      <tbody>
        {props.processes.map((process) => (
          <tr key={process.pid} onClick={() => props.onSelect(process)}>
            <td>{process.pid}</td>
            <td>{process.ppid ?? ""}</td>
            <td><Badge text={process.agent} /></td>
            <td>{process.processName}</td>
            <td className="path">{process.commandLine}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DoctorView(props: { checks: Diagnostic[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Check</th>
          <th>Status</th>
          <th>Detail</th>
        </tr>
      </thead>
      <tbody>
        {props.checks.map((check) => (
          <tr key={check.name}>
            <td>{check.name}</td>
            <td><Badge text={check.status} tone={check.status === "ok" ? "ok" : "warn"} /></td>
            <td className="path">{check.detail}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GraphView(props: { snapshot: ScopeSnapshot | null }) {
  const relations = props.snapshot?.relations ?? [];
  return (
    <div className="graphList">
      {relations.map((relation, index) => (
        <div className="relation" key={`${relation.kind}:${relation.sourceId}:${relation.targetId}:${index}`}>
          <Badge text={relation.kind} />
          <span className="mono">{short(relation.sourceId)}</span>
          <span>to</span>
          <span className="mono">{short(relation.targetId)}</span>
          <ConfidenceBadge value={relation.confidence} />
        </div>
      ))}
    </div>
  );
}

function SearchResults(props: { results: Record<string, unknown>[] }) {
  return (
    <section className="results">
      {props.results.map((result, index) => (
        <div className="result" key={index}>
          <Badge text={String(result.agent ?? "")} />
          <span>{String(result.source ?? "")}</span>
          <span className="mono">{short(String(result.sessionId ?? ""))}</span>
          <span className="path">{String(result.title ?? result.text ?? result.path ?? "")}</span>
        </div>
      ))}
    </section>
  );
}

function InspectPanel(props: { selected: AgentSession | AgentProcess | null }) {
  return (
    <aside className="inspect">
      <h2>Inspect</h2>
      {props.selected ? <pre>{JSON.stringify(props.selected, null, 2)}</pre> : <p>No selection</p>}
    </aside>
  );
}

function Badge(props: { text: string; tone?: "ok" | "warn" | undefined }) {
  return <span className={`badge ${props.tone ?? ""}`}>{props.text}</span>;
}

function ConfidenceBadge(props: { value: string }) {
  const tone = props.value === "exact" ? "ok" : props.value === "heuristic" ? "warn" : undefined;
  return <Badge text={props.value} tone={tone} />;
}

function short(value?: string) {
  if (!value) return "";
  return value.length > 24 ? `${value.slice(0, 8)}...${value.slice(-8)}` : value;
}

createRoot(document.getElementById("root")!).render(<App />);
