const agentMarkSvg = `
  <svg class="agentGlyph" width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5.4 7.1c0-1.2 1-2.1 2.1-2.1h9c1.2 0 2.1 1 2.1 2.1v8.2c0 1.2-1 2.1-2.1 2.1h-9c-1.2 0-2.1-1-2.1-2.1V7.1Z" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round" />
    <path d="M8.2 10.6h4.1M8.2 13.8h2.2M15.6 8.7v3.1M14 10.2h3.1" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" />
    <path d="M12.5 17.6v2.2h3.3M18.6 17.4l2.1 2.1" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="18" cy="19.8" r="1.25" fill="currentColor" />
    <circle cx="20.6" cy="20.4" r=".8" fill="currentColor" />
  </svg>`;

const locales = {
  "en-US": {
    metaDescription:
      "AgentScope is a Windows desktop console for tracing and safely controlling local Codex and Claude Code sessions with evidence-backed associations.",
    nav: { product: "Product", evidence: "Evidence", safety: "Safety", control: "Codex Control", download: "Download" },
    hero: {
      eyebrow: "Windows desktop console",
      lede:
        "Trace local Codex and Claude Code processes, explain session relationships with evidence and confidence, and keep risky operations behind plans, backups, quarantine records, and journals.",
      download: "Download v0.1.0",
      repo: "View repository",
      safety: "Safety boundaries"
    },
    release: { assetLabel: "Asset" },
    proof: {
      chatTitle: "Not a chat UI",
      chatBody: "AgentScope observes and controls local coding agent state. It does not replace Codex or Claude Code.",
      kanbanTitle: "Not a Kanban board",
      kanbanBody: "The primary objects are processes, sessions, transcripts, relations, config surfaces, and operation journals.",
      fileTitle: "Not a file manager",
      fileBody: "Privileged local paths stay behind explicit open/reveal allowlists and safety roles."
    },
    product: {
      eyebrow: "Product tour",
      title: "The desktop UI is the product signal.",
      body:
        "The public page should feel like AgentScope itself: dense, controlled, evidence-heavy, and clear about what is known, what is inferred, and what stays blocked."
    },
    evidence: {
      eyebrow: "Evidence model",
      title: "Associations stay explainable.",
      body:
        "AgentScope never turns a weak timing hint into certainty. Each link between a process and a session carries evidence, confidence, and the reason it was scored that way."
    },
    sources: { eyebrow: "Local sources", title: "Index the local state that actually exists." },
    views: { eyebrow: "Core views", title: "A control console, not a chat surface." },
    safety: {
      eyebrow: "Safety boundaries",
      title: "Destructive operations are planned, backed up, and evidenced.",
      body:
        "AgentScope treats local agent state as sensitive. Session delete, import, restore, and config mutation flows are blocked or confirmed before they touch files or SQLite rows."
    },
    control: {
      eyebrow: "Codex Control",
      title: "Structured config changes with read-back verification.",
      body:
        "Raw config.toml editing stays behind structured controls. AgentScope classifies official keys, known local keys, unverified advanced keys, reserved provider IDs, sensitive values, and unsafe TOML before it writes anything."
    },
    app: {
      navSystem: "System",
      search: "Search sessions, cwd, PID, evidence",
      safeMode: "safe mode",
      motion: "motion reduced",
      indexedCount: "12 indexed",
      inspector: "Inspector",
      evidence: "Evidence",
      confidence: "Confidence",
      source: "source",
      level: "level",
      fields: "Fields",
      actions: "Actions",
      rows: {
        processes: "Live process map",
        sessions: "Indexed sessions",
        relations: "Relation graph",
        doctor: "Doctor checks",
        codexControl: "Codex control center",
        settings: "Runtime settings"
      },
      subtitles: {
        processes: "Codex, Claude, MCP helpers, app servers",
        sessions: "Backups, quarantine, journals, restore state",
        relations: "Process-to-session candidates with confidence",
        doctor: "Local stores, runtime, safety and release checks",
        codexControl: "Structured config surfaces and mutation previews",
        settings: "Safe mode, language, density, motion, indexing"
      },
      views: {
        processes: "Processes",
        sessions: "Sessions",
        relations: "Relations",
        doctor: "Doctor",
        codexControl: "Codex Control",
        settings: "Settings"
      },
      filters: { all: "all", exact: "exact", indexed: "indexed", heuristic: "heuristic", unknown: "unknown" },
      empty: "Select a row to inspect evidence."
    },
    codexDemo: {
      title: "Applying structured patch",
      detail: "config.toml current snapshot loaded",
      phase: { animating: "preparing", writing: "writing", success: "verified", error: "blocked" },
      scenarios: {
        safe: "Safe template write",
        advanced: "Advanced key warning",
        error: "Blocked sensitive write"
      }
    }
  },
  "zh-CN": {
    metaDescription: "AgentScope 是 Windows 桌面控制台，用 evidence-backed 关联追踪并安全控制本机 Codex 和 Claude Code 会话。",
    nav: { product: "产品", evidence: "证据", safety: "安全", control: "Codex 控制", download: "下载" },
    hero: {
      eyebrow: "Windows 桌面控制台",
      lede: "追踪本机 Codex 和 Claude Code 进程，用证据和置信度解释会话关系，并把高风险操作放在 plan、backup、quarantine 和 journal 之后。",
      download: "下载 v0.1.0",
      repo: "查看仓库",
      safety: "安全边界"
    },
    release: { assetLabel: "资产" },
    proof: {
      chatTitle: "不是聊天 UI",
      chatBody: "AgentScope 观察和控制本机 coding agent 状态，不替代 Codex 或 Claude Code。",
      kanbanTitle: "不是 Kanban",
      kanbanBody: "核心对象是进程、会话、转录路径、关系、配置 surface 和操作 journal。",
      fileTitle: "不是文件管理器",
      fileBody: "特权本地路径必须通过明确的 open/reveal allowlist 和安全角色。"
    },
    product: {
      eyebrow: "产品导览",
      title: "桌面 UI 本身就是产品信号。",
      body: "公开页面应该像 AgentScope 本体一样：高密度、可控、重证据，并清楚区分已知、推测和被阻止的内容。"
    },
    evidence: {
      eyebrow: "证据模型",
      title: "所有关联都保持可解释。",
      body: "AgentScope 不会把弱时间线索变成确定事实。进程和会话之间的每个链接都带 evidence、confidence 和评分原因。"
    },
    sources: { eyebrow: "本机来源", title: "索引真实存在的本机状态。" },
    views: { eyebrow: "核心视图", title: "这是控制台，不是聊天界面。" },
    safety: {
      eyebrow: "安全边界",
      title: "破坏性操作必须先计划、备份并留下证据。",
      body: "AgentScope 把本机 agent 状态当作敏感数据处理。会话删除、导入、恢复和配置 mutation 都会在触碰文件或 SQLite row 前被阻止或确认。"
    },
    control: {
      eyebrow: "Codex 控制",
      title: "结构化配置变更必须读回校验。",
      body: "原始 config.toml 编辑必须走结构化控制。AgentScope 会在写入前区分官方键、已知本地键、未验证高级键、保留 provider ID、敏感值和不安全 TOML。"
    },
    app: {
      navSystem: "系统",
      search: "搜索 session、cwd、PID、证据",
      safeMode: "安全模式",
      motion: "减少动画",
      indexedCount: "12 已索引",
      inspector: "检查器",
      evidence: "证据",
      confidence: "置信度",
      source: "来源",
      level: "级别",
      fields: "字段",
      actions: "操作",
      rows: {
        processes: "实时进程图",
        sessions: "已索引会话",
        relations: "关系图",
        doctor: "Doctor 检查",
        codexControl: "Codex 控制中心",
        settings: "运行时设置"
      },
      subtitles: {
        processes: "Codex、Claude、MCP helper、app server",
        sessions: "备份、隔离区、journal、恢复状态",
        relations: "带置信度的进程到会话候选",
        doctor: "本地存储、运行时、安全和发布检查",
        codexControl: "结构化配置 surface 和 mutation 预览",
        settings: "安全模式、语言、密度、动画、索引"
      },
      views: {
        processes: "进程",
        sessions: "会话",
        relations: "关系",
        doctor: "Doctor",
        codexControl: "Codex 控制",
        settings: "设置"
      },
      filters: { all: "全部", exact: "精确", indexed: "已索引", heuristic: "推测", unknown: "未知" },
      empty: "选择一行查看证据。"
    },
    codexDemo: {
      title: "正在应用结构化 patch",
      detail: "已加载 config.toml 当前快照",
      phase: { animating: "准备中", writing: "写入中", success: "已校验", error: "已阻止" },
      scenarios: {
        safe: "安全模板写入",
        advanced: "高级键警告",
        error: "敏感写入阻止"
      }
    }
  },
  "ja-JP": {
    metaDescription:
      "AgentScope は、ローカルの Codex と Claude Code セッションを evidence-backed な関連付けで追跡し、安全に制御する Windows デスクトップコンソールです。",
    nav: { product: "製品", evidence: "証拠", safety: "安全", control: "Codex 制御", download: "ダウンロード" },
    hero: {
      eyebrow: "Windows デスクトップコンソール",
      lede:
        "ローカルの Codex と Claude Code プロセスを追跡し、証拠と信頼度でセッション関係を説明し、危険な操作を plan、backup、quarantine、journal の後ろに置きます。",
      download: "v0.1.0 をダウンロード",
      repo: "リポジトリを見る",
      safety: "安全境界"
    },
    release: { assetLabel: "アセット" },
    proof: {
      chatTitle: "チャット UI ではありません",
      chatBody: "AgentScope はローカル coding agent の状態を観測し制御します。Codex や Claude Code を置き換えません。",
      kanbanTitle: "Kanban ではありません",
      kanbanBody: "主な対象はプロセス、セッション、transcript パス、関係、設定 surface、操作 journal です。",
      fileTitle: "ファイルマネージャーではありません",
      fileBody: "特権ローカルパスは明示的な open/reveal allowlist と安全ロールの後ろに置かれます。"
    },
    product: {
      eyebrow: "製品ツアー",
      title: "デスクトップ UI そのものが製品シグナルです。",
      body:
        "公開ページは AgentScope 本体のように、密度が高く、制御可能で、証拠を重視し、既知・推測・ブロックを明確に分けます。"
    },
    evidence: {
      eyebrow: "証拠モデル",
      title: "関連付けは説明可能なままです。",
      body: "AgentScope は弱い時刻ヒントを確定事実にしません。プロセスとセッションの各リンクには evidence、confidence、スコア理由があります。"
    },
    sources: { eyebrow: "ローカルソース", title: "実際に存在するローカル状態をインデックスします。" },
    views: { eyebrow: "主要ビュー", title: "チャット画面ではなく制御コンソールです。" },
    safety: {
      eyebrow: "安全境界",
      title: "破壊的操作は計画、バックアップ、証拠化されます。",
      body:
        "AgentScope はローカル agent 状態を機密として扱います。セッション削除、インポート、復元、設定 mutation は、ファイルや SQLite row に触れる前にブロックまたは確認されます。"
    },
    control: {
      eyebrow: "Codex 制御",
      title: "構造化された設定変更は read-back 検証されます。",
      body:
        "生の config.toml 編集は構造化制御の後ろに置かれます。AgentScope は書き込み前に公式キー、既知ローカルキー、未検証高度キー、予約 provider ID、機密値、不安全な TOML を分類します。"
    },
    app: {
      navSystem: "システム",
      search: "session、cwd、PID、evidence を検索",
      safeMode: "セーフモード",
      motion: "低モーション",
      indexedCount: "12 indexed",
      inspector: "インスペクター",
      evidence: "証拠",
      confidence: "信頼度",
      source: "ソース",
      level: "レベル",
      fields: "フィールド",
      actions: "操作",
      rows: {
        processes: "ライブプロセスマップ",
        sessions: "インデックス済みセッション",
        relations: "関係グラフ",
        doctor: "Doctor チェック",
        codexControl: "Codex 制御センター",
        settings: "ランタイム設定"
      },
      subtitles: {
        processes: "Codex、Claude、MCP helper、app server",
        sessions: "バックアップ、隔離、journal、復元状態",
        relations: "信頼度付きの process-to-session 候補",
        doctor: "ローカルストア、ランタイム、安全、リリースチェック",
        codexControl: "構造化 config surface と mutation preview",
        settings: "セーフモード、言語、密度、モーション、インデックス"
      },
      views: {
        processes: "Processes",
        sessions: "Sessions",
        relations: "Relations",
        doctor: "Doctor",
        codexControl: "Codex Control",
        settings: "Settings"
      },
      filters: { all: "すべて", exact: "exact", indexed: "indexed", heuristic: "heuristic", unknown: "unknown" },
      empty: "行を選択すると証拠を表示します。"
    },
    codexDemo: {
      title: "構造化 patch を適用中",
      detail: "config.toml の現在スナップショットを読み込み済み",
      phase: { animating: "準備中", writing: "書き込み中", success: "検証済み", error: "ブロック" },
      scenarios: {
        safe: "安全なテンプレート書き込み",
        advanced: "高度なキーの警告",
        error: "機密設定のブロック"
      }
    }
  }
};

