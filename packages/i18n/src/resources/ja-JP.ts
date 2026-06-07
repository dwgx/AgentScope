import { enUS } from "./en-US.js";
import type { ResourceTree } from "../types.js";

export const jaJP = {
  ...enUS,
  app: { tagline: "制御 + トレースレイヤー" },
  common: {
    ...enUS.common,
    agent: { codex: "codex", claude: "claude", unknown: "unknown" },
    action: { open: "開く", refresh: "更新", reset: "リセット", show: "表示", hide: "非表示" },
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
      readOnly: "読み取り専用"
    },
    confidence: { exact: "正確", indexed: "索引", heuristic: "推定", unknown: "不明" },
    date: { started: "開始 {{date}}", updated: "更新 {{date}}" },
    path: {
      noCommandLine: "コマンドラインなし",
      noPathEvidence: "パス証拠なし",
      noPath: "パスなし",
      loading: "パスを読み込み中"
    }
  },
  nav: {
    processes: "プロセス",
    sessions: "セッション",
    relations: "関係",
    doctor: "診断",
    settings: "設定",
    system: "システム",
    refreshIndex: "索引を更新"
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
    proc: "Proc",
    matched: "一致",
    warn: "警告",
    refreshTitle: "更新"
  },
  views: {
    processes: {
      emptyTitle: "関連プロセスがありません",
      emptyDetail:
        "Codex、Claude、node_repl、app-server、daemon のプロセスは見つかりませんでした。",
      subtitle_one: "{{count}} 件の関連 Win32 行",
      subtitle_other: "{{count}} 件の関連 Win32 行",
      noCandidate: "セッション候補はまだありません",
      weakEvidence: "弱い証拠",
      candidate: "候補",
      score: "スコア {{score}}"
    },
    sessions: {
      emptyTitle: "セッションが索引されていません",
      emptyDetail: "Doctor を実行して Codex と Claude のローカルパスを確認してください。",
      subtitle_one: "{{count}} 件の Claude + Codex レコード",
      subtitle_other: "{{count}} 件の Claude + Codex レコード"
    },
    relations: {
      emptyTitle: "関係が見つかりません",
      emptyDetail: "Codex の spawn edge またはプロセス関係が索引されるとここに表示されます。",
      subtitle_one: "{{count}} 件のセッション/プロセスグラフ辺",
      subtitle_other: "{{count}} 件のセッション/プロセスグラフ辺"
    },
    doctor: {
      emptyTitle: "Doctor は未実行です",
      emptyDetail: "更新してローカル環境チェックを実行してください。",
      subtitle_one: "{{count}} 件の環境チェック",
      subtitle_other: "{{count}} 件の環境チェック"
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
        "読み取り専用です。破壊的な制御は明示的な force オプションができるまで提案だけを出します。"
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
      detail: "SQLite のタイトル/プレビューと、ローカル Codex/Claude JSONL 転写を検索します。"
    },
    searchLimit: { label: "検索結果数", detail: "コマンドバー検索で返す最大一致数です。" },
    resetUi: {
      label: "UI 設定をリセット",
      detail: "テーマ、密度、動き、インスペクター、文字サイズ、言語、検索件数を復元します。"
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
    uiScale: {
      label: "UI スケール",
      detail: "全体の UI フォントサイズを変更します。",
      small: "小",
      normal: "標準",
      large: "大"
    },
    codeFont: { label: "コードフォント", detail: "Cascadia Code" },
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
    runtime: "ランタイム",
    identity: "識別",
    transcript: "転写",
    indexMetadata: "索引メタデータ",
    relations: "関係",
    evidence: "証拠",
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
    fields: {
      pid: "PID",
      ppid: "PPID",
      title: "タイトル",
      started: "開始",
      executable: "実行ファイル",
      command: "コマンド",
      session: "セッション",
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
      cacheWrite: "キャッシュ作成"
    }
  },
  toast: {
    snapshotCanceled: "書き出しをキャンセルしました",
    snapshotExported: "スナップショットを書き出しました: {{path}}",
    externalOpened: "{{url}} を開きました",
    externalBlocked: "外部 URL をブロックしました: {{url}}",
    openFailed: "開けませんでした: {{message}}",
    pathOpened: "{{path}} を開きました",
    pathRevealed: "{{path}} を表示しました"
  }
} satisfies ResourceTree;
