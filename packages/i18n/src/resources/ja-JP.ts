import { enUS } from "./en-US.js";
import type { ResourceTree } from "../types.js";

export const jaJP = {
  ...enUS,
  app: { tagline: "制御 + トレースレイヤー" },
  common: {
    ...enUS.common,
    agent: { codex: "codex", claude: "claude", unknown: "unknown" },
    action: {
      open: "開く",
      refresh: "更新",
      reset: "リセット",
      clear: "消去",
      cancel: "キャンセル",
      reveal: "場所を表示",
      openJournal: "journal を開く",
      revealJournal: "journal を表示",
      repair: "修復",
      advice: "助言",
      restart: "再起動",
      show: "表示",
      hide: "非表示"
    },
    status: {
      ...enUS.common.status,
      ok: "正常",
      warn: "警告",
      local: "ローカル",
      read: "読取",
      stream: "ストリーム",
      indexed: "索引済み",
      exact: "正確",
      resolved: "解決済み",
      on: "オン",
      scored: "採点済み",
      evidence: "証拠",
      diagnostic: "診断",
      readOnly: "読み取り専用"
    },
    confidence: { exact: "一致", indexed: "索引済み", heuristic: "推定", unknown: "不明" },
    date: { started: "開始 {{date}}", updated: "更新 {{date}}" },
    path: {
      noCommandLine: "コマンドラインなし",
      noPathEvidence: "パス証拠なし",
      noPath: "パスなし",
      loading: "パスを読み込み中",
      path: "パス",
      evidence: "証拠パス",
      directory: "ディレクトリ",
      file: "ファイル",
      notAllowed: "パスは AgentScope のローカルトレース許可リストにありません"
    }
  },
  nav: {
    processes: "プロセス",
    sessions: "セッション",
    relations: "関係",
    doctor: "診断",
    codexControl: "Codex 制御",
    settings: "設定",
    system: "システム",
    refreshIndex: "索引を更新"
  },
  relations: {
    kind: {
      parent_child: "セッション派生",
      process_parent: "プロセスツリー",
      transcript: "転写リンク",
      subagent: "サブエージェント"
    },
    endpoint: {
      parent_child: { source: "親セッション", target: "子セッション" },
      process_parent: { source: "親 PID", target: "子 PID" },
      transcript: { source: "セッション", target: "転写" },
      subagent: { source: "親セッション", target: "サブエージェント" }
    }
  },
  menu: {
    file: {
      label: "ファイル",
      exportSnapshot: "スナップショットを書き出す",
      openAppData: "アプリデータを開く",
      openCodexHome: "Codex フォルダーを開く",
      openClaudeHome: "Claude フォルダーを開く",
      reloadWindow: "ウィンドウを再読み込み",
      quit: "AgentScope を終了"
    },
    view: {
      label: "表示",
      graphiteTheme: "Graphite テーマ",
      blueprintTheme: "Blue テーマ",
      highContrast: "高コントラスト",
      midnightTheme: "Midnight テーマ",
      toggleInspector: "インスペクターを切替"
    },
    trace: {
      label: "トレース",
      refreshIndex: "索引を更新",
      showWeakCandidates: "弱い候補を表示",
      openSelectedTranscript: "選択した転写を開く",
      revealSelectedTranscript: "選択した転写を表示",
      openSelectedCwd: "選択した作業フォルダーを開く",
      revealCodexSqlite: "Codex SQLite を表示"
    },
    help: {
      label: "ヘルプ",
      githubRepository: "GitHub リポジトリ",
      githubActions: "GitHub Actions",
      issues: "Issues",
      readme: "README"
    },
    detail: { json: "JSON", jsonl: "JSONL", logs: "ログ", public: "公開" }
  },
  command: {
    searchPlaceholder: "セッション、転写、コマンドラインを検索",
    palettePlaceholder: "セッション、パス、イベント、コマンドを検索",
    proc: "Proc",
    matched: "一致",
    warn: "警告",
    refreshTitle: "更新",
    results: "検索結果",
    clearSearch: "検索をクリア",
    history: "最近の検索",
    noHistory: "最近の検索はありません",
    suggestions: "候補",
    noSuggestions: "コンテキスト候補はまだありません",
    autoSearch: "入力中に自動検索",
    contextTitle: "{{view}} の候補",
    suggestion: {
      refresh: "現在の索引を更新",
      processes: "実行中の Win32 プロセスを確認",
      sessions: "索引済みセッションを閲覧",
      relations: "プロセスとセッションの関係を見る",
      doctor: "診断と修復助言を確認",
      codexControl: "Codex 設定サーフェスを編集",
      settings: "ワークスペース動作を調整",
      query: "{{kind}} を検索"
    }
  },
  views: {
    processes: {
      emptyTitle: "関連プロセスがありません",
      emptyDetail:
        "Codex、Claude、node_repl、app-server、daemon のプロセスは見つかりませんでした。",
      captureOffTitle: "ランタイム取得がオフです",
      captureOffDetail: "ライブ Agent プロセスを表示するには、設定 > ランタイムで Win32_Process をオンにしてください。",
      subtitle_one: "{{count}} 件の関連 Win32 行",
      subtitle_other: "{{count}} 件の関連 Win32 行",
      noCandidate: "セッション候補はまだありません",
      helperNoCandidate: "Helper process; no direct session id or transcript evidence.",
      weakEvidence: "弱い証拠",
      candidate: "候補",
      score: "証拠 {{score}}",
      allProcesses: "All processes",
      taskRoot: "Task root PID {{pid}}",
      noParentPid: "No parent PID",
      noCwdCandidate: "No cwd candidate",
      groupCount_one: "{{count}} 件のプロセス",
      groupCount_other: "{{count}} 件のプロセス",
      sort: {
        label: "並び替え",
        time: "時刻",
        runtime: "実行時間",
        memory: "メモリ",
        score: "証拠",
        tree: "プロセスツリー"
      },
      group: {
        label: "グループ",
        task: "タスク",
        role: "役割",
        agent: "Agent",
        parent: "親プロセス",
        cwd: "cwd",
        none: "一覧"
      },
      context: {
        inspect: "プロセスを調べる",
        jumpSession: "セッションへ移動",
        directSessionEvidence: "直接セッション証拠"
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
      emptyTitle: "セッションが索引されていません",
      emptyDetail: "Doctor を実行して Codex と Claude のローカルパスを確認してください。",
      subtitle_one: "{{count}} 件の Claude + Codex レコード",
      subtitle_other: "{{count}} 件の Claude + Codex レコード",
      groupCount_one: "{{count}} 件のセッション",
      groupCount_other: "{{count}} 件のセッション",
      children_one: "{{count}} 件の子セッション",
      children_other: "{{count}} 件の子セッション",
      kind: {
        child: "子",
        subagent: "サブエージェント",
        subagentCandidate: "サブエージェント候補"
      },
      kindFilter: {
        label: "種類",
        all: "すべて",
        root: "ルート",
        child: "子",
        subagent: "サブエージェント"
      },
      context: {
        selectedCount: "{{count}} セッションを選択中"
      },
      allSessions: "All sessions",
      rootNoParent: "Root / no parent",
      parentGroup: "Parent: {{title}}",
      noCwd: "No cwd",
      recycle: {
        title: "ごみ箱",
        subtitle: "{{count}} 件隔離、{{restorable}} 件復元可能",
        empty: "隔離されたセッションはありません。",
        restore: "復元",
        restoreTitle: "検証済みバックアップからこの隔離セッションを復元します。",
        restoredAction: "復元済み",
        blockedAction: "ブロック",
        unavailableAction: "不可",
        restoreBlocked: "この隔離項目は復元できません。",
        parent: "親 {{id}}",
        evidence: "{{files}} files / {{db}} DB steps",
        reason: {
          restored: "復元済み",
          conflict: "ローカル競合",
          missingBackup: "バックアップなし",
          invalid: "Journal 無効",
          blocked: "ブロック"
        },
        status: {
          restorable: "復元可能",
          restored: "復元済み",
          blocked: "ブロック",
          missing_backup: "バックアップなし",
          invalid: "無効"
        }
      },
      group: {
        cwd: "cwd",
        parent: "親",
        agent: "Agent",
        none: "一覧"
      }
    },
    relations: {
      emptyTitle: "関係が見つかりません",
      emptyDetail: "Codex の spawn edge またはプロセス関係が索引されるとここに表示されます。",
      filteredEmptyTitle: "一致する関係がありません",
      filteredEmptyDetail: "関係の種類、信頼度、検索語を調整してください。",
      subtitle_one: "{{count}} 件のセッション/プロセスグラフ辺",
      subtitle_other: "{{count}} 件のセッション/プロセスグラフ辺",
      filter: {
        kind: "種類",
        confidence: "信頼度",
        spawnStatus: "spawn",
        all: "すべて",
        open: "open",
        closed: "closed",
        unknown: "不明",
        search: "セッション、パス、証拠を絞り込み"
      }
    },
    doctor: {
      emptyTitle: "Doctor は未実行です",
      emptyDetail: "更新してローカル環境チェックを実行してください。",
      subtitle_one: "{{count}} 件の環境チェック",
      subtitle_other: "{{count}} 件の環境チェック",
      fix: {
        nativeSqlite:
          "修復は AgentScope のパッケージ済み SQLite ネイティブモジュールを再構築します。Codex データ破損ではなくアプリ実行環境の問題です。",
        nativeCascade:
          "この SQLite 警告は native.better_sqlite3 によってブロックされています。Codex データを触る前にネイティブモジュールを修復してください。",
        rebuild:
          "修復は固定されたパッケージ再構築手順を実行し、変更されたディレクトリとファイルを報告します。",
        revealPath: "証拠パスを表示: {{path}}",
        manual: "自動修復は登録されていません。証拠パスを確認し、データは読み取り専用のままにしてください。"
      }
    },
    loading: {
      title: "ローカル Agent 状態を読み込み中",
      detail: "Win32_Process、Codex SQLite/JSONL、Claude セッションファイルを確認しています。",
      errorTitle: "Agent state load failed",
      errorDetail: "{{message}}. Refresh to retry; AgentScope will keep data read-only until a fresh snapshot loads."
    }
  },
  settings: {
    ...enUS.settings,
    title: "設定",
    subtitle: "読み取り専用の Windows トレース設定",
    sections: {
      general: "一般",
      appearance: "外観",
      indexing: "索引",
      runtime: "ランタイム",
      codexControl: "Codex 制御",
      diagnostics: "診断",
      workspace: "ワークスペース",
      typography: "文字",
      codex: "Codex",
      claude: "Claude",
      runtimeCapture: "ランタイム取得",
      confidence: "信頼度"
    },
    language: {
      label: "言語",
      detail: "AgentScope の UI テキストを即時に切り替えます。",
      system: "システム",
      enUS: "English",
      zhCN: "中文",
      jaJP: "日本語",
      koKR: "한국어"
    },
    controlMode: {
      label: "制御モード",
      detail:
        "安全モードではバックアップ済みのセッション制御を許可します。読み取り専用はバックアップ、削除、インポート、修復をブロックします。",
      safe: "安全",
      readOnly: "読み取り専用",
      readOnlyBlocked: "現在の制御モードは読み取り専用です。"
    },
    defaultView: { label: "既定の表示", detail: "AgentScope 起動時に開くビューです。" },
    inspector: {
      label: "インスペクター",
      detail: "右レールでビューを切り替えてもランタイム証拠を表示します。",
      right: "右",
      hidden: "非表示"
    },
    searchScope: {
      label: "検索範囲",
      detail: "SQLite の識別フィールドとローカル Codex/Claude JSONL の安全なメタデータを検索します。転写本文や hidden/internal フィールドは検索しません。"
    },
    searchPreview: {
      label: "SQLite preview 検索",
      detail: "Codex SQLite preview テキストを一致判定に含めます。結果には preview 本文を表示しません。"
    },
    searchLimit: { label: "検索結果数", detail: "コマンドバー検索で返す最大一致数です。" },
    notifications: {
      label: "通知の保持時間",
      detail: "操作通知が自動で閉じるまでの表示時間です。"
    },
    searchHistory: {
      label: "検索履歴",
      detail:
        "最近の検索語をこのPCに保存します。機密性の高い転写を扱う場合はオフのままにしてください。",
      clearLabel: "検索履歴を消去",
      clearDetail_one: "{{count}} 件の検索語が保存されています。",
      clearDetail_other: "{{count}} 件の検索語が保存されています。"
    },
    suggestions: {
      label: "コンテキスト候補",
      detail: "現在のページ、選択中のプロセス/セッション、cwd、モデル、ツール、診断から検索候補を表示します。"
    },
    transcriptPreview: {
      label: "転写ヒットプレビュー",
      detail: "検索結果を選択したとき、短い抜粋と行番号だけを表示します。"
    },
    suggestion: {
      theme: "テーマ",
      language: "言語",
      motion: "モーション",
      indexing: "索引",
      runtime: "ランタイム"
    },
    resetUi: {
      label: "UI 設定をリセット",
      detail: "テーマ、密度、動き、インスペクター、文字サイズ、言語、検索件数を復元します。"
    },
    clearCache: {
      label: "アプリキャッシュを消去",
      detail: "AgentScope アプリデータ内の Electron レンダラーキャッシュを消去します。"
    },
    theme: {
      label: "テーマ",
      graphite: "Graphite",
      blueprint: "Blue",
      contrast: "Contrast",
      midnight: "Midnight",
      detail: {
        graphite: "冷たい状態アクセントを持つ中立的なグラファイトメタル。",
        blueprint: "濃い青の運用ワークスペース。",
        contrast: "最大コントラストの黒いインターフェイス。",
        midnight: "抑えたパネルを持つほぼ黒の集中テーマ。"
      }
    },
    density: {
      label: "密度",
      detail: "プロセスとセッション一覧の行間を調整します。",
      compact: "コンパクト",
      comfortable: "標準",
      spacious: "広め"
    },
    accent: { label: "アクセント", detail: "選択レール、ボタン、状態フォーカス色を変更します。" },
    motion: {
      label: "モーション",
      detail: "遷移、行の出現、ホバーリフト、読み込みアニメーションを制御します。",
      full: "通常",
      reduced: "低減",
      off: "オフ"
    },
    resetAppearance: {
      label: "外観をリセット",
      detail: "テーマ、密度、モーション、アクセント、フォントプリセット、フォントファミリー、行高を戻します。"
    },
    uiScale: {
      label: "UI スケール",
      detail: "全体の UI フォントサイズを変更します。",
      small: "小",
      normal: "標準",
      large: "大"
    },
    fontMode: {
      label: "フォントモード",
      detail: "統一フォント、言語別 fallback、または言語ごとのカスタムを選びます。",
      language: "言語別",
      unified: "統一",
      custom: "カスタム"
    },
    fontPreset: {
      label: "フォントプリセット",
      detail: "Windows、Claude 風、教科書体、高密度トレース向けのフォントスタックを適用します。",
      windows: "Windows",
      language: "言語別",
      claude: "Claude",
      japaneseTextbook: "教科書",
      dense: "高密度",
      custom: "カスタム"
    },
    lineHeight: {
      label: "行の高さ",
      detail: "混在言語テキストと証拠行の縦方向のリズムを調整します。",
      compact: "コンパクト",
      normal: "標準",
      spacious: "広め"
    },
    fonts: {
      unified: "統一 UI フォント",
      unifiedDetail: "統一モードで使います。PingFang、Inter、Anthropic Sans なども手入力できます。",
      latin: "英字 / ラテン",
      latinDetail: "英語メニュー、ラベル、数字の主フォントです。",
      chinese: "中国語フォント",
      chineseDetail: "中国語ラベルと transcript テキストの fallback です。",
      japanese: "日本語フォント",
      japaneseDetail: "Yu Gothic UI はコンパクト、UD Digi Kyokasho は教科書風の読み心地です。",
      korean: "韓国語フォント",
      koreanDetail: "Malgun Gothic は Windows 標準の韓国語 UI 基準です。",
      detected: "インストール済みフォント",
      detectedDetail_one: "この Windows プロファイルで {{count}} 件のフォントファミリーを検出しました。",
      detectedDetail_other: "この Windows プロファイルで {{count}} 件のフォントファミリーを検出しました。"
    },
    fontPreview: {
      title: "フォントプレビュー"
    },
    codeFont: { label: "コードフォント", detail: "コード、パス、コマンドライン、ID、表形式の証拠に使います。" },
    links: {
      githubLabel: "GitHub を開く",
      githubDetail: "issues、actions、releases 用の公開リポジトリです。",
      readmeLabel: "README を開く",
      readmeDetail: "プロジェクト概要、CLI コマンド、デスクトップのメモです。"
    },
    indexing: {
      sqliteLabel: "SQLite 索引",
      codexHomeLabel: "Codex フォルダーを開く",
      rolloutLabel: "Rollout JSONL",
      spawnEdgesLabel: "Spawn edges",
      spawnEdgesDetail: "thread_spawn_edges の親子グラフ。",
      pidSessionsLabel: "PID セッション",
      claudeHomeLabel: "Claude フォルダーを開く",
      transcriptsLabel: "転写"
    },
    runtime: {
      win32Label: "Win32_Process",
      win32Detail_one: "{{count}} 件の関連行。PID、PPID、パス、コマンドライン、作成時刻。",
      win32Detail_other: "{{count}} 件の関連行。PID、PPID、パス、コマンドライン、作成時刻。",
      windowTitlesLabel: "ウィンドウタイトル",
      windowTitlesDetail: "Windows が公開している場合は Get-Process MainWindowTitle を使います。",
      candidatesLabel: "セッション候補",
      candidatesDetail_one:
        "{{count}} 件の索引済みセッションを PID、cwd、転写、タイトル、時間証拠で採点します。",
      candidatesDetail_other:
        "{{count}} 件の索引済みセッションを PID、cwd、転写、タイトル、時間証拠で採点します。"
    },
    confidence: {
      exactDetail: "Claude PID ファイルまたは将来の hook マッピング。",
      heuristicDetail: "強いパス/タイトル証拠を使い、スコアと理由を表示します。",
      unknownDetail: "弱い時間のみの候補は表示できますが、一致とは扱いません。"
    },
    diagnostics: {
      warningsLabel: "Doctor 警告",
      warningsDetail_one:
        "Codex、Claude、SQLite、JSONL、プロセススキャン全体で {{count}} 件の警告。",
      warningsDetail_other:
        "Codex、Claude、SQLite、JSONL、プロセススキャン全体で {{count}} 件の警告。"
    }
  },
  inspector: {
    nothingTitle: "選択されていません",
    nothingDetail: "証拠を調べるプロセスまたはセッションを選択してください。",
    likelySessions: "可能性の高いセッション",
    processRole: "プロセス役割",
    runtime: "ランタイム",
    identity: "識別",
    transcript: "転写",
    modelRuntime: "モデルと実行設定",
    codexSpawn: "Codex spawn",
    processRuntime: "プロセス実行時",
    control: "安全な制御",
    indexMetadata: "索引メタデータ",
    relations: "関係",
    relationDetail: "関係詳細",
    endpoints: "端点",
    evidence: "証拠",
    searchHit: "検索ヒット",
    safeSearchHitDetail: "安全検索ではイベントメタデータ、命中フィールド、ファイル位置だけを表示し、転写本文は表示しません。",
    activity: "アクティビティ",
    topEvents: "主要イベント",
    topTools: "主要ツール",
    models: "モデル",
    tokens: "トークン",
    noEvidence: "証拠は添付されていません。",
    noActivity: "転写アクティビティ概要はありません。",
    noCandidate:
      "候補セッションがありません。PID、cwd、転写、タイトル、時間証拠がない場合、AgentScope は推測しません。",
    noCwdEvidence: "cwd 証拠なし",
    safeControlDetail:
      "読み取り専用モードです。開く、場所を表示、resume コマンド生成、書き出しのみを許可します。kill/archive は明示的な force 制御が入るまで無効です。",
    launchAction: {
      resume: "resume",
      fork: "fork"
    },
    actions: {
      openTranscript: "転写を開く",
      revealTranscript: "転写の場所を表示",
      backupSession: "セッションをバックアップ",
      backupSessions: "{{count}} セッションをバックアップ",
      deleteSession: "セッションを削除",
      deleteSessions: "{{count}} セッションを削除",
      resumeSession: "Agent で resume",
      forkSession: "Agent で fork",
      resumeInAgent: "{{agent}} で resume",
      forkInAgent: "{{agent}} で fork",
      importSession: "セッションをインポート",
      writeDeletePlan: "削除計画を書き出す",
      planImport: "インポート計画"
    },
    fields: {
      pid: "PID",
      ppid: "PPID",
      title: "タイトル",
      started: "開始",
      executable: "実行ファイル",
      command: "コマンド",
      role: "役割",
      rootPid: "Root PID",
      parentAgentPid: "Agent parent",
      roleEvidence: "Role evidence",
      session: "セッション",
      source: "ソース",
      target: "ターゲット",
      confidence: "信頼度",
      status: "状態",
      updated: "更新",
      name: "名前",
      path: "パス",
      index: "索引",
      parent: "親",
      children: "子",
      lines: "行数",
      bytes: "サイズ",
      firstEvent: "最初のイベント",
      lastEvent: "最後のイベント",
      cliVersion: "CLI",
      gitBranch: "Git",
      permission: "権限",
      mode: "モード",
      compacted: "圧縮",
      sidechain: "サイドチェーン",
      parseErrors: "解析エラー",
      inputTokens: "入力",
      outputTokens: "出力",
      cacheRead: "キャッシュ読込",
      cacheWrite: "キャッシュ作成",
      modelProvider: "提供元",
      model: "モデル",
      reasoningEffort: "推論強度",
      tokensUsed: "使用トークン",
      approvalMode: "承認",
      sandboxPolicy: "サンドボックス",
      entrypoint: "入口",
      spawnStatus: "spawn",
      depth: "深さ",
      agentNickname: "Agent",
      agentRole: "役割",
      agentPath: "Agent path",
      sourceKind: "ソース種別",
      runtimeSessionId: "Runtime ID",
      runtimeWorkingDir: "Runtime cwd",
      resumeCommand: "再開コマンド",
      safeControl: "境界"
    }
  },
  toast: {
    snapshotCanceled: "書き出しをキャンセルしました",
    snapshotExported: "スナップショットを書き出しました",
    externalOpened: "外部リンクを開きました",
    externalBlocked: "外部リンクをブロックしました",
    openFailed: "開けませんでした: {{message}}",
    pathOpened: "パスを開きました",
    pathRevealed: "パスを表示しました",
    sessionBackedUp: "セッションバックアップを書き出しました",
    sessionsBackedUp: "{{count}}/{{total}} セッションをバックアップしました",
    noSessionsBackedUp: "バックアップされたセッションはありません",
    sessionDeleted: "セッションを隔離へ移動しました",
    sessionsDeleted: "{{count}}/{{total}} セッションを隔離へ移動しました",
    noSessionsDeleted: "削除されたセッションはありません",
    sessionImported: "バックアップからセッションをインポートしました",
    sessionRestored: "隔離からセッションを復元しました",
    sessionLaunchStarted: "{{agent}} {{action}} を開始しました",
    sessionLaunchUnsupported: "このセッションは Codex/Claude コントロールで起動できません",
    deletePlanWritten: "削除計画を書き出しました: {{path}}",
    deletePlanUnavailable: "削除計画を書き出せませんでした",
    deletePlanPartial: "{{count}}/{{total}} セッションの削除計画を書き出しました",
    importPlanWritten: "インポート計画を書き出しました: {{path}}",
    importPlanCanceled: "インポート計画をキャンセルしました",
    settingsReset: "設定をリセットしました",
    cacheCleared: "アプリキャッシュを消去しました",
    diagnosticRepairComplete: "診断修復が完了しました",
    diagnosticAdvice: "診断修復の助言",
    operationFailed: "操作に失敗しました: {{message}}"
  },
  confirm: {
    deleteSessionTitle: "セッションを削除",
    deleteSessionsTitle: "{{count}} セッションを削除",
    deleteSession:
      "このセッションを削除しますか?\n\n{{title}}\n\nBackup:\n{{backupDir}}\n\nQuarantine:\n{{quarantineDir}}\n\nJournal:\n{{journalPath}}\n\nAgentScope は先にバックアップして journal を書き込み、検証済みのローカル参照を削除してからセッションファイルを隔離へ移動します。正確な PID と信頼度の高い Codex プロセス候補はブロックされます。",
    deleteSessions:
      "選択した {{count}} セッションを削除しますか?\n\n最初の Backup:\n{{backupDir}}\n\n最初の Quarantine:\n{{quarantineDir}}\n\n最初の Journal:\n{{journalPath}}\n\nAgentScope は各セッションを個別のバックアップ、隔離ディレクトリ、journal で処理します。コア blocker はセッションごとに適用されます。"
  }
} satisfies ResourceTree;
