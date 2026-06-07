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
      clear: "Clear",
      cancel: "Cancel",
      reveal: "Reveal",
      revealJournal: "Reveal journal",
      repair: "Repair",
      restart: "Restart",
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
      loading: "Loading path",
      path: "Path",
      directory: "Directory",
      file: "File",
      notAllowed: "Path is not in AgentScope's local trace allowlist"
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
  relations: {
    kind: {
      parent_child: "Thread lineage",
      process_parent: "Process tree",
      transcript: "Transcript link",
      subagent: "Subagent"
    },
    endpoint: {
      parent_child: { source: "Parent session", target: "Child session" },
      process_parent: { source: "Parent PID", target: "Child PID" },
      transcript: { source: "Session", target: "Transcript" },
      subagent: { source: "Parent session", target: "Subagent" }
    }
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
    palettePlaceholder: "Search sessions, paths, events, and commands",
    proc: "Proc",
    matched: "Matched",
    warn: "Warn",
    refreshTitle: "Refresh",
    results: "Results",
    clearSearch: "Clear search",
    history: "Recent searches",
    noHistory: "No recent searches",
    suggestions: "Maybe you want",
    noSuggestions: "No contextual suggestions yet",
    autoSearch: "searches as you type",
    contextTitle: "Suggestions for {{view}}",
    suggestion: {
      refresh: "Refresh current index",
      processes: "Inspect live Win32 processes",
      sessions: "Browse indexed sessions",
      relations: "Review process and session graph",
      settings: "Tune workspace behavior",
      query: "Search {{kind}}"
    }
  },
  views: {
    processes: {
      emptyTitle: "No related processes",
      emptyDetail: "Codex, Claude, node_repl, app-server, or daemon processes were not found.",
      captureOffTitle: "Runtime capture is off",
      captureOffDetail: "Enable Win32_Process in Settings > Runtime to show live agent processes.",
      subtitle_one: "{{count}} live agent-related Win32 row",
      subtitle_other: "{{count}} live agent-related Win32 rows",
      noCandidate: "No session candidate yet",
      weakEvidence: "weak evidence",
      candidate: "candidate",
      score: "evidence {{score}}",
      groupCount_one: "{{count}} process",
      groupCount_other: "{{count}} processes",
      sort: {
        label: "Sort",
        time: "Time",
        runtime: "Runtime",
        memory: "Memory",
        score: "Evidence",
        tree: "Tree"
      },
      group: {
        label: "Group",
        agent: "Agent",
        parent: "Parent",
        cwd: "cwd",
        none: "Flat"
      },
      context: {
        inspect: "Inspect process",
        jumpSession: "Jump to session"
      }
    },
    sessions: {
      emptyTitle: "No sessions indexed",
      emptyDetail: "Run Doctor to check Codex and Claude local paths.",
      subtitle_one: "{{count}} Claude + Codex record",
      subtitle_other: "{{count}} Claude + Codex records",
      groupCount_one: "{{count}} session",
      groupCount_other: "{{count}} sessions",
      children_one: "{{count}} child",
      children_other: "{{count}} children",
      context: {
        selectedCount: "{{count}} sessions selected"
      },
      group: {
        cwd: "cwd",
        parent: "Parent",
        agent: "Agent",
        none: "Flat"
      }
    },
    relations: {
      emptyTitle: "No relations found",
      emptyDetail: "Codex spawn edges or process relations will appear here when indexed.",
      subtitle_one: "{{count}} session/process graph edge",
      subtitle_other: "{{count}} session/process graph edges",
      filter: {
        kind: "Kind",
        confidence: "Confidence",
        all: "All",
        search: "Filter sessions, paths, evidence"
      }
    },
    doctor: {
      emptyTitle: "Doctor has not run",
      emptyDetail: "Refresh to run local environment checks.",
      subtitle_one: "{{count}} environment check",
      subtitle_other: "{{count}} environment checks"
    },
    loading: {
      title: "Reading local agent state",
      detail: "Enumerating Win32_Process, Codex SQLite/JSONL, and Claude session files."
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
      detail: "Safe mode allows backed-up session controls; read-only blocks backup, delete, import, and repair actions.",
      safe: "Safe",
      readOnly: "Read-only",
      readOnlyBlocked: "Control mode is read-only."
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
    notifications: {
      label: "Notification retention",
      detail: "How long operation notifications stay visible before auto-close."
    },
    searchHistory: {
      label: "Search history",
      detail: "Stores recent search terms locally. Keep disabled for sensitive transcript work.",
      clearLabel: "Clear search history",
      clearDetail_one: "{{count}} stored query.",
      clearDetail_other: "{{count}} stored queries."
    },
    suggestions: {
      label: "Context suggestions",
      detail: "Shows page-aware search prompts from the selected process, session, cwd, model, tool, and diagnostics."
    },
    transcriptPreview: {
      label: "Transcript hit preview",
      detail: "Shows short redacted JSONL excerpts with line numbers when a search result is selected."
    },
    suggestion: {
      theme: "theme",
      language: "language",
      motion: "motion",
      indexing: "indexing",
      runtime: "runtime"
    },
    resetUi: {
      label: "Reset UI settings",
      detail: "Restores theme, density, motion, inspector, font scale, language, and search limit."
    },
    clearCache: {
      label: "Clear app cache",
      detail: "Clears Electron renderer cache under the AgentScope app data directory."
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
    resetAppearance: {
      label: "Reset appearance",
      detail: "Restores theme, density, motion, accent, font preset, font families, and line height."
    },
    uiScale: {
      label: "UI scale",
      detail: "Changes global interface font size.",
      small: "Small",
      normal: "Normal",
      large: "Large"
    },
    fontMode: {
      label: "Font mode",
      detail: "Use one font everywhere, language-aware fallback, or fully custom per language.",
      language: "Language",
      unified: "Unified",
      custom: "Custom"
    },
    fontPreset: {
      label: "Font preset",
      detail: "Apply a tested font stack for Windows, Claude-like reading, Japanese textbook, or dense trace work.",
      windows: "Windows",
      language: "Language",
      claude: "Claude",
      japaneseTextbook: "Textbook",
      dense: "Dense",
      custom: "Custom"
    },
    lineHeight: {
      label: "Line height",
      detail: "Controls vertical rhythm for mixed language text and dense evidence rows.",
      compact: "Compact",
      normal: "Normal",
      spacious: "Spacious"
    },
    fonts: {
      unified: "Unified UI font",
      unifiedDetail: "Used when Font mode is Unified. PingFang, Inter, Anthropic Sans, and other installed fonts can be typed manually.",
      latin: "English / Latin font",
      latinDetail: "Primary font for English menus, labels, and numbers.",
      chinese: "Chinese font",
      chineseDetail: "Fallback for Simplified/Traditional Chinese labels and transcript text.",
      japanese: "Japanese font",
      japaneseDetail: "Yu Gothic UI is compact; UD Digi Kyokasho gives a textbook reading style.",
      korean: "Korean font",
      koreanDetail: "Malgun Gothic is the Windows-native Korean UI baseline.",
      detected: "Installed fonts",
      detectedDetail_one: "{{count}} font family detected on this Windows profile.",
      detectedDetail_other: "{{count}} font families detected on this Windows profile."
    },
    fontPreview: {
      title: "Typography preview"
    },
    codeFont: {
      label: "Code font",
      detail: "Code, paths, command lines, IDs, and tabular evidence."
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
    modelRuntime: "Model + Runtime",
    control: "Safe Control",
    indexMetadata: "Index Metadata",
    relations: "Relations",
    evidence: "Evidence",
    searchHit: "Search Hit",
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
    safeControlDetail:
      "Read-only mode: open, reveal, resume command generation, and export are allowed; kill/archive stay disabled until explicit force controls exist.",
    actions: {
      openTranscript: "Open transcript",
      revealTranscript: "Reveal transcript",
      backupSession: "Back up session",
      backupSessions: "Back up {{count}} sessions",
      deleteSession: "Delete session",
      deleteSessions: "Delete {{count}} sessions",
      importSession: "Import session",
      writeDeletePlan: "Write delete plan",
      planImport: "Plan import"
    },
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
      cacheWrite: "Cache write",
      modelProvider: "Provider",
      model: "Model",
      reasoningEffort: "Effort",
      tokensUsed: "Tokens used",
      approvalMode: "Approval",
      sandboxPolicy: "Sandbox",
      entrypoint: "Entrypoint",
      resumeCommand: "Resume",
      safeControl: "Boundary"
    }
  },
  toast: {
    snapshotCanceled: "Export canceled",
    snapshotExported: "Snapshot exported",
    externalOpened: "Opened external link",
    externalBlocked: "Blocked external link",
    openFailed: "Open failed: {{message}}",
    pathOpened: "Opened path",
    pathRevealed: "Revealed path",
    sessionBackedUp: "Session backup written",
    sessionsBackedUp: "Backed up {{count}}/{{total}} sessions",
    noSessionsBackedUp: "No sessions were backed up",
    sessionDeleted: "Session moved to quarantine",
    sessionsDeleted: "Moved {{count}}/{{total}} sessions to quarantine",
    noSessionsDeleted: "No sessions were deleted",
    sessionImported: "Session imported from backup",
    deletePlanWritten: "Delete plan written: {{path}}",
    deletePlanUnavailable: "No delete plan could be written",
    deletePlanPartial: "Delete plans written for {{count}}/{{total}} sessions",
    importPlanWritten: "Import plan written: {{path}}",
    importPlanCanceled: "Import planning canceled",
    settingsReset: "Settings reset",
    cacheCleared: "Application cache cleared",
    diagnosticRepairComplete: "Diagnostic repair completed",
    operationFailed: "Operation failed: {{message}}"
  },
  confirm: {
    deleteSessionTitle: "Delete session",
    deleteSessionsTitle: "Delete {{count}} sessions",
    deleteSession:
      "Delete this session?\n\n{{title}}\n\nBackup:\n{{backupDir}}\n\nQuarantine:\n{{quarantineDir}}\n\nJournal:\n{{journalPath}}\n\nAgentScope will back it up first, write the journal, then remove verified local references and move session files to quarantine. Active exact PID and high-confidence Codex process candidates are blocked.",
    deleteSessions:
      "Delete {{count}} selected sessions?\n\nFirst backup:\n{{backupDir}}\n\nFirst quarantine:\n{{quarantineDir}}\n\nFirst journal:\n{{journalPath}}\n\nAgentScope will process each session with its own backup, quarantine directory, and journal. Core blockers still apply per session."
  }
} as const;
