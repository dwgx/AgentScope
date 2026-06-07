export const enUS = {
  app: {
    tagline: "control + trace layer"
  },
  common: {
    agent: {
      codex: "codex",
      claude: "claude",
      unknown: "unknown"
    },
    action: {
      open: "Open",
      refresh: "Refresh",
      reset: "Reset",
      show: "Show",
      hide: "Hide"
    },
    status: {
      ok: "ok",
      warn: "warn",
      local: "local",
      read: "read",
      stream: "stream",
      indexed: "indexed",
      exact: "exact",
      resolved: "resolved",
      on: "on",
      scored: "scored",
      evidence: "evidence",
      pid: "PID",
      readOnly: "read-only"
    },
    confidence: {
      exact: "exact",
      indexed: "indexed",
      heuristic: "heuristic",
      unknown: "unknown"
    },
    date: {
      started: "Started {{date}}",
      updated: "Updated {{date}}"
    },
    path: {
      noCommandLine: "No command line",
      noPathEvidence: "No path evidence",
      noPath: "No path",
      loading: "Loading path"
    }
  },
  nav: {
    processes: "Processes",
    sessions: "Sessions",
    relations: "Relations",
    doctor: "Doctor",
    settings: "Settings",
    system: "System",
    refreshIndex: "Refresh index"
  },
  menu: {
    file: {
      label: "File",
      exportSnapshot: "Export snapshot",
      openAppData: "Open app data",
      openCodexHome: "Open Codex home",
      openClaudeHome: "Open Claude home",
      reloadWindow: "Reload window",
      quit: "Quit AgentScope"
    },
    view: {
      label: "View",
      graphiteTheme: "Graphite theme",
      blueprintTheme: "Blueprint theme",
      highContrast: "High contrast",
      midnightTheme: "Midnight theme",
      toggleInspector: "Toggle inspector"
    },
    trace: {
      label: "Trace",
      refreshIndex: "Refresh index",
      showWeakCandidates: "Show weak candidates",
      openSelectedTranscript: "Open selected transcript",
      revealSelectedTranscript: "Reveal selected transcript",
      openSelectedCwd: "Open selected cwd",
      revealCodexSqlite: "Reveal Codex SQLite"
    },
    help: {
      label: "Help",
      githubRepository: "GitHub repository",
      githubActions: "GitHub Actions",
      issues: "Issues",
      readme: "README"
    },
    detail: {
      json: "JSON",
      jsonl: "JSONL",
      logs: "logs",
      public: "public"
    }
  },
  command: {
    searchPlaceholder: "Search sessions, transcripts, command lines",
    proc: "Proc",
    matched: "Matched",
    warn: "Warn",
    refreshTitle: "Refresh"
  },
  views: {
    processes: {
      emptyTitle: "No related processes",
      emptyDetail: "Codex, Claude, node_repl, app-server, or daemon processes were not found.",
      subtitle_one: "{{count}} live agent-related Win32 row",
      subtitle_other: "{{count}} live agent-related Win32 rows",
      noCandidate: "No session candidate yet",
      weakEvidence: "weak evidence",
      candidate: "candidate",
      score: "score {{score}}"
    },
    sessions: {
      emptyTitle: "No sessions indexed",
      emptyDetail: "Run Doctor to check Codex and Claude local paths.",
      subtitle_one: "{{count}} Claude + Codex record",
      subtitle_other: "{{count}} Claude + Codex records"
    },
    relations: {
      emptyTitle: "No relations found",
      emptyDetail: "Codex spawn edges or process relations will appear here when indexed.",
      subtitle_one: "{{count}} session/process graph edge",
      subtitle_other: "{{count}} session/process graph edges"
    },
    doctor: {
      emptyTitle: "Doctor has not run",
      emptyDetail: "Refresh to run local environment checks.",
      subtitle_one: "{{count}} environment check",
      subtitle_other: "{{count}} environment checks"
    }
  },
  settings: {
    title: "Settings",
    subtitle: "Read-only Windows trace configuration",
    sections: {
      general: "General",
      appearance: "Appearance",
      indexing: "Indexing",
      runtime: "Runtime",
      diagnostics: "Diagnostics",
      workspace: "Workspace",
      typography: "Typography",
      codex: "Codex",
      claude: "Claude",
      runtimeCapture: "Runtime Capture",
      confidence: "Confidence"
    },
    language: {
      label: "Language",
      detail: "Changes AgentScope UI text immediately.",
      system: "System",
      enUS: "English",
      zhCN: "中文",
      jaJP: "日本語",
      koKR: "한국어"
    },
    controlMode: {
      label: "Control mode",
      detail: "Read-only; control actions stay suggested until explicit force options exist."
    },
    defaultView: {
      label: "Default view",
      detail: "Entry point used when AgentScope opens."
    },
    inspector: {
      label: "Inspector",
      detail: "Right rail keeps runtime evidence visible while switching main views.",
      right: "Right",
      hidden: "Hidden"
    },
    searchScope: {
      label: "Search scope",
      detail: "SQLite title/preview plus local Codex and Claude JSONL transcripts."
    },
    searchLimit: {
      label: "Search result limit",
      detail: "Maximum matches returned by the command bar search."
    },
    resetUi: {
      label: "Reset UI settings",
      detail: "Restores theme, density, motion, inspector, font scale, language, and search limit."
    },
    theme: {
      label: "Theme",
      graphite: "Graphite",
      blueprint: "Blue",
      contrast: "Contrast",
      midnight: "Midnight",
      detail: {
        graphite: "Neutral graphite metal with cool state accents.",
        blueprint: "Dark blue operational workspace.",
        contrast: "Maximum contrast black interface.",
        midnight: "Near-black focus theme with muted panels."
      }
    },
    density: {
      label: "Density",
      detail: "Controls row spacing in process and session lists.",
      compact: "Compact",
      comfortable: "Comfortable",
      spacious: "Spacious"
    },
    accent: {
      label: "Accent",
      detail: "Changes selection rails, buttons, and status focus color."
    },
    motion: {
      label: "Motion",
      detail: "Controls transitions, row entrance, hover lift, and animated loading states.",
      full: "Full",
      reduced: "Reduced",
      off: "Off"
    },
    uiScale: {
      label: "UI scale",
      detail: "Changes global interface font size.",
      small: "Small",
      normal: "Normal",
      large: "Large"
    },
    codeFont: {
      label: "Code font",
      detail: "Cascadia Code"
    },
    links: {
      githubLabel: "Open GitHub",
      githubDetail: "Public repository for issues, actions, and releases.",
      readmeLabel: "Open README",
      readmeDetail: "Project overview, CLI commands, and desktop notes."
    },
    indexing: {
      sqliteLabel: "SQLite index",
      codexHomeLabel: "Open Codex home",
      rolloutLabel: "Rollout JSONL",
      spawnEdgesLabel: "Spawn edges",
      spawnEdgesDetail: "thread_spawn_edges parent/child graph.",
      pidSessionsLabel: "PID sessions",
      claudeHomeLabel: "Open Claude home",
      transcriptsLabel: "Transcripts"
    },
    runtime: {
      win32Label: "Win32_Process",
      win32Detail_one: "{{count}} related row; PID, PPID, path, command line, creation time.",
      win32Detail_other: "{{count}} related rows; PID, PPID, path, command line, creation time.",
      windowTitlesLabel: "Window titles",
      windowTitlesDetail: "Get-Process MainWindowTitle when Windows exposes one.",
      candidatesLabel: "Session candidates",
      candidatesDetail_one:
        "{{count}} indexed session scored by PID, cwd, transcript, title, and time evidence.",
      candidatesDetail_other:
        "{{count}} indexed sessions scored by PID, cwd, transcript, title, and time evidence."
    },
    confidence: {
      exactDetail: "Claude PID file or future hook mapping.",
      heuristicDetail: "Strong path/title evidence, with score and reasons shown.",
      unknownDetail: "Weak time-only candidates remain visible but are not treated as matches."
    },
    diagnostics: {
      warningsLabel: "Doctor warnings",
      warningsDetail_one:
        "{{count}} warning across Codex, Claude, SQLite, JSONL, and process scan.",
      warningsDetail_other:
        "{{count}} warnings across Codex, Claude, SQLite, JSONL, and process scan."
    }
  },
  inspector: {
    nothingTitle: "Nothing selected",
    nothingDetail: "Choose a process or session to inspect evidence.",
    likelySessions: "Likely Sessions",
    runtime: "Runtime",
    identity: "Identity",
    transcript: "Transcript",
    indexMetadata: "Index Metadata",
    relations: "Relations",
    evidence: "Evidence",
    activity: "Activity",
    topEvents: "Top Events",
    topTools: "Top Tools",
    models: "Models",
    tokens: "Tokens",
    noEvidence: "No evidence attached.",
    noActivity: "No transcript activity summary available.",
    noCandidate:
      "No candidate session. AgentScope will not guess without PID, cwd, transcript, title, or time evidence.",
    noCwdEvidence: "No cwd evidence",
    fields: {
      pid: "PID",
      ppid: "PPID",
      title: "Title",
      started: "Started",
      executable: "Executable",
      command: "Command",
      session: "Session",
      confidence: "Confidence",
      status: "Status",
      updated: "Updated",
      name: "Name",
      path: "Path",
      index: "Index",
      parent: "Parent",
      children: "Children",
      lines: "Lines",
      bytes: "Bytes",
      firstEvent: "First event",
      lastEvent: "Last event",
      cliVersion: "CLI",
      gitBranch: "Git",
      permission: "Permission",
      mode: "Mode",
      compacted: "Compacted",
      sidechain: "Sidechain",
      parseErrors: "Parse errors",
      inputTokens: "Input",
      outputTokens: "Output",
      cacheRead: "Cache read",
      cacheWrite: "Cache write"
    }
  },
  toast: {
    snapshotCanceled: "Export canceled",
    snapshotExported: "Snapshot exported: {{path}}",
    externalOpened: "Opened {{url}}",
    externalBlocked: "Blocked external URL: {{url}}",
    openFailed: "Open failed: {{message}}",
    pathOpened: "Opened {{path}}",
    pathRevealed: "Revealed {{path}}"
  }
} as const;