const demoData = {
  processes: [
    {
      id: "codex",
      agent: "codex",
      glyph: "C",
      title: "codex.exe",
      confidence: "indexed",
      tone: "ok",
      meta: ["PID 18428", "root PID 16804", "MCP Tool"],
      path: "%USERPROFILE%\\work\\agentscope-demo",
      evidenceLine: "process.mcp.config + parent tree + command marker",
      inspectorTitle: "playwright helper",
      inspectorSubtitle: "Evidence-backed process identity",
      source: "Codex config metadata",
      evidence: [
        ["process.mcp.config", "Matched server name and safe command summary from Codex TOML.", "mcp_servers.playwright"],
        ["redaction", "Token-like arguments are excluded from MCP command summaries.", "--token <redacted>", "warn"]
      ]
    },
    {
      id: "claude",
      agent: "claude",
      glyph: "Cl",
      title: "claude-code session",
      confidence: "heuristic",
      tone: "heuristic",
      meta: ["PID 19344", "window title", "cwd evidence"],
      path: "%USERPROFILE%\\.claude\\projects\\...",
      evidenceLine: "+42 cwd - project path matched active session map",
      inspectorTitle: "claude-code session",
      inspectorSubtitle: "Heuristic candidate with visible score parts",
      source: "cwd + window title",
      evidence: [
        ["candidate.score", "Strong cwd evidence, but not enough for exact PID binding.", "+42 cwd"],
        ["confidence", "Heuristic remains visible in the UI.", "heuristic", "warn"]
      ]
    },
    {
      id: "node",
      agent: "neutral",
      glyph: "N",
      title: "node helper",
      confidence: "unknown",
      tone: "",
      meta: ["PID 20112", "generic command", "weak evidence"],
      path: "node server.js",
      evidenceLine: "generic runtime is not enough to match MCP config",
      inspectorTitle: "generic node helper",
      inspectorSubtitle: "Weak evidence is not promoted to a match",
      source: "process metadata",
      evidence: [["generic command", "Generic node/python commands cannot identify MCP config by themselves.", "unknown"]]
    }
  ],
  sessions: [
    {
      id: "session-a",
      agent: "codex",
      glyph: "C",
      title: "AgentScope Pages redesign",
      confidence: "exact",
      tone: "ok",
      meta: ["session 7e4f", "child sessions 2", "updated today"],
      path: "%USERPROFILE%\\.codex\\sessions\\2026\\06\\17\\...",
      evidenceLine: "PID map + rollout metadata + cwd evidence",
      inspectorTitle: "AgentScope Pages redesign",
      inspectorSubtitle: "Exact session row with safe operations",
      source: "PID map",
      evidence: [
        ["backup", "Backup writes manifest before destructive operations.", "~/.agentscope/backups/..."],
        ["delete blocker", "Active exact PID mapping blocks delete.", "PID 18428", "warn"]
      ]
    },
    {
      id: "session-b",
      agent: "claude",
      glyph: "Cl",
      title: "Claude local store audit",
      confidence: "indexed",
      tone: "ok",
      meta: ["session d914", "transcript path", "daemon sidecar"],
      path: "%USERPROFILE%\\.claude\\projects\\...",
      evidenceLine: "session map + transcript path evidence",
      inspectorTitle: "Claude local store audit",
      inspectorSubtitle: "Indexed Claude session with reveal-only transcript path",
      source: "Claude session map",
      evidence: [["transcript", "Transcript paths are reveal-only from the website demo perspective.", "%USERPROFILE%\\.claude\\projects\\..."]]
    }
  ],
  relations: [
    {
      id: "rel-a",
      agent: "codex",
      glyph: "R",
      title: "codex.exe -> AgentScope Pages redesign",
      confidence: "indexed",
      tone: "ok",
      meta: ["process", "session", "parent tree"],
      path: "process.mcp.config + rollout metadata",
      evidenceLine: "relation confidence can be filtered",
      inspectorTitle: "Process to session relation",
      inspectorSubtitle: "Indexed relation with multiple evidence sources",
      source: "relation graph",
      evidence: [["relation.edge", "Process parent tree and session metadata support this relation.", "indexed"]]
    },
    {
      id: "rel-b",
      agent: "neutral",
      glyph: "R",
      title: "node helper -> unknown session",
      confidence: "unknown",
      tone: "",
      meta: ["time-only", "weak candidate", "not linked"],
      path: "temporal proximity only",
      evidenceLine: "time-only candidate remains unknown",
      inspectorTitle: "Unknown relation candidate",
      inspectorSubtitle: "Weak signal remains weak",
      source: "time proximity",
      evidence: [["time-only", "Temporal proximity is displayed as weak evidence, not as a match.", "unknown", "warn"]]
    }
  ],
  doctor: [
    {
      id: "doctor-a",
      agent: "neutral",
      glyph: "D",
      title: "Repository audit",
      confidence: "ok",
      tone: "ok",
      meta: ["secrets", "artifacts", "local paths"],
      path: "npm.cmd run audit:repo",
      evidenceLine: "tracked and untracked non-ignored files checked",
      inspectorTitle: "Repository audit",
      inspectorSubtitle: "High-confidence repo hygiene check",
      source: "audit:repo",
      evidence: [["result", "No committed transcript/log/auth/config body or local artifact detected.", "passed"]]
    },
    {
      id: "doctor-b",
      agent: "neutral",
      glyph: "D",
      title: "Command line redaction",
      confidence: "warn",
      tone: "warn",
      meta: ["next work", "renderer display", "evidence summaries"],
      path: "redaction backlog",
      evidenceLine: "raw matching data is not the same as display-safe text",
      inspectorTitle: "Redaction backlog",
      inspectorSubtitle: "A warning remains visible until implemented",
      source: "development runbook",
      evidence: [["risk", "Process commandLine display still needs value redaction before future release claims.", "warn", "warn"]]
    }
  ],
  codexControl: [
    {
      id: "control-a",
      agent: "codex",
      glyph: "Cfg",
      title: "config.toml",
      confidence: "editable",
      tone: "ok",
      meta: ["sha256", "backup", "journal"],
      path: "%USERPROFILE%\\.codex\\config.toml",
      evidenceLine: "structured mutation only, raw editing blocked",
      inspectorTitle: "Structured config surface",
      inspectorSubtitle: "Editable only through verified controls",
      source: "Codex control document",
      evidence: [
        ["verification", "Success requires read-back verification of changed keys.", "changed keys checked"],
        ["new session effect", "Running Codex processes may not hot-reload config.", "warning", "warn"]
      ]
    },
    {
      id: "control-b",
      agent: "codex",
      glyph: "MCP",
      title: "MCP server workbench",
      confidence: "unverified",
      tone: "heuristic",
      meta: ["server table", "enabled flag", "safe summary"],
      path: "mcp_servers.playwright",
      evidenceLine: "generic node command alone is not enough",
      inspectorTitle: "MCP server control",
      inspectorSubtitle: "Evidence-backed server identity",
      source: "Codex TOML metadata",
      evidence: [["reserved", "Built-in provider IDs stay protected from direct edit.", "model_providers.openai.*", "warn"]]
    }
  ],
  settings: [
    {
      id: "settings-a",
      agent: "neutral",
      glyph: "S",
      title: "Control mode",
      confidence: "safe",
      tone: "ok",
      meta: ["safe", "read-only", "localStorage"],
      path: "settings.controlMode",
      evidenceLine: "read-only blocks launch, backup, delete, import and repair",
      inspectorTitle: "Control mode",
      inspectorSubtitle: "Renderer setting mirrored through preload IPC in the app",
      source: "settings",
      evidence: [["mode", "Safe mode permits guarded operations; read-only blocks side effects.", "safe"]]
    },
    {
      id: "settings-b",
      agent: "neutral",
      glyph: "S",
      title: "Motion",
      confidence: "setting",
      tone: "",
      meta: ["full", "reduced", "off"],
      path: "settings.motion",
      evidenceLine: "site demo respects reduced motion preference",
      inspectorTitle: "Motion settings",
      inspectorSubtitle: "Animation can be reduced without hiding state",
      source: "settings",
      evidence: [["motion", "Codex apply demo keeps phase changes visible even when animation is reduced.", "reduced"]]
    }
  ]
};

