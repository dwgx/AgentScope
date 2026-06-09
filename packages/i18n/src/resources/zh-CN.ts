import { enUS } from "./en-US.js";
import type { ResourceTree } from "../types.js";

export const zhCN = {
  ...enUS,
  app: { tagline: "控制 + 追踪层" },
  common: {
    ...enUS.common,
    agent: { codex: "codex", claude: "claude", unknown: "unknown" },
    action: {
      retry: "重试",
      open: "打开",
      refresh: "刷新",
      reset: "重置",
      clear: "清空",
      cancel: "取消",
      reveal: "定位",
      openJournal: "打开 journal",
      revealJournal: "定位 journal",
      repair: "修复",
      advice: "建议",
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
      diagnostic: "诊断",
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
      evidence: "证据路径",
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
    codexControl: "Codex 控制",
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
      doctor: "查看诊断和修复建议",
      codexControl: "编辑 Codex 配置控制面",
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
      helperNoCandidate: "辅助进程：没有直接 session id 或转录证据。",
      weakEvidence: "弱证据",
      candidate: "候选",
      score: "证据 {{score}}",
      allProcesses: "全部进程",
      taskRoot: "任务根 PID {{pid}}",
      noParentPid: "没有父 PID",
      noCwdCandidate: "没有 cwd 候选",
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
        task: "任务",
        role: "角色",
        agent: "Agent",
        parent: "父进程",
        cwd: "cwd",
        none: "平铺"
      },
      context: {
        inspect: "检查进程",
        jumpSession: "跳转会话",
        directSessionEvidence: "直接会话证据"
      },
      roles: {
        codex_cli: "Codex CLI",
        codex_engine: "Codex 引擎",
        codex_node_repl: "子代理运行时",
        codex_app_server: "Codex app-server",
        codex_mcp_tool: "MCP 工具",
        codex_tool_kernel: "工具内核",
        claude_cli: "Claude CLI",
        claude_daemon: "Claude daemon",
        agent_helper: "Agent helper",
        unknown: "未知角色"
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
      kind: {
        child: "子级",
        subagent: "子代理",
        subagentCandidate: "子代理候选"
      },
      kindFilter: {
        label: "类型",
        all: "全部",
        root: "根会话",
        child: "子级",
        subagent: "子代理"
      },
      context: {
        selectedCount: "已选择 {{count}} 个会话"
      },
      allSessions: "全部会话",
      rootNoParent: "Root / no parent",
      parentGroup: "父级：{{title}}",
      noCwd: "没有 cwd",
      recycle: {
        title: "回收站",
        loading: "正在扫描隔离项...",
        error: "隔离区扫描失败",
        subtitle: "{{count}} 个隔离项，{{restorable}} 个可恢复",
        empty: "没有隔离会话。",
        restore: "恢复",
        restoreTitle: "从已验证备份恢复这个隔离会话。",
        restoredAction: "已恢复",
        blockedAction: "已阻止",
        unavailableAction: "不可用",
        restoreBlocked: "这个隔离项当前不可恢复。",
        parent: "父级 {{id}}",
        evidence: "{{files}} 个文件 / {{db}} 个 DB 步骤",
        reason: {
          restored: "已经恢复",
          conflict: "本机冲突",
          missingBackup: "缺少备份",
          invalid: "Journal 无效",
          blocked: "已阻止"
        },
        status: {
          restorable: "可恢复",
          restored: "已恢复",
          blocked: "已阻止",
          missing_backup: "缺少备份",
          invalid: "无效"
        }
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
      filteredEmptyTitle: "没有匹配关系",
      filteredEmptyDetail: "调整关系类型、置信度或搜索文本后再查看匹配的图边。",
      subtitle_one: "{{count}} 条会话/进程图边",
      subtitle_other: "{{count}} 条会话/进程图边",
      filter: {
        kind: "类型",
        confidence: "置信度",
        spawnStatus: "派生",
        all: "全部",
        open: "open",
        closed: "closed",
        unknown: "未知",
        search: "筛选会话、路径、证据"
      }
    },
    doctor: {
      emptyTitle: "诊断尚未运行",
      emptyDetail: "刷新以运行本地环境检查。",
      subtitle_one: "{{count}} 项环境检查",
      subtitle_other: "{{count}} 项环境检查",
      fix: {
        nativeSqlite:
          "修复会重新构建 AgentScope 打包版 SQLite 原生模块；这是应用运行时问题，不是 Codex 数据损坏。",
        nativeCascade:
          "这条 SQLite 警告被 native.better_sqlite3 阻断；先修原生模块，再考虑 Codex 数据。",
        rebuild: "修复会运行固定的打包重建流程，并报告动过的目录和文件。",
        revealPath: "定位证据路径：{{path}}",
        manual: "没有注册自动修复；请检查证据路径，并保持数据只读。"
      }
    },
    loading: {
      title: "正在读取本机 Agent 状态",
      detail: "正在枚举 Win32_Process、Codex SQLite/JSONL 和 Claude 会话文件。",
      errorTitle: "Agent 状态读取失败",
      errorDetail: "{{message}}。请刷新重试；在新快照加载前 AgentScope 会保持数据只读。"
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
      codexControl: "Codex 控制",
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
      detail: "SQLite 身份字段与本地 Codex/Claude JSONL 安全元数据。不会搜索转录正文或隐藏/内部字段。"
    },
    searchPreview: {
      label: "SQLite 预览搜索",
      detail: "允许用 Codex SQLite preview 文本参与匹配。结果仍不会展示 preview 正文。"
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
    codexControl: {
      title: "Codex 配置控制面",
      detail:
        "仅编辑 allowlist 内的用户 Codex 文件。auth、credentials、logs、history 正文、插件缓存和 memory 正文均保持阻止。",
      surfaces: "Codex 控制面",
      loading: "正在加载 Codex 控制面...",
      editable: "可编辑",
      readOnly: "只读",
      noChanges: "没有需要保存的 Codex 控制改动",
      dirty: "Codex 控制有未保存改动",
      clean: "没有待保存的 Codex 控制改动",
      emptyTab: "这个页签没有发现结构化控制项。",
      changedKeys: "改动键",
      savedWithJournal: "已保存。Journal：{{path}}",
      highRiskTitle: "高风险 Codex 设置",
      highRiskConfirm:
        "保存这些高风险 Codex 设置？\n\n{{keys}}\n\n{{warnings}}\n\nAgentScope 会先写入备份和 journal。",
      confirmSave: "仍然保存",
      readOnlyDetail:
        "这个面只作为证据展示。它是状态、缓存、供应商管理或承载正文内容，AgentScope 不会修改。",
      emptyTitle: "没有选中控制面",
      emptyDetail: "选择一个 Codex 配置面查看证据，或编辑会先备份的文档。",
      save: "保存",
      controlSaved: "Codex 控制已保存",
      saved: "已保存。原文件不存在，无需备份。",
      savedWithBackup: "已保存。备份：{{path}}",
      backupBeforeSave: "保存前会校验 sha256，并先写入 ~/.agentscope 备份。",
      redacted: "检测到敏感键并已脱敏；请定位后在 AgentScope 外部编辑。",
      exists: "存在",
      bytes: "字节",
      updated: "更新",
      modeTitle: "Codex 模式默认值",
      modeDetail:
        "只写官方文档明确的 config.toml 键。Plan 模式继承默认模型，只能覆盖 reasoning effort。",
      model: "模型",
      reasoning: "推理强度",
      inheritDefault: "继承 Default",
      unset: "未设置",
      planModelNote: "官方文档没有独立 Plan 模型键；AgentScope 只展示继承的默认模型。",
      reviewReasoningNote: "Review 的 reasoning 继承默认 reasoning 设置。",
      modeEvidence:
        "证据来源：OpenAI Codex 手册中的配置键说明，以及本机 config.toml 顶层赋值。",
      mode: {
        default: "Default 模式",
        plan: "Plan 模式",
        review: "Review"
      },
      source: {
        config: "配置",
        inherits_default: "继承",
        unset: "未设置"
      },
      tabs: {
        overview: "概览",
        models: "模型",
        safety: "安全",
        runtime: "运行",
        mcp: "MCP",
        skills: "技能",
        storage: "存储",
        advanced: "高级",
        files: "文件"
      },
      risk: {
        low: "低",
        medium: "中",
        high: "高",
        blocked: "阻止"
      },
      auth: {
        present: "auth 已受保护",
        missing: "没有文件 auth"
      },
      overview: {
        codexHome: "官方 CODEX_HOME 根目录。AgentScope 只盘点元数据。",
        sqliteHome: "解析 config/env 后的 SQLite 状态根目录。"
      },
      items: {
        model: {
          label: "默认模型",
          detail: "CLI、应用、profile 或项目设置未覆盖时使用的顶层 Codex 模型。"
        },
        review_model: {
          label: "Review 模型",
          detail: "Codex review 工作流的可选模型覆盖。"
        },
        model_reasoning_effort: {
          label: "默认推理强度",
          detail: "Default 模式使用的 reasoning effort。"
        },
        plan_mode_reasoning_effort: {
          label: "Plan 推理强度",
          detail: "Plan 模式的 reasoning 覆盖；模型仍继承默认模型。"
        },
        approval_policy: {
          label: "审批策略",
          detail: "控制 Codex 在运行较高风险操作前何时请求确认。"
        },
        approvals_reviewer: {
          label: "审批审核者",
          detail: "把符合条件的审批提示交给用户或自动审核。"
        },
        sandbox_mode: {
          label: "沙箱模式",
          detail: "控制 shell 工作时的本地文件系统和网络隔离。"
        },
        web_search: {
          label: "联网搜索",
          detail: "控制 Codex 使用缓存、实时或禁用联网搜索。"
        },
        hide_agent_reasoning: {
          label: "隐藏 reasoning",
          detail: "仅是显示策略；AgentScope 仍不会读取供应商隐藏 reasoning。"
        },
        show_raw_agent_reasoning: {
          label: "显示原始 reasoning",
          detail: "高风险显示设置。无论该值如何，AgentScope 都不会展示供应商隐藏 reasoning。"
        },
        service_tier: {
          label: "服务层级",
          detail: "账号/模型支持时使用的可选 OpenAI service tier。"
        },
        windows_sandbox: {
          label: "Windows 沙箱",
          detail: "Windows 专用沙箱实现偏好。"
        },
        features_multi_agent: {
          label: "多 Agent 功能",
          detail: "当前 Codex 构建支持时，用于 multi-agent/subagent 的功能开关。"
        },
        memories_generate_memories: {
          label: "生成记忆",
          detail: "控制 Codex 是否生成 memory 记录。AgentScope 不读取 memory 正文。"
        },
        memories_use_memories: {
          label: "使用记忆",
          detail: "控制 Codex 是否注入已保存 memory。AgentScope 不展示 memory 正文。"
        }
      },
      surfaceText: {
        config_global: {
          label: "config.toml",
          detail: "CLI、IDE 和桌面共用的 Codex 用户配置。安全编辑请使用上方结构化控件。"
        },
        agents_global: {
          label: "AGENTS.md",
          detail: "个人 Codex 指令。Codex Desktop 个性化内容会写入这里。"
        },
        mcp_summary: {
          label: "MCP 服务器",
          detail: "config.toml 中的 MCP server 表。需要修改时请编辑配置文档。"
        },
        archive_summary: {
          label: "已归档线程",
          detail: "只统计归档线程数量；AgentScope 不在这里展示归档对话正文。"
        },
        memory_summary: {
          label: "记忆",
          detail: "只展示 memory 数据库是否存在。AgentScope 不读取或编辑 memory 内容。"
        },
        database_state: {
          label: "state_5.sqlite",
          detail: "只展示 Codex state 数据库 schema 和行数摘要，不读取转录正文。"
        },
        database_goals: {
          label: "goals_1.sqlite",
          detail: "只展示 Codex goals 数据库 schema 和行数摘要。"
        },
        database_memories: {
          label: "memories_1.sqlite",
          detail: "只展示 Codex memories 数据库 schema 和行数摘要；不读取 memory 内容。"
        },
        database_logs: {
          label: "logs_2.sqlite",
          detail: "只展示 Codex logs 数据库 schema 和行数摘要；不恢复或展示 log 正文。"
        },
        database_dev: {
          label: "sqlite/codex-dev.db",
          detail: "只展示 Codex Desktop automation 数据库 schema 和行数摘要。"
        },
        browser_state: {
          label: "浏览器集成",
          detail: "只检查浏览器 profile/cache 是否存在。AgentScope 不读取浏览数据。"
        },
        browser_output: {
          label: "浏览器自动化输出",
          detail: "只按扩展名统计 Playwright console/page 产物；不读取页面快照或 console 正文。"
        },
        computer_use_state: {
          label: "Computer Use 集成",
          detail: "只检查 Computer Use 本地状态是否存在。AgentScope 不启动桌面控制。"
        },
        mcp_node_runtime: {
          label: "MCP Node 运行时",
          detail: "已安装 MCP Node runtime 元数据。AgentScope 不执行 package scripts，也不检查源码正文。"
        },
        node_repl_runtime: {
          label: "Node REPL 运行时",
          detail: "只展示 Node REPL runtime 是否存在和条目数量；active exec 正文保持不读。"
        },
        tmp_arg0: {
          label: "Codex 参数临时文件",
          detail: "只统计临时命令参数目录。AgentScope 不打开这里生成的命令文件。"
        },
        vendor_imports_cache: {
          label: "供应商导入缓存",
          detail: "只检查 vendor import cache 是否存在；缓存 marketplace 正文保持不读。"
        },
        pets_state: {
          label: "Pets 状态",
          detail: "只检查 Codex Desktop 本地状态是否存在。"
        },
        plugins_summary: {
          label: "插件",
          detail: "已安装插件缓存和配置摘要。AgentScope 不直接编辑插件缓存字节。"
        },
        rules: {
          label: "规则文件",
          detail: "用户配置层中的 Codex 命令审批规则。"
        },
        skill: {
          label: "用户 skill",
          detail: "用户 skill 编写面。AgentScope 只编辑 SKILL.md，并且先备份。"
        },
        skillReadOnly: {
          label: "只读 skill",
          detail: "内置/系统 skill 面。AgentScope 保持只读。"
        }
      },
      warning: {
        authMetadataOnly: "auth.json 包含凭据材料。AgentScope 只显示元数据，绝不打开、编辑或展示 token 字段。",
        rawConfigBlocked: "已阻止原始配置编辑，避免高风险键绕过结构化确认。",
        sensitiveKeysBlocked: "检测到敏感键名。已阻止原始配置编辑。",
        systemSkillsReadOnly: "系统或插件提供的 skills 为只读。",
        pluginWorkflowOnly: "安装/移除请使用 Codex plugin 工作流；AgentScope 只展示证据。",
        sensitiveConfigBlocked: "检测到敏感 config 键；已阻止原始编辑。",
        highRiskConfirm: "高风险设置；执行前需要显式确认。",
        archivedCountUnreadable: "无法从 state_5.sqlite 读取归档线程数量。",
        sqliteMetadataUnreadable: "无法以只读方式打开此 SQLite 数据库读取元数据。"
      },
      mcpTitle: "config.toml 中的 MCP 服务器",
      noMcp: "当前 config.toml 没有找到 MCP server 表。",
      kind: {
        config: "配置",
        agents: "指令",
        rules: "规则",
        skill: "技能",
        plugin: "插件",
        mcp: "MCP",
        browser: "浏览器",
        computer_use: "电脑操控",
        database: "数据库",
        runtime: "运行态",
        cache: "缓存",
        memory: "记忆",
        archive: "已归档"
      }
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
    processRole: "进程角色",
    runtime: "运行时",
    identity: "身份",
    transcript: "转录",
    modelRuntime: "模型与运行参数",
    codexSpawn: "Codex 派生",
    processRuntime: "进程运行时",
    control: "安全控制",
    indexMetadata: "索引元数据",
    relations: "关系",
    relationDetail: "关系详情",
    endpoints: "端点",
    evidence: "证据",
    searchHit: "搜索命中",
    safeSearchHitDetail: "安全搜索只显示事件元数据、命中字段和文件位置；不会展示转录正文。",
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
      "安全模式只会启动受限的 Codex/Claude resume 或 fork 命令；删除仍必须备份、隔离并写入 journal。只读模式会阻止启动、备份、删除、导入和修复。",
    launchAction: {
      resume: "resume",
      fork: "fork"
    },
    actions: {
      openTranscript: "打开转录",
      revealTranscript: "定位转录",
      backupSession: "备份会话",
      backupSessions: "备份 {{count}} 个会话",
      deleteSession: "删除会话",
      deleteSessions: "删除 {{count}} 个会话",
      resumeSession: "在 Agent 中 resume",
      forkSession: "在 Agent 中 fork",
      resumeInAgent: "在 {{agent}} 中 resume",
      forkInAgent: "在 {{agent}} 中 fork",
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
      role: "角色",
      rootPid: "根 PID",
      parentAgentPid: "Agent 父级",
      roleEvidence: "角色证据",
      session: "会话",
      source: "来源",
      target: "目标",
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
      spawnStatus: "派生",
      depth: "深度",
      agentNickname: "Agent",
      agentRole: "角色",
      agentPath: "Agent 路径",
      sourceKind: "来源类型",
      runtimeSessionId: "运行时 ID",
      runtimeWorkingDir: "运行时 cwd",
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
    sessionRestored: "会话已从隔离区恢复",
    sessionLaunchStarted: "{{agent}} {{action}} 已启动",
    sessionLaunchUnsupported: "此会话不能通过 Codex/Claude 控制启动",
    deletePlanWritten: "删除计划已写入：{{path}}",
    deletePlanUnavailable: "无法写入任何删除计划",
    deletePlanPartial: "已为 {{count}}/{{total}} 个会话写入删除计划",
    importPlanWritten: "导入计划已写入：{{path}}",
    importPlanCanceled: "已取消导入计划",
    settingsReset: "设置已重置",
    cacheCleared: "软件缓存已清理",
    diagnosticRepairComplete: "诊断修复已完成",
    diagnosticAdvice: "诊断修复建议",
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
