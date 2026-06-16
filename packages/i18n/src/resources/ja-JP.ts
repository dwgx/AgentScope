import { enUS } from "./en-US.js";
import type { ResourceTree } from "../types.js";

export const jaJP = {
  ...enUS,
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
      retry: "再試行",
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
      protected: "保護済み",
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
    noResults: "一致する安全なメタデータはありません",
    typeToSearch: "キーワードを入力してインデックス済みセッションと安全なメタデータを検索",
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
      captureOffDetail:
        "ライブ Agent プロセスを表示するには、設定 > ランタイムで Win32_Process をオンにしてください。",
      subtitle_one: "{{count}} 件の関連 Win32 行",
      subtitle_other: "{{count}} 件の関連 Win32 行",
      noCandidate: "セッション候補はまだありません",
      helperNoCandidate: "補助プロセスです。直接の session id や転写証拠はありません。",
      weakEvidence: "弱い証拠",
      candidate: "候補",
      score: "証拠 {{score}}",
      allProcesses: "すべてのプロセス",
      taskRoot: "タスクルート PID {{pid}}",
      noParentPid: "親 PID なし",
      noCwdCandidate: "cwd 候補なし",
      groupCount_one: "{{count}} 件のプロセス",
      groupCount_other: "{{count}} 件のプロセス",
      sort: {
        label: "並び替え",
        active: "活動",
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
        agent: "エージェント",
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
        codex_engine: "Codex エンジン",
        codex_node_repl: "サブエージェント実行環境",
        codex_app_server: "Codex app-server",
        codex_mcp_tool: "MCP ツール",
        codex_tool_kernel: "ツールカーネル",
        claude_cli: "Claude CLI",
        claude_daemon: "Claude daemon",
        agent_helper: "エージェント補助",
        unknown: "不明な役割"
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
      allSessions: "すべてのセッション",
      rootNoParent: "ルート / 親なし",
      parentGroup: "親: {{title}}",
      noCwd: "cwd なし",
      recycle: {
        title: "ごみ箱",
        loading: "隔離エントリをスキャン中...",
        error: "隔離スキャンに失敗しました",
        subtitle: "{{count}} 件隔離、{{restorable}} 件復元可能",
        empty: "隔離されたセッションはありません。",
        restore: "復元",
        restoreTitle: "検証済みバックアップからこの隔離セッションを復元します。",
        restoredAction: "復元済み",
        blockedAction: "ブロック",
        unavailableAction: "不可",
        restoreBlocked: "この隔離項目は復元できません。",
        parent: "親 {{id}}",
        evidence: "{{files}} ファイル / {{db}} DB 手順",
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
        agent: "エージェント",
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
        manual:
          "自動修復は登録されていません。証拠パスを確認し、データは読み取り専用のままにしてください。"
      }
    },
    loading: {
      title: "ローカル Agent 状態を読み込み中",
      detail: "Win32_Process、Codex SQLite/JSONL、Claude セッションファイルを確認しています。",
      errorTitle: "Agent 状態の読み込みに失敗しました",
      errorDetail:
        "{{message}}。更新して再試行してください。新しいスナップショットが読み込まれるまで AgentScope はデータを読み取り専用に保ちます。"
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
      detail:
        "SQLite の識別フィールドとローカル Codex/Claude JSONL の安全なメタデータを検索します。転写本文や hidden/internal フィールドは検索しません。"
    },
    searchPreview: {
      label: "SQLite preview 検索",
      detail:
        "Codex SQLite preview テキストを一致判定に含めます。結果には preview 本文を表示しません。"
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
      detail:
        "現在のページ、選択中のプロセス/セッション、cwd、モデル、ツール、診断から検索候補を表示します。"
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
    codexControl: {
      ...enUS.settings.codexControl,
      title: "Codex 設定サーフェス",
      detail:
        "許可リスト内のユーザー所有 Codex ファイルだけを編集します。auth、credentials、logs、history 本文、plugin cache、memory 本文はブロックされたままです。",
      surfaces: "Codex 制御サーフェス",
      loading: "Codex 制御サーフェスを読み込み中...",
      editable: "編集可",
      readOnly: "読み取り専用",
      noChanges: "保存する Codex 制御変更はありません。",
      dirty: "未保存の Codex 制御変更",
      clean: "保留中の Codex 制御変更はありません",
      emptyTab: "このタブに構造化コントロールは見つかりませんでした。",
      changedKeys: "変更キー",
      savedWithJournal: "保存しました。Journal: {{path}}",
      highRiskTitle: "高リスク Codex 設定",
      highRiskConfirm:
        "これらの高リスク Codex 設定を保存しますか?\n\n{{keys}}\n\n{{warnings}}\n\nAgentScope は先にバックアップと journal を書き込みます。",
      confirmSave: "保存を続行",
      readOnlyDetail:
        "このサーフェスは証拠としてのみ表示されます。状態、キャッシュ、ベンダー管理、または本文を含むため AgentScope は変更しません。",
      emptyTitle: "サーフェスが選択されていません",
      emptyDetail:
        "Codex 設定サーフェスを選び、証拠を確認するか、バックアップ付きドキュメントを編集してください。",
      save: "保存",
      controlSaved: "Codex 制御を保存しました",
      verification: "書き込み検証",
      verificationStatus: {
        passed: "読み戻し一致",
        failed: "読み戻し失敗"
      },
      effectiveScope: "有効範囲",
      newSessionEffect: "config.toml へ書き込み済みです。通常、新しく開始した Codex セッションで読み込まれます。",
      saved: "保存しました。以前のファイルは存在しないため、バックアップは不要でした。",
      savedWithBackup: "保存しました。バックアップ: {{path}}",
      backupBeforeSave:
        "保存前に sha256 を確認し、先に ~/.agentscope へバックアップを書き込みます。",
      redacted:
        "機密キー名は伏せられました。再読み込みまたは場所を表示し、AgentScope の外で編集してください。",
      exists: "存在",
      bytes: "バイト",
      updated: "更新",
      modeTitle: "Codex モード既定値",
      modeDetail:
        "documented config.toml キーだけを書き込みます。Plan モードは既定モデルを継承し、reasoning effort だけ上書きできます。",
      model: "モデル",
      reasoning: "推論",
      inheritDefault: "既定を継承",
      unset: "未設定",
      planModelNote:
        "独立した Plan モデルキーは文書化されていません。AgentScope は継承される既定モデルだけを表示します。",
      reviewReasoningNote: "Review reasoning は既定の reasoning 設定を継承します。",
      modeEvidence:
        "証拠元: OpenAI Codex manual の設定キー説明、およびローカル config.toml のトップレベル代入。",
      mode: {
        default: "Default モード",
        plan: "Plan モード",
        review: "Review"
      },
      source: {
        config: "設定",
        inherits_default: "継承",
        unset: "未設定"
      },
      tabs: {
        templates: "テンプレート",
        overview: "概要",
        models: "モデル",
        safety: "安全",
        runtime: "ランタイム",
        mcp: "MCP",
        skills: "Skills",
        storage: "保存",
        advanced: "詳細",
        files: "ファイル"
      },
      risk: {
        low: "低",
        medium: "中",
        high: "高",
        blocked: "ブロック"
      },
      status: {
        ok: "OK",
        warn: "注意",
        blocked: "ブロック"
      },
      auth: {
        present: "保護された auth あり",
        missing: "ファイル auth なし"
      },
      overview: {
        codexHome: "公式 CODEX_HOME ルート。AgentScope はメタデータだけを一覧化します。",
        sqliteHome: "config/env 解決後の SQLite 状態ルート。"
      },
      templates: {
        title: "Codex パラメータテンプレート",
        detail:
          "ローカル config.toml を先に読み取り、正確な key patch をプレビューしてから、選択された許可リスト内の scalar キーだけをバックアップ、journal、高リスク確認、atomic write 付きで適用します。未知の高度な設定は保持し、安全に一致しない場合はブロックします。",
        list: "Codex パラメータテンプレート",
        preview: "テンプレートプレビュー",
        previewEmpty: "テンプレートを選択すると config.toml の変更内容を確認できます。",
        apply: "選択項目を適用",
        current: "現在値",
        templateValue: "テンプレート値",
        changed: "変更あり",
        same: "同じ",
        footer: "選択済みの変更キー {{count}} 件: {{keys}}",
        customName: "カスタムテンプレート名",
        customDescription: "カスタムテンプレート説明",
        saveCustom: "選択項目をテンプレートとして保存",
        delete: "カスタムテンプレートを削除",
        savedCustom: "カスタム Codex テンプレートを保存しました。",
        deletedCustom: "カスタム Codex テンプレートを削除しました。",
        applied: "Codex テンプレートを適用しました",
        customEmpty: "カスタムテンプレートはまだありません。プレビューで選択した行を保存して作成できます。",
        group: {
          current: "現状",
          builtin: "組み込み",
          custom: "カスタム"
        },
        currentTemplate: {
          name: "現状",
          description:
            "config.toml で認識できる現在値の読み取り専用スナップショットです。未知の高度な設定は保持されますが、テンプレートにはコピーしません。"
        },
        builtin: {
          "yolo-full-access": {
            name: "YOLO / Full Access",
            description:
              "最大のローカル自律性: 確認なし、danger-full-access、Windows elevated sandbox、live 検索、xhigh reasoning、multi-agent。"
          },
          "safe-workspace": {
            name: "Safe Workspace",
            description: "workspace-write sandbox、on-request 承認、cached 検索、ユーザーレビュー。"
          },
          "readonly-audit": {
            name: "Read-only Audit",
            description:
              "read-only sandbox、on-request 承認、cached 検索、high reasoning、xhigh plan reasoning。"
          },
          "deep-planning": {
            name: "Deep Planning",
            description: "権限を変えずに xhigh の実装 reasoning と plan reasoning を使います。"
          },
          "live-research": {
            name: "Live Research",
            description: "承認や sandbox 権限を変えずに live Web 検索と high reasoning を使います。"
          }
        }
      },
      workbench: {
        title: "Codex 設定ワークベンチ",
        detail: "まず現在の config 状態を編集します。テンプレートは変更をステージするだけで、適用時に選択項目だけを atomic write します。",
        sections: "Codex 設定セクション",
        section: {
          current: "現状",
          mcp: "MCP サーバー",
          templates: "テンプレート",
          unknown: "未知項目"
        },
        enabled: "有効",
        disabled: "未有効",
        enable: "有効化",
        reset: "戻す",
        staged: "ステージ済み変更",
        stagedDetail: "{{count}} 件の選択済み変更",
        stageTemplate: "ステージ",
        templateStaged: "テンプレート変更をステージしました。適用前に確認してください。",
        mcpName: "server-name",
        mcpCommand: "command",
        stageMcp: "MCP をステージ",
        line: "{{line}} 行目",
        noUnknown: "未知の config 項目はありません。",
        editableUnknown:
          "{{count}} 件の未知 scalar 項目を未検証の詳細設定として上に表示しています。編集できますが、Codex が使うとは証明できません。",
        noReadOnlyUnknown: "複雑または機密値として読み取り専用表示が必要な残りの未知項目はありません。"
      },
      applyModal: {
        animating: "config patch を計画中",
        writing: "atomic write 実行中",
        success: "config を適用しました",
        error: "config 適用に失敗",
        detail: "AgentScope は一致した構造化設定だけを書き込み、未知の config を保持します。",
        atomicWrite: "一時ファイル、fsync、rename、journal を実行",
        verified: "{{count}} 件の key で読み戻し検証に成功"
      },
      items: {
        model: {
          label: "デフォルトモデル",
          detail:
            "CLI、アプリ、profile、project 設定で上書きされない場合に使う Codex のトップレベルモデル。"
        },
        model_provider: {
          label: "モデル Provider",
          detail:
            "model_providers から選択する provider id。推奨 id は候補であり、custom provider も許可されます。"
        },
        review_model: {
          label: "Review モデル",
          detail: "Codex review ワークフロー用の任意のモデル上書き。"
        },
        model_reasoning_effort: {
          label: "デフォルト推論強度",
          detail: "Default モードの reasoning effort。"
        },
        plan_mode_reasoning_effort: {
          label: "Plan 推論強度",
          detail: "Plan モードの reasoning 上書き。モデルはデフォルトモデルを継承します。"
        },
        model_reasoning_summary: {
          label: "Reasoning summary",
          detail: "Responses API 対応モデルで使う reasoning summary ポリシー。"
        },
        model_verbosity: {
          label: "モデル verbosity",
          detail: "provider が Responses API を使う場合の GPT-5 family text verbosity。"
        },
        model_supports_reasoning_summaries: {
          label: "Reasoning summaries を強制",
          detail: "現在のモデルで reasoning summaries を強制的に有効または無効にします。"
        },
        project_doc_max_bytes: {
          label: "Project doc 最大 bytes",
          detail: "初回 turn instruction に埋め込む AGENTS.md / project instructions の最大 bytes。"
        },
        openai_base_url: {
          label: "OpenAI base URL",
          detail: "組み込み OpenAI provider の base URL override。"
        },
        model_providers_OpenAI_name: {
          label: "OpenAI Provider 名",
          detail: "OpenAI という名前の custom model provider table の表示名。"
        },
        model_providers_OpenAI_base_url: {
          label: "OpenAI Provider base URL",
          detail: "OpenAI という名前の custom model provider table の base URL。"
        },
        model_providers_OpenAI_requires_openai_auth: {
          label: "OpenAI Provider 認証",
          detail: "OpenAI という名前の custom model provider table で OpenAI authentication を使います。"
        },
        approval_policy: {
          label: "承認ポリシー",
          detail: "高リスク操作の前に Codex がいつ確認を求めるかを制御します。"
        },
        approvals_reviewer: {
          label: "承認レビュー担当",
          detail: "対象の承認プロンプトをユーザーまたは自動レビューへ送ります。"
        },
        sandbox_mode: {
          label: "サンドボックスモード",
          detail: "shell 作業のローカルファイルシステムとネットワーク隔離を制御します。"
        },
        web_search: {
          label: "Web 検索",
          detail: "Codex の Web 検索を cached、live、disabled で制御します。"
        },
        hide_agent_reasoning: {
          label: "reasoning を隠す",
          detail: "表示ポリシーのみです。AgentScope は hidden vendor reasoning を読みません。"
        },
        show_raw_agent_reasoning: {
          label: "raw reasoning を表示",
          detail:
            "高リスク表示設定です。この値に関係なく AgentScope は hidden vendor reasoning を表示しません。"
        },
        service_tier: {
          label: "サービス tier",
          detail: "アカウント/モデルが対応する場合の OpenAI service tier 選択。"
        },
        windows_sandbox: {
          label: "Windows サンドボックス",
          detail: "Windows 固有のサンドボックス実装設定。"
        },
        features_multi_agent: {
          label: "Multi-agent 機能",
          detail: "この Codex build に multi-agent/subagent サポートがある場合の feature flag。"
        },
        features_goals: {
          label: "Goals 機能",
          detail: "この Codex build で Goal mode がサポートされる場合の feature flag。"
        },
        features_memories: {
          label: "Memories 機能",
          detail: "Codex Memories をグローバルに有効化します。AgentScope は memory 本文を読みません。"
        },
        features_js_repl: {
          label: "JS REPL 機能",
          detail: "この Codex build に JavaScript REPL capability がある場合の feature flag。"
        },
        memories_generate_memories: {
          label: "記憶を生成",
          detail:
            "Codex が memory record を生成するかを制御します。AgentScope は memory 本文を読みません。"
        },
        memories_use_memories: {
          label: "記憶を使用",
          detail:
            "Codex が保存済み memory を注入するかを制御します。AgentScope は memory 本文を表示しません。"
        }
      },
      surfaceText: {
        config_global: {
          label: "config.toml",
          detail:
            "CLI、IDE、desktop で共有される Codex ユーザー設定。安全な編集には上の構造化コントロールを使います。"
        },
        agents_global: {
          label: "AGENTS.md",
          detail: "個人用 Codex 指示。Codex Desktop の personalization はここへ書き込みます。"
        },
        mcp_summary: {
          label: "MCP サーバー",
          detail:
            "config.toml の MCP サーバーテーブル。変更する場合は設定ドキュメントを編集します。"
        },
        archive_summary: {
          label: "アーカイブ済みスレッド",
          detail: "アーカイブ数のみ。AgentScope はここでアーカイブ会話本文を表示しません。"
        },
        memory_summary: {
          label: "記憶",
          detail:
            "memory database の存在のみ。AgentScope は memory content を読んだり編集したりしません。"
        },
        database_state: {
          label: "state_5.sqlite",
          detail:
            "Codex state database の schema と行数 summary のみ。transcript 本文は読みません。"
        },
        database_goals: {
          label: "goals_1.sqlite",
          detail: "Codex goals database の schema と行数 summary のみ。"
        },
        database_memories: {
          label: "memories_1.sqlite",
          detail:
            "Codex memories database の schema と行数 summary のみ。memory content は読みません。"
        },
        database_logs: {
          label: "logs_2.sqlite",
          detail:
            "Codex logs database の schema と行数 summary のみ。log body text は復元または表示しません。"
        },
        database_dev: {
          label: "sqlite/codex-dev.db",
          detail: "Codex Desktop automation database の schema と行数 summary のみ。"
        },
        browser_state: {
          label: "Browser 連携",
          detail: "browser profile/cache の存在のみ。AgentScope は browsing data を読みません。"
        },
        browser_output: {
          label: "Browser automation 出力",
          detail:
            "Playwright console/page artifacts を拡張子別に数えるだけです。page snapshots や console 本文は読みません。"
        },
        computer_use_state: {
          label: "Computer Use 連携",
          detail:
            "Computer Use local state の存在のみ。AgentScope は desktop control を起動しません。"
        },
        mcp_node_runtime: {
          label: "MCP Node 実行環境",
          detail:
            "インストール済み MCP Node 実行環境メタデータ。package scripts の実行や source bodies の検査はしません。"
        },
        node_repl_runtime: {
          label: "Node REPL 実行環境",
          detail: "Node REPL 実行環境の存在とエントリ数のみ。active exec bodies は読みません。"
        },
        tmp_arg0: {
          label: "Codex 引数一時ファイル",
          detail:
            "temporary command argument folders を数えるだけです。生成された command files は開きません。"
        },
        vendor_imports_cache: {
          label: "Vendor imports キャッシュ",
          detail: "vendor import cache の存在のみ。cached marketplace bodies は読みません。"
        },
        pets_state: {
          label: "Pets 状態",
          detail: "Codex Desktop local state の存在のみ。"
        },
        plugins_summary: {
          label: "プラグイン",
          detail:
            "installed plugin cache と config summary。AgentScope は plugin cache bytes を直接編集しません。"
        },
        rules: {
          label: "ルールファイル",
          detail: "ユーザー config layer の Codex command approval rules。"
        },
        skill: {
          label: "ユーザー Skill",
          detail:
            "ユーザー Skill 作成サーフェス。AgentScope は SKILL.md のみ編集し、先にバックアップします。"
        },
        skillReadOnly: {
          label: "読み取り専用 Skill",
          detail: "同梱またはシステム Skill サーフェス。AgentScope は読み取り専用にします。"
        }
      },
      warning: {
        authMetadataOnly:
          "auth.json には認証情報が含まれます。AgentScope はメタデータのみを表示し、token フィールドを開く、編集する、表示することはありません。",
        rawConfigBlocked:
          "高リスクキーが構造化確認を迂回しないよう、raw config 編集はブロックされています。",
        sensitiveKeysBlocked: "機密キー名を検出しました。raw config 編集はブロックされています。",
        systemSkillsReadOnly: "システムまたはプラグイン提供の Skills は読み取り専用です。",
        pluginWorkflowOnly:
          "install/remove には Codex plugin ワークフローを使用してください。AgentScope は証拠のみを表示します。",
        sensitiveConfigBlocked: "機密 config キーを検出しました。raw 編集はブロックされています。",
        highRiskConfirm: "高リスク設定です。実行には明示的な確認が必要です。",
        archivedCountUnreadable:
          "state_5.sqlite からアーカイブ済みスレッド数を読み取れませんでした。",
        sqliteMetadataUnreadable:
          "この SQLite データベースをメタデータ用に読み取り専用で開けませんでした。",
        complexTomlReplace:
          "現在の値は複雑な TOML です。テンプレート適用でスカラー値に置き換わる可能性があります。"
      },
      mcpTitle: "config.toml の MCP サーバー",
      noMcp: "現在の config.toml に MCP サーバーテーブルは見つかりませんでした。",
      kind: {
        config: "設定",
        agents: "指示",
        rules: "ルール",
        skill: "Skill",
        plugin: "プラグイン",
        mcp: "MCP",
        browser: "ブラウザー",
        computer_use: "Computer Use",
        database: "データベース",
        runtime: "実行環境",
        cache: "キャッシュ",
        memory: "記憶",
        archive: "アーカイブ"
      }
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
      detail:
        "テーマ、密度、モーション、アクセント、フォントプリセット、フォントファミリー、行高を戻します。"
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
      detectedDetail_one:
        "この Windows プロファイルで {{count}} 件のフォントファミリーを検出しました。",
      detectedDetail_other:
        "この Windows プロファイルで {{count}} 件のフォントファミリーを検出しました。"
    },
    fontPreview: {
      title: "フォントプレビュー"
    },
    codeFont: {
      label: "コードフォント",
      detail: "コード、パス、コマンドライン、ID、表形式の証拠に使います。"
    },
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
      spawnEdgesLabel: "spawn 辺",
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
    mcpIdentity: "MCP 識別",
    control: "安全な制御",
    indexMetadata: "索引メタデータ",
    relations: "関係",
    relationDetail: "関係詳細",
    endpoints: "端点",
    evidence: "証拠",
    searchHit: "検索ヒット",
    safeSearchHitDetail:
      "安全検索ではイベントメタデータ、命中フィールド、ファイル位置だけを表示し、転写本文は表示しません。",
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
    mcpSource: {
      user_config: "ユーザー設定",
      plugin_config: "プラグイン設定",
      process_only: "プロセス証拠"
    },
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
      rootPid: "ルート PID",
      parentAgentPid: "Agent 親",
      roleEvidence: "役割証拠",
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
      agentPath: "Agent パス",
      sourceKind: "ソース種別",
      runtimeSessionId: "実行時 ID",
      runtimeWorkingDir: "実行時 cwd",
      server: "サーバー",
      serverKind: "種類",
      transport: "転送方式",
      configSource: "設定元",
      configTable: "設定テーブル",
      commandSummary: "コマンド概要",
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