const codexScenarios = [
  {
    id: "safe",
    phase: "success",
    lines: [
      ["ok", "config.toml current snapshot loaded"],
      ["ok", 'model = "gpt-5.4"'],
      ["ok", 'model_reasoning_effort = "high"'],
      ["writing", "atomic write, fsync, rename, journal"],
      ["ok", "read-back verified 2 changed keys"]
    ]
  },
  {
    id: "advanced",
    phase: "success",
    lines: [
      ["ok", "config.toml current snapshot loaded"],
      ["warn", 'experimental_flag = "on"  # unverified advanced'],
      ["warn", "existing custom provider table preserved"],
      ["writing", "atomic write, fsync, rename, journal"],
      ["ok", "read-back verified 1 changed key"],
      ["warn", "running Codex processes may not hot-reload config"]
    ]
  },
  {
    id: "error",
    phase: "error",
    lines: [
      ["ok", "config.toml current snapshot loaded"],
      ["danger", 'api_key = "<sensitive>"  # blocked key'],
      ["danger", "blocked before write: sensitive config value"],
      ["danger", "no temp file written, no mutation committed"]
    ]
  }
];

const state = {
  lang: detectLanguage(),
  view: "processes",
  selectedId: "codex",
  relationFilter: "all",
  scenarioIndex: 0,
  scenarioLine: 0
};

