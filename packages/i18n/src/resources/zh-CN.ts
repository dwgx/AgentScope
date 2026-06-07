import { enUS } from "./en-US.js";
import type { ResourceTree } from "../types.js";

export const zhCN = {
  ...enUS,
  app: { tagline: "控制 + 追踪层" },
  common: {
    ...enUS.common,
    agent: { codex: "codex", claude: "claude", unknown: "unknown" },
    action: {
      open: "打开",
      refresh: "刷新",
      reset: "重置",
      clear: "清空",
      cancel: "取消",
      reveal: "定位",
      openJournal: "打开 journal",
      revealJournal: "定位 journal",
      repair: "修复",
      restart: "重启",
      show: "显示",
      hide: "隐藏"
    },
    status: {
      ...enUS.common.status,
      ok: "正常",
      warn: "警告",
      local: "本地",
      read: "可读",
      stream: "流式",
      indexed: "已索引",
      exact: "精确",
      resolved: "已解析",
      on: "开启",
      scored: "已评分",
      evidence: "证据",
      readOnly: "只读"
    },
    confidence: { exact: "精确", indexed: "已索引", heuristic: "推测", unknown: "未知" },
    date: { started: "启动 {{date}}", updated: "更新 {{date}}" },
    path: {
      noCommandLine: "没有命令行",
      noPathEvidence: "没有路径证据",
      noPath: "没有路径",
      loading: "正在加载路径",
      path: "路径",
      directory: "目录",
      file: "文件",
      notAllowed: "路径不在 AgentScope 本地追踪允许列表内"
    }
  },
  nav: {
    processes: "进程",
    sessions: "会话",
    relations: "关系",
    doctor: "诊断",
    settings: "设置",
    system: "系统",
    refreshIndex: "刷新索引"
  },
  relations: {
    kind: {
      parent_child: "会话派生",
      process_parent: "进程树",
      transcript: "转录关联",
      subagent: "子代理"
    },
    endpoint: {
      parent_child: { source: "父会话", target: "子会话" },
      process_parent: { source: "父进程 PID", target: "子进程 PID" },
      transcript: { source: "会话", target: "转录" },
      subagent: { source: "父会话", target: "子代理" }
    }
  },
  menu: {
    file: {
      label: "文件",
      exportSnapshot: "导出快照",
      openAppData: "打开应用数据",
      openCodexHome: "打开 Codex 目录",
      openClaudeHome: "打开 Claude 目录",
      reloadWindow: "重载窗口",
      quit: "退出 AgentScope"
    },
    view: {
      label: "视图",
      graphiteTheme: "石墨主题",
      blueprintTheme: "蓝图主题",
      highContrast: "高对比度",
      midnightTheme: "午夜主题",
      toggleInspector: "切换检查器"
    },
    trace: {
      label: "追踪",
      refreshIndex: "刷新索引",
      showWeakCandidates: "显示弱候选",
      openSelectedTranscript: "打开所选转录",
      revealSelectedTranscript: "定位所选转录",
      openSelectedCwd: "打开所选工作目录",
      revealCodexSqlite: "定位 Codex SQLite"
    },
    help: {
      label: "帮助",
      githubRepository: "GitHub 仓库",
      githubActions: "GitHub Actions",
      issues: "Issues",
      readme: "README"
    },
    detail: { json: "JSON", jsonl: "JSONL", logs: "日志", public: "公开" }
  },
  command: {
    searchPlaceholder: "搜索会话、转录、命令行",
    palettePlaceholder: "搜索会话、路径、事件和命令",
    proc: "进程",
    matched: "匹配",
    warn: "警告",
    refreshTitle: "刷新",
    results: "搜索结果",
    clearSearch: "清除搜索",
    history: "最近搜索",
    noHistory: "暂无搜索历史",
    suggestions: "猜你想找",
    noSuggestions: "暂无上下文推荐",
    autoSearch: "输入时自动搜索",
    contextTitle: "{{view}} 的推荐",
    suggestion: {
      refresh: "刷新当前索引",
      processes: "检查运行中的 Win32 进程",
      sessions: "浏览已索引会话",
      relations: "查看进程和会话关系图",
      settings: "调整工作区行为",
      query: "搜索 {{kind}}"
    }
  },
  views: {
    processes: {
      emptyTitle: "没有相关进程",
      emptyDetail: "未找到 Codex、Claude、node_repl、app-server 或 daemon 进程。",
      captureOffTitle: "运行时采集已关闭",
      captureOffDetail: "在 设置 > 运行时 打开 Win32_Process 后才会显示实时 Agent 进程。",
      subtitle_one: "{{count}} 个相关 Win32 进程",
      subtitle_other: "{{count}} 个相关 Win32 进程",
      noCandidate: "还没有会话候选",
      weakEvidence: "弱证据",
      candidate: "候选",
      score: "证据 {{score}}",
      groupCount_one: "{{count}} 个进程",
      groupCount_other: "{{count}} 个进程",
      sort: {
        label: "排序",
        time: "时间",
        runtime: "运行时长",
        memory: "内存",
        score: "证据",
        tree: "进程树"
      },
      group: {
        label: "分组",
        agent: "Agent",
        parent: "父进程",
        cwd: "cwd",
        none: "平铺"
      },
      context: {
        inspect: "检查进程",
        jumpSession: "跳转会话"
      }
    },
    sessions: {
      emptyTitle: "没有索引到会话",
      emptyDetail: "运行诊断以检查 Codex 和 Claude 本地路径。",
      subtitle_one: "{{count}} 条 Claude + Codex 记录",
      subtitle_other: "{{count}} 条 Claude + Codex 记录",
      groupCount_one: "{{count}} 个会话",
      groupCount_other: "{{count}} 个会话",
      children_one: "{{count}} 个子会话",
      children_other: "{{count}} 个子会话",
      context: {
        selectedCount: "已选择 {{count}} 个会话"
      },
      group: {
        cwd: "cwd",
        parent: "父级",
        agent: "Agent",
        none: "平铺"
      }
    },
    relations: {
      emptyTitle: "没有关系",
      emptyDetail: "索引到 Codex 派生边或进程关系后会显示在这里。",
      subtitle_one: "{{count}} 条会话/进程图边",
      subtitle_other: "{{count}} 条会话/进程图边",
      filter: {
        kind: "类型",
        confidence: "置信度",
        all: "全部",
        search: "筛选会话、路径、证据"
      }
    },
    doctor: {
      emptyTitle: "诊断尚未运行",
      emptyDetail: "刷新以运行本地环境检查。",
      subtitle_one: "{{count}} 项环境检查",
      subtitle_other: "{{count}} 项环境检查"
    },
    loading: {
      title: "正在读取本机 Agent 状态",
      detail: "正在枚举 Win32_Process、Codex SQLite/JSONL 和 Claude 会话文件。"
    }
  },
  settings: {
    ...enUS.settings,
    title: "设置",
    subtitle: "只读 Windows 追踪配置",
    sections: {
      general: "常规",
      appearance: "外观",
      indexing: "索引",
      runtime: "运行时",
      diagnostics: "诊断",
      workspace: "工作区",
      typography: "字体",
      codex: "Codex",
      claude: "Claude",
      runtimeCapture: "运行时采集",
      confidence: "置信度"
    },
    language: {
      label: "语言",
      detail: "立即切换 AgentScope 界面文字。",
      system: "系统",
      enUS: "English",
      zhCN: "中文",
      jaJP: "日本語",
      koKR: "한국어"
    },
    controlMode: {
      label: "控制模式",
      detail: "安全模式允许已备份的会话控制；只读模式会阻止备份、删除、导入和修复动作。",
      safe: "安全",
      readOnly: "只读",
      readOnlyBlocked: "当前控制模式为只读。"
    },
    defaultView: { label: "默认视图", detail: "AgentScope 打开时进入的视图。" },
    inspector: {
      label: "检查器",
      detail: "右侧栏在切换主视图时保持运行时证据可见。",
      right: "右侧",
      hidden: "隐藏"
    },
    searchScope: {
      label: "搜索范围",
      detail: "SQLite 标题/预览，以及本地 Codex 和 Claude JSONL 转录。"
    },
    searchLimit: { label: "搜索结果数量", detail: "命令栏搜索返回的最大匹配数。" },
    notifications: {
      label: "通知留存",
      detail: "操作通知自动关闭前的显示时长。"
    },
    searchHistory: {
      label: "搜索历史",
      detail: "将最近搜索词保存在本机；处理敏感转录时建议关闭。",
      clearLabel: "清空搜索历史",
      clearDetail_one: "已保存 {{count}} 条搜索。",
      clearDetail_other: "已保存 {{count}} 条搜索。"
    },
    suggestions: {
      label: "上下文推荐",
      detail: "根据当前页面、选中的进程/会话、cwd、模型、工具和诊断生成搜索提示。"
    },
    transcriptPreview: {
      label: "转录命中预览",
      detail: "选择搜索结果时显示短摘录和行号，不展示整段 JSONL 原文。"
    },
    suggestion: {
      theme: "主题",
      language: "语言",
      motion: "动画",
      indexing: "索引",
      runtime: "运行时"
    },
    resetUi: {
      label: "重置 UI 设置",
      detail: "恢复主题、密度、动画、检查器、字号、语言和搜索数量。"
    },
    clearCache: {
      label: "清理软件缓存",
      detail: "清理 AgentScope 应用数据目录下的 Electron 渲染缓存。"
    },
    theme: {
      label: "主题",
      graphite: "石墨",
      blueprint: "蓝色",
      contrast: "高对比",
      midnight: "午夜",
      detail: {
        graphite: "中性石墨金属质感，使用冷色状态强调。",
        blueprint: "深蓝色运行工作区。",
        contrast: "最高对比度黑色界面。",
        midnight: "接近黑色的专注主题，面板更克制。"
      }
    },
    density: {
      label: "密度",
      detail: "控制进程和会话列表的行间距。",
      compact: "紧凑",
      comfortable: "舒适",
      spacious: "宽松"
    },
    accent: { label: "强调色", detail: "改变选中栏、按钮和状态焦点颜色。" },
    motion: {
      label: "动画",
      detail: "控制过渡、行进入、悬停抬升和加载动画。",
      full: "完整",
      reduced: "减少",
      off: "关闭"
    },
    resetAppearance: {
      label: "重置外观",
      detail: "恢复主题、密度、动画、强调色、字体预设、字体族和行高。"
    },
    uiScale: {
      label: "界面缩放",
      detail: "改变全局界面字号。",
      small: "小",
      normal: "正常",
      large: "大"
    },
    fontMode: {
      label: "字体模式",
      detail: "统一字体、按语言 fallback，或每种语言完全自定义。",
      language: "按语言",
      unified: "统一",
      custom: "自定义"
    },
    fontPreset: {
      label: "字体预设",
      detail: "套用 Windows、Claude-like、日文教科书或高密度追踪字体栈。",
      windows: "Windows",
      language: "按语言",
      claude: "Claude",
      japaneseTextbook: "教科书",
      dense: "高密度",
      custom: "自定义"
    },
    lineHeight: {
      label: "行高",
      detail: "控制混排文字和证据行的垂直节奏。",
      compact: "紧凑",
      normal: "正常",
      spacious: "宽松"
    },
    fonts: {
      unified: "统一 UI 字体",
      unifiedDetail: "字体模式为统一时使用。可手动输入 PingFang、Inter、Anthropic Sans 等字体名。",
      latin: "英文 / 拉丁字体",
      latinDetail: "英文菜单、标签和数字的主字体。",
      chinese: "中文字体",
      chineseDetail: "中文标签和转录文本的 fallback。",
      japanese: "日文字体",
      japaneseDetail: "Yu Gothic UI 更紧凑；UD Digi Kyokasho 更接近日文教科书阅读风格。",
      korean: "韩文字体",
      koreanDetail: "Malgun Gothic 是 Windows 原生韩文 UI 基准。",
      detected: "已安装字体",
      detectedDetail_one: "当前 Windows 用户检测到 {{count}} 个字体族。",
      detectedDetail_other: "当前 Windows 用户检测到 {{count}} 个字体族。"
    },
    fontPreview: {
      title: "字体预览"
    },
    codeFont: { label: "代码字体", detail: "代码、路径、命令行、ID 和表格证据。" },
    links: {
      githubLabel: "打开 GitHub",
      githubDetail: "公开仓库，用于 issues、actions 和 releases。",
      readmeLabel: "打开 README",
      readmeDetail: "项目概览、CLI 命令和桌面端说明。"
    },
    indexing: {
      sqliteLabel: "SQLite 索引",
      codexHomeLabel: "打开 Codex 目录",
      rolloutLabel: "Rollout JSONL",
      spawnEdgesLabel: "派生边",
      spawnEdgesDetail: "thread_spawn_edges 父子关系图。",
      pidSessionsLabel: "PID 会话",
      claudeHomeLabel: "打开 Claude 目录",
      transcriptsLabel: "转录"
    },
    runtime: {
      win32Label: "Win32_Process",
      win32Detail_one: "{{count}} 条相关行；PID、PPID、路径、命令行、创建时间。",
      win32Detail_other: "{{count}} 条相关行；PID、PPID、路径、命令行、创建时间。",
      windowTitlesLabel: "窗口标题",
      windowTitlesDetail: "在 Windows 暴露时读取 Get-Process MainWindowTitle。",
      candidatesLabel: "会话候选",
      candidatesDetail_one: "{{count}} 个已索引会话，按 PID、cwd、转录、标题和时间证据评分。",
      candidatesDetail_other: "{{count}} 个已索引会话，按 PID、cwd、转录、标题和时间证据评分。"
    },
    confidence: {
      exactDetail: "Claude PID 文件或未来 hook 映射。",
      heuristicDetail: "强路径/标题证据，并显示评分和原因。",
      unknownDetail: "弱时间证据候选仍可显示，但不会当作匹配。"
    },
    diagnostics: {
      warningsLabel: "诊断警告",
      warningsDetail_one: "{{count}} 个警告，覆盖 Codex、Claude、SQLite、JSONL 和进程扫描。",
      warningsDetail_other: "{{count}} 个警告，覆盖 Codex、Claude、SQLite、JSONL 和进程扫描。"
    }
  },
  inspector: {
    nothingTitle: "未选择内容",
    nothingDetail: "选择一个进程或会话以检查证据。",
    likelySessions: "可能的会话",
    runtime: "运行时",
    identity: "身份",
    transcript: "转录",
    modelRuntime: "模型与运行参数",
    control: "安全控制",
    indexMetadata: "索引元数据",
    relations: "关系",
    evidence: "证据",
    searchHit: "搜索命中",
    activity: "活动",
    topEvents: "主要事件",
    topTools: "主要工具",
    models: "模型",
    tokens: "Token",
    noEvidence: "没有附加证据。",
    noActivity: "没有可用的转录活动摘要。",
    noCandidate: "没有候选会话。没有 PID、cwd、转录、标题或时间证据时，AgentScope 不会猜测。",
    noCwdEvidence: "没有 cwd 证据",
    safeControlDetail:
      "只读模式：可以打开、定位、生成 resume 命令和导出；kill/archive 在显式 force 控制出现前保持禁用。",
    actions: {
      openTranscript: "打开转录",
      revealTranscript: "定位转录",
      backupSession: "备份会话",
      backupSessions: "备份 {{count}} 个会话",
      deleteSession: "删除会话",
      deleteSessions: "删除 {{count}} 个会话",
      importSession: "导入会话",
      writeDeletePlan: "生成删除计划",
      planImport: "生成导入计划"
    },
    fields: {
      pid: "PID",
      ppid: "PPID",
      title: "标题",
      started: "启动",
      executable: "可执行文件",
      command: "命令",
      session: "会话",
      confidence: "置信度",
      status: "状态",
      updated: "更新",
      name: "名称",
      path: "路径",
      index: "索引",
      parent: "父级",
      children: "子级",
      lines: "行数",
      bytes: "大小",
      firstEvent: "首个事件",
      lastEvent: "最后事件",
      cliVersion: "CLI",
      gitBranch: "Git",
      permission: "权限",
      mode: "模式",
      compacted: "压缩",
      sidechain: "侧链",
      parseErrors: "解析错误",
      inputTokens: "输入",
      outputTokens: "输出",
      cacheRead: "缓存读",
      cacheWrite: "缓存写",
      modelProvider: "提供方",
      model: "模型",
      reasoningEffort: "推理强度",
      tokensUsed: "已用 Token",
      approvalMode: "审批",
      sandboxPolicy: "沙箱",
      entrypoint: "入口",
      resumeCommand: "恢复命令",
      safeControl: "边界"
    }
  },
  toast: {
    snapshotCanceled: "已取消导出",
    snapshotExported: "快照已导出",
    externalOpened: "已打开外部链接",
    externalBlocked: "已阻止外部链接",
    openFailed: "打开失败：{{message}}",
    pathOpened: "已打开路径",
    pathRevealed: "已定位路径",
    sessionBackedUp: "会话备份已写入",
    sessionsBackedUp: "已备份 {{count}}/{{total}} 个会话",
    noSessionsBackedUp: "没有会话完成备份",
    sessionDeleted: "会话已移入隔离区",
    sessionsDeleted: "已将 {{count}}/{{total}} 个会话移入隔离区",
    noSessionsDeleted: "没有会话被删除",
    sessionImported: "会话已从备份导入",
    deletePlanWritten: "删除计划已写入：{{path}}",
    deletePlanUnavailable: "无法写入任何删除计划",
    deletePlanPartial: "已为 {{count}}/{{total}} 个会话写入删除计划",
    importPlanWritten: "导入计划已写入：{{path}}",
    importPlanCanceled: "已取消导入计划",
    settingsReset: "设置已重置",
    cacheCleared: "软件缓存已清理",
    diagnosticRepairComplete: "诊断修复已完成",
    operationFailed: "操作失败：{{message}}"
  },
  confirm: {
    deleteSessionTitle: "删除会话",
    deleteSessionsTitle: "删除 {{count}} 个会话",
    deleteSession:
      "删除这个会话？\n\n{{title}}\n\nBackup:\n{{backupDir}}\n\nQuarantine:\n{{quarantineDir}}\n\nJournal:\n{{journalPath}}\n\nAgentScope 会先备份并写入 journal，再移除已验证的本地引用并把会话文件移入隔离区。精确 PID 和高置信 Codex 进程候选都会被阻止。",
    deleteSessions:
      "删除这 {{count}} 个已选会话？\n\n首个 Backup:\n{{backupDir}}\n\n首个 Quarantine:\n{{quarantineDir}}\n\n首个 Journal:\n{{journalPath}}\n\nAgentScope 会逐个会话生成独立备份、隔离目录和 journal；核心 blocker 仍按会话逐条生效。"
  }
} satisfies ResourceTree;
