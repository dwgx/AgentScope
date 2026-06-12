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
      openJournal: "Open journal",
      revealJournal: "Reveal journal",
      repair: "Repair",
      advice: "Advice",
      retry: "Retry",
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
      diagnostic: "diagnostic",
      pid: "PID",
      protected: "protected",
      unknown: "unknown",
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
      evidence: "Evidence path",
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
    codexControl: "Codex Control",
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
    noResults: "No matching safe metadata",
    typeToSearch: "Type to search indexed sessions and safe metadata",
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
      doctor: "Inspect diagnostics and repair guidance",
      codexControl: "Edit Codex configuration surfaces",
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
      helperNoCandidate: "Helper process; no direct session id or transcript evidence.",
      weakEvidence: "weak evidence",
      candidate: "candidate",
      score: "evidence {{score}}",
      allProcesses: "All processes",
      taskRoot: "Task root PID {{pid}}",
      noParentPid: "No parent PID",
      noCwdCandidate: "No cwd candidate",
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
        task: "Task",
        role: "Role",
        agent: "Agent",
        parent: "Parent",
        cwd: "cwd",
        none: "Flat"
      },
      context: {
        inspect: "Inspect process",
        jumpSession: "Jump to session",
        directSessionEvidence: "Direct session evidence"
      },
      roles: {
        codex_cli: "Codex CLI",
        codex_engine: "Codex engine",
        codex_node_repl: "Subagent runtime",
        codex_app_server: "Codex app-server",
        codex_mcp_tool: "MCP tool",
        codex_tool_kernel: "Tool kernel",
        claude_cli: "Claude CLI",
        claude_daemon: "Claude daemon",
        agent_helper: "Agent helper",
        unknown: "Unknown role"
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
      kind: {
        child: "child",
        subagent: "subagent",
        subagentCandidate: "subagent candidate"
      },
      kindFilter: {
        label: "Type",
        all: "All",
        root: "Root",
        child: "Child",
        subagent: "Subagent"
      },
      context: {
        selectedCount: "{{count}} sessions selected"
      },
      allSessions: "All sessions",
      rootNoParent: "Root / no parent",
      parentGroup: "Parent: {{title}}",
      noCwd: "No cwd",
      recycle: {
        title: "Recycle bin",
        subtitle: "{{count}} quarantined, {{restorable}} restorable",
        loading: "Scanning quarantine entries...",
        error: "Quarantine scan failed",
        empty: "No quarantined sessions.",
        restore: "Restore",
        restoreTitle: "Restore this quarantined session from its validated backup.",
        restoredAction: "Restored",
        blockedAction: "Blocked",
        unavailableAction: "Unavailable",
        restoreBlocked: "This quarantine entry is not restorable.",
        parent: "Parent {{id}}",
        evidence: "{{files}} files / {{db}} DB steps",
        reason: {
          restored: "Already restored",
          conflict: "Local conflict",
          missingBackup: "Missing backup",
          invalid: "Invalid journal",
          blocked: "Blocked"
        },
        status: {
          restorable: "restorable",
          restored: "restored",
          blocked: "blocked",
          missing_backup: "missing backup",
          invalid: "invalid"
        }
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
      filteredEmptyTitle: "No matching relations",
      filteredEmptyDetail: "Adjust relation type, confidence, or search text to show matching graph edges.",
      subtitle_one: "{{count}} session/process graph edge",
      subtitle_other: "{{count}} session/process graph edges",
      filter: {
        kind: "Kind",
        confidence: "Confidence",
        spawnStatus: "Spawn",
        all: "All",
        open: "open",
        closed: "closed",
        unknown: "unknown",
        search: "Filter sessions, paths, evidence"
      }
    },
    doctor: {
      emptyTitle: "Doctor has not run",
      emptyDetail: "Refresh to run local environment checks.",
      subtitle_one: "{{count}} environment check",
      subtitle_other: "{{count}} environment checks",
      fix: {
        nativeSqlite:
          "Repair rebuilds AgentScope's packaged SQLite native module; this is an app runtime issue, not Codex data corruption.",
        nativeCascade:
          "This SQLite warning is blocked by native.better_sqlite3; fix the native module before editing Codex data.",
        rebuild:
          "Repair runs the fixed package rebuild path and reports the changed directories/files.",
        revealPath: "Reveal the evidence path: {{path}}",
        manual: "No automatic repair is registered; inspect the evidence path and keep data read-only."
      }
    },
    loading: {
      title: "Reading local agent state",
      detail: "Enumerating Win32_Process, Codex SQLite/JSONL, and Claude session files.",
      errorTitle: "Agent state load failed",
      errorDetail: "{{message}}. Refresh to retry; AgentScope will keep data read-only until a fresh snapshot loads."
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
      codexControl: "Codex Control",
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
      detail: "SQLite identity fields plus safe local Codex and Claude JSONL metadata. Transcript bodies and hidden/internal fields are not searched."
    },
    searchPreview: {
      label: "SQLite preview search",
      detail: "Include Codex SQLite preview text in matching. Results still never display preview body text."
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
    },
    codexControl: {
      title: "Codex configuration surfaces",
      detail:
        "Edits only allowlisted user-owned Codex files. Auth, credentials, logs, history bodies, plugin cache, and memory bodies stay blocked.",
      surfaces: "Codex control surfaces",
      loading: "Loading Codex control surfaces...",
      editable: "editable",
      readOnly: "read-only",
      noChanges: "No Codex control changes to save.",
      dirty: "Unsaved Codex control changes",
      clean: "No pending Codex control changes",
      emptyTab: "No structured controls were found for this tab.",
      changedKeys: "Changed keys",
      savedWithJournal: "Saved. Journal: {{path}}",
      highRiskTitle: "High-risk Codex setting",
      highRiskConfirm:
        "Save these high-risk Codex settings?\n\n{{keys}}\n\n{{warnings}}\n\nAgentScope will write a backup and journal first.",
      confirmSave: "Save anyway",
      readOnlyDetail:
        "This surface is shown as evidence only. AgentScope does not modify it because it is state, cache, vendor-managed, or content-bearing.",
      emptyTitle: "No surface selected",
      emptyDetail: "Choose a Codex config surface to inspect evidence or edit a backed-up document.",
      save: "Save",
      controlSaved: "Codex control saved",
      saved: "Saved. No prior file existed, so no backup was needed.",
      savedWithBackup: "Saved. Backup: {{path}}",
      backupBeforeSave: "Saving checks the sha256 and writes a backup under ~/.agentscope first.",
      redacted: "Sensitive key names were redacted; reload/reveal and edit outside AgentScope.",
      exists: "exists",
      bytes: "bytes",
      updated: "updated",
      modeTitle: "Codex mode defaults",
      modeDetail:
        "Writes only documented config.toml keys. Plan mode inherits the default model and can override reasoning effort.",
      model: "Model",
      reasoning: "Reasoning",
      inheritDefault: "Inherit default",
      unset: "unset",
      planModelNote: "No separate Plan model key is documented; AgentScope shows the inherited default model.",
      reviewReasoningNote: "Review reasoning inherits the default reasoning setting.",
      modeEvidence:
        "Evidence source: OpenAI Codex manual for config keys, plus local config.toml top-level assignments.",
      mode: {
        default: "Default mode",
        plan: "Plan mode",
        review: "Review"
      },
      source: {
        config: "config",
        inherits_default: "inherits",
        unset: "unset"
      },
      tabs: {
        overview: "Overview",
        models: "Models",
        safety: "Safety",
        runtime: "Runtime",
        mcp: "MCP",
        skills: "Skills",
        storage: "Storage",
        advanced: "Advanced",
        files: "Files"
      },
      risk: {
        low: "low",
        medium: "medium",
        high: "high",
        blocked: "blocked"
      },
      auth: {
        present: "protected auth present",
        missing: "no file auth"
      },
      warning: {
        authMetadataOnly:
          "auth.json contains credential material. AgentScope shows metadata only and never opens, edits, or displays token fields.",
        rawConfigBlocked:
          "Raw config editing is blocked so high-risk keys cannot bypass structured confirmation.",
        sensitiveKeysBlocked: "Sensitive key names were detected. Raw config editing is blocked.",
        systemSkillsReadOnly: "System or plugin-provided skills are read-only.",
        pluginWorkflowOnly: "Use Codex plugin workflows for install/remove; AgentScope shows evidence only.",
        sensitiveConfigBlocked: "Sensitive config keys were detected; raw editing is blocked.",
        highRiskConfirm: "High-risk setting; execution requires explicit confirmation.",
        archivedCountUnreadable: "Could not read archived thread count from state_5.sqlite.",
        sqliteMetadataUnreadable: "Could not open this SQLite database read-only for metadata."
      },
      overview: {
        codexHome: "Official CODEX_HOME root. AgentScope inventories metadata only.",
        sqliteHome: "SQLite state root after config/env resolution."
      },
      items: {
        model: {
          label: "Default model",
          detail: "Top-level Codex model used when CLI, app, profile, or project settings do not override it."
        },
        review_model: {
          label: "Review model",
          detail: "Optional model override for Codex review workflows."
        },
        model_reasoning_effort: {
          label: "Default reasoning",
          detail: "Reasoning effort for the default mode."
        },
        plan_mode_reasoning_effort: {
          label: "Plan reasoning",
          detail: "Plan mode reasoning override; model still inherits the default model."
        },
        approval_policy: {
          label: "Approval policy",
          detail: "Controls when Codex asks before running higher-risk operations."
        },
        approvals_reviewer: {
          label: "Approval reviewer",
          detail: "Routes eligible approval prompts through the user or auto-review."
        },
        sandbox_mode: {
          label: "Sandbox mode",
          detail: "Controls local filesystem and network isolation for shell work."
        },
        web_search: {
          label: "Web search",
          detail: "Cached, live, or disabled web search behavior for Codex."
        },
        hide_agent_reasoning: {
          label: "Hide reasoning",
          detail: "Display policy only; AgentScope still does not read hidden vendor reasoning."
        },
        show_raw_agent_reasoning: {
          label: "Show raw reasoning",
          detail: "High-risk display setting. AgentScope never displays hidden vendor reasoning regardless of this value."
        },
        service_tier: {
          label: "Service tier",
          detail: "Optional OpenAI service tier selection when supported by the account/model."
        },
        windows_sandbox: {
          label: "Windows sandbox",
          detail: "Windows-specific sandbox implementation preference."
        },
        features_multi_agent: {
          label: "Multi-agent feature",
          detail: "Feature flag for Codex multi-agent/subagent support when present in this Codex build."
        },
        memories_generate_memories: {
          label: "Generate memories",
          detail: "Controls whether Codex generates memory records. AgentScope does not read memory bodies."
        },
        memories_use_memories: {
          label: "Use memories",
          detail: "Controls whether Codex injects saved memories. AgentScope does not display memory bodies."
        }
      },
      surfaceText: {
        config_global: {
          label: "config.toml",
          detail: "Codex user configuration shared by CLI, IDE, and desktop. Use the structured controls above for safe edits."
        },
        agents_global: {
          label: "AGENTS.md",
          detail: "Personal Codex instructions. Codex Desktop personalization writes here."
        },
        mcp_summary: {
          label: "MCP servers",
          detail: "MCP server tables from config.toml. Edit the config document to change them."
        },
        archive_summary: {
          label: "Archived threads",
          detail: "Archived thread count only; AgentScope does not display archived conversation bodies here."
        },
        memory_summary: {
          label: "Memories",
          detail: "Memory database presence only. AgentScope does not read or edit memory content."
        },
        database_state: {
          label: "state_5.sqlite",
          detail: "Codex state database schema and row-count summary only. Transcript bodies are not read here."
        },
        database_goals: {
          label: "goals_1.sqlite",
          detail: "Codex goals database schema and row-count summary only."
        },
        database_memories: {
          label: "memories_1.sqlite",
          detail: "Codex memories database schema and row-count summary only; memory content is not read."
        },
        database_logs: {
          label: "logs_2.sqlite",
          detail: "Codex logs database schema and row-count summary only. Log body text is not restored or displayed."
        },
        database_dev: {
          label: "sqlite/codex-dev.db",
          detail: "Codex Desktop automation database schema and row-count summary only."
        },
        browser_state: {
          label: "Browser integration",
          detail: "Browser profile/cache presence only. AgentScope does not read browsing data."
        },
        browser_output: {
          label: "Browser automation output",
          detail: "Playwright console/page artifacts counted by extension only; AgentScope does not read page snapshots or console bodies."
        },
        computer_use_state: {
          label: "Computer Use integration",
          detail: "Computer Use local state presence only. AgentScope does not launch desktop control."
        },
        mcp_node_runtime: {
          label: "MCP node runtime",
          detail: "Installed MCP Node runtime metadata. AgentScope does not execute package scripts or inspect package source bodies."
        },
        node_repl_runtime: {
          label: "Node REPL runtime",
          detail: "Node REPL runtime presence and entry count only; active exec bodies stay unread."
        },
        tmp_arg0: {
          label: "Codex arg temp files",
          detail: "Temporary command argument folders counted only. AgentScope does not open generated command files here."
        },
        vendor_imports_cache: {
          label: "Vendor imports cache",
          detail: "Vendor import cache presence only; cached marketplace bodies stay unread."
        },
        pets_state: {
          label: "Pets state",
          detail: "Codex Desktop local state presence only."
        },
        plugins_summary: {
          label: "Plugins",
          detail: "Installed plugin cache and config summary. AgentScope does not edit plugin cache bytes directly."
        },
        rules: {
          label: "Rule file",
          detail: "Codex command approval rules in the user config layer."
        },
        skill: {
          label: "User skill",
          detail: "User skill authoring surface. AgentScope edits only SKILL.md and backs it up first."
        },
        skillReadOnly: {
          label: "Read-only skill",
          detail: "Bundled/system skill surface. AgentScope keeps it read-only."
        }
      },
      mcpTitle: "MCP servers from config.toml",
      noMcp: "No MCP server table was found in the current config.toml.",
      kind: {
        config: "Config",
        agents: "Instructions",
        rules: "Rules",
        skill: "Skill",
        plugin: "Plugin",
        mcp: "MCP",
        browser: "Browser",
        computer_use: "Computer Use",
        database: "Database",
        runtime: "Runtime",
        cache: "Cache",
        memory: "Memory",
        archive: "Archives"
      }
    }
  },
  inspector: {
    nothingTitle: "Nothing selected",
    nothingDetail: "Choose a process or session to inspect evidence.",
    likelySessions: "Likely Sessions",
    processRole: "Process Role",
    runtime: "Runtime",
    identity: "Identity",
    transcript: "Transcript",
    modelRuntime: "Model + Runtime",
    codexSpawn: "Codex Spawn",
    processRuntime: "Process Runtime",
    control: "Safe Control",
    indexMetadata: "Index Metadata",
    relations: "Relations",
    relationDetail: "Relation Detail",
    endpoints: "Endpoints",
    evidence: "Evidence",
    searchHit: "Search Hit",
    safeSearchHitDetail: "Safe search shows only event metadata, matched fields, and file location; transcript body text is not displayed.",
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
      "Safe mode launches only bounded Codex/Claude resume or fork commands; delete still requires backup, quarantine, and journal. Read-only blocks launch, backup, delete, import, and repair.",
    launchAction: {
      resume: "resume",
      fork: "fork"
    },
    actions: {
      openTranscript: "Open transcript",
      revealTranscript: "Reveal transcript",
      backupSession: "Back up session",
      backupSessions: "Back up {{count}} sessions",
      deleteSession: "Delete session",
      deleteSessions: "Delete {{count}} sessions",
      resumeSession: "Resume in agent",
      forkSession: "Fork in agent",
      resumeInAgent: "Resume in {{agent}}",
      forkInAgent: "Fork in {{agent}}",
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
      role: "Role",
      rootPid: "Root PID",
      parentAgentPid: "Agent parent",
      roleEvidence: "Role evidence",
      session: "Session",
      source: "Source",
      target: "Target",
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
      spawnStatus: "Spawn",
      depth: "Depth",
      agentNickname: "Agent",
      agentRole: "Role",
      agentPath: "Agent path",
      sourceKind: "Source kind",
      runtimeSessionId: "Runtime id",
      runtimeWorkingDir: "Runtime cwd",
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
    sessionRestored: "Session restored from quarantine",
    sessionLaunchStarted: "{{agent}} {{action}} started",
    sessionLaunchUnsupported: "This session cannot be launched by Codex/Claude controls",
    deletePlanWritten: "Delete plan written: {{path}}",
    deletePlanUnavailable: "No delete plan could be written",
    deletePlanPartial: "Delete plans written for {{count}}/{{total}} sessions",
    importPlanWritten: "Import plan written: {{path}}",
    importPlanCanceled: "Import planning canceled",
    settingsReset: "Settings reset",
    cacheCleared: "Application cache cleared",
    diagnosticRepairComplete: "Diagnostic repair completed",
    diagnosticAdvice: "Diagnostic repair advice",
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