function detectLanguage() {
  const saved = localStorage.getItem("agentscope.site.language");
  if (saved && locales[saved]) return saved;
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language || "en-US"];
  if (languages.some((lang) => lang.toLowerCase().startsWith("zh"))) return "zh-CN";
  if (languages.some((lang) => lang.toLowerCase().startsWith("ja"))) return "ja-JP";
  return "en-US";
}

function t(path) {
  const parts = path.split(".");
  let value = locales[state.lang];
  for (const part of parts) value = value?.[part];
  return typeof value === "string" ? value : path;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderI18n() {
  document.documentElement.lang = state.lang;
  document.querySelector('meta[name="description"]')?.setAttribute("content", t("metaDescription"));
  for (const node of document.querySelectorAll("[data-i18n]")) {
    node.textContent = t(node.getAttribute("data-i18n"));
  }
  for (const button of document.querySelectorAll("[data-lang]")) {
    button.classList.toggle("active", button.dataset.lang === state.lang);
    button.setAttribute("aria-pressed", button.dataset.lang === state.lang ? "true" : "false");
  }
}

function itemsForCurrentView() {
  let items = demoData[state.view] ?? [];
  if (state.view === "relations" && state.relationFilter !== "all") {
    items = items.filter((item) => item.confidence === state.relationFilter);
  }
  return items;
}

function selectedItem() {
  const items = itemsForCurrentView();
  return items.find((item) => item.id === state.selectedId) ?? items[0] ?? null;
}

function viewOrder() {
  return ["processes", "sessions", "relations", "doctor", "codexControl", "settings"];
}

function renderAppDemo() {
  const root = document.querySelector("[data-app-demo]");
  if (!root) return;
  const selected = selectedItem();
  const items = itemsForCurrentView();
  root.innerHTML = `
    <aside class="appSidebar">
      <div class="windowDots" aria-hidden="true"><span></span><span></span><span></span></div>
      <div class="appBrand">
        <span class="appLogo" aria-hidden="true">${agentMarkSvg}</span>
        <strong>AgentScope</strong>
      </div>
      <nav class="appNav" aria-label="AgentScope demo views">
        ${viewOrder()
          .map((view) => {
            const warn = view === "doctor" ? " warn" : "";
            const count = view === "doctor" ? "<em>2</em>" : "";
            return `<button type="button" class="navItem${state.view === view ? " active" : ""}${warn}" data-view="${view}">${t(`app.views.${view}`)}${count}</button>`;
          })
          .join("")}
      </nav>
      <span class="navLabel">${t("app.navSystem")}</span>
    </aside>
    <section class="appWorkspace">
      <div class="commandBar">
        <span class="searchPill">${t("app.search")}</span>
        <span class="statusChip ok">${t("app.safeMode")}</span>
        <span class="statusChip">${t("app.motion")}</span>
      </div>
      <div class="mobileViewTabs" aria-label="AgentScope demo views">
        ${viewOrder().map((view) => `<button type="button" class="${state.view === view ? "active" : ""}" data-view="${view}">${t(`app.views.${view}`)}</button>`).join("")}
      </div>
      <div class="appContent">
        <div class="listPane">
          <div class="paneTitle">
            <div>
              <strong>${t(`app.rows.${state.view}`)}</strong>
              <span>${t(`app.subtitles.${state.view}`)}</span>
            </div>
            <span class="countChip">${state.view === "processes" ? t("app.indexedCount") : `${items.length} rows`}</span>
          </div>
          ${state.view === "relations" ? renderRelationFilters() : ""}
          <div class="demoRows">
            ${
              items.length
                ? items.map((item) => renderRow(item, selected?.id === item.id)).join("")
                : `<p class="emptyDemo">${t("app.empty")}</p>`
            }
          </div>
        </div>
        ${renderInspector(selected)}
      </div>
    </section>`;

  root.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      state.selectedId = (itemsForCurrentView()[0] ?? {}).id ?? "";
      renderAppDemo();
    });
  });
  root.querySelectorAll("[data-row]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedId = button.dataset.row;
      renderAppDemo();
    });
  });
  root.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.relationFilter = button.dataset.filter;
      state.selectedId = (itemsForCurrentView()[0] ?? {}).id ?? "";
      renderAppDemo();
    });
  });
}

function renderRelationFilters() {
  return `<div class="filterRail">${["all", "exact", "indexed", "heuristic", "unknown"]
    .map((filter) => `<button type="button" class="${state.relationFilter === filter ? "active" : ""}" data-filter="${filter}">${t(`app.filters.${filter}`)}</button>`)
    .join("")}</div>`;
}

function renderRow(item, selected) {
  return `
    <button class="processRow ${selected ? "selected" : ""}" type="button" data-row="${escapeHtml(item.id)}">
      <span class="agentTile ${escapeHtml(item.agent)}">${escapeHtml(item.glyph)}</span>
      <span class="rowMain">
        <span class="rowTop">
          <strong>${escapeHtml(item.title)}</strong>
          <span class="badge ${escapeHtml(item.tone)}">${escapeHtml(item.confidence)}</span>
        </span>
        <span class="rowMeta">${item.meta.map((entry) => `<span>${escapeHtml(entry)}</span>`).join("")}</span>
        <code class="rowPath">${escapeHtml(item.path)}</code>
        <span class="evidenceLine">${escapeHtml(item.evidenceLine)}</span>
      </span>
    </button>`;
}

function renderInspector(item) {
  if (!item) {
    return `<aside class="inspectorPane"><div class="emptyDemo">${t("app.empty")}</div></aside>`;
  }
  return `
    <aside class="inspectorPane" aria-label="${t("app.inspector")}">
      <div class="inspectorHeader">
        <span class="agentBadge ${escapeHtml(item.agent)}">${escapeHtml(item.agent === "neutral" ? "AgentScope" : item.agent)}</span>
        <strong>${escapeHtml(item.inspectorTitle)}</strong>
        <span>${escapeHtml(item.inspectorSubtitle)}</span>
      </div>
      <div class="fieldGroup">
        <h2>${t("app.confidence")}</h2>
        <div class="field"><span>${t("app.level")}</span><strong>${escapeHtml(item.confidence)}</strong></div>
        <div class="field"><span>${t("app.source")}</span><strong>${escapeHtml(item.source)}</strong></div>
      </div>
      <div class="fieldGroup">
        <h2>${t("app.evidence")}</h2>
        ${item.evidence
          .map(([title, detail, code, tone]) => `
            <div class="evidenceItem ${tone ? escapeHtml(tone) : ""}">
              <strong>${escapeHtml(title)}</strong>
              <p>${escapeHtml(detail)}</p>
              <code>${escapeHtml(code)}</code>
            </div>`)
          .join("")}
      </div>
    </aside>`;
}

function renderCodexAnimation() {
  const title = document.querySelector("[data-codex-demo-title]");
  const detail = document.querySelector("[data-codex-demo-detail]");
  const stateLabel = document.querySelector("[data-codex-demo-state]");
  const status = document.querySelector("[data-codex-demo-status]");
  const code = document.querySelector("[data-codex-demo-code]");
  if (!title || !detail || !stateLabel || !status || !code) return;

  const scenario = codexScenarios[state.scenarioIndex % codexScenarios.length];
  const visibleLines = scenario.lines.slice(0, state.scenarioLine + 1);
  title.textContent = t("codexDemo.title");
  detail.textContent = `${t("codexDemo.detail")} - ${t(`codexDemo.scenarios.${scenario.id}`)}`;
  stateLabel.textContent = t(`codexDemo.phase.${state.scenarioLine < scenario.lines.length - 1 ? "writing" : scenario.phase}`);
  status.className = `statusRing ${state.scenarioLine < scenario.lines.length - 1 ? "writing" : scenario.phase}`;
  status.innerHTML = statusIcon(state.scenarioLine < scenario.lines.length - 1 ? "writing" : scenario.phase);
  code.innerHTML = visibleLines
    .map(([tone, line], index) => `<div class="codeLine ${tone} ${index === visibleLines.length - 1 ? "active" : ""}"><span>${index + 1}</span><code>${escapeHtml(line)}</code></div>`)
    .join("");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  code.scrollTo({ top: code.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });

  state.scenarioLine += 1;
  if (state.scenarioLine >= scenario.lines.length + 2) {
    state.scenarioLine = 0;
    state.scenarioIndex = (state.scenarioIndex + 1) % codexScenarios.length;
  }
}

function statusIcon(phase) {
  if (phase === "success") return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" /></svg>';
  if (phase === "error") return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" /></svg>';
  return '<svg class="spinner" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 1-8.2 5.3" /></svg>';
}

function init() {
  document.querySelectorAll("[data-lang]").forEach((button) => {
    button.addEventListener("click", () => {
      state.lang = button.dataset.lang;
      localStorage.setItem("agentscope.site.language", state.lang);
      renderI18n();
      renderAppDemo();
      renderCodexAnimation();
    });
  });
  renderI18n();
  renderAppDemo();
  renderCodexAnimation();
  window.setInterval(renderCodexAnimation, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 2200 : 1100);
}

init();
