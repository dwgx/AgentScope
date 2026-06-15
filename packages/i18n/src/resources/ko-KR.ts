import { enUS } from "./en-US.js";
import type { ResourceTree } from "../types.js";

export const koKR = {
  ...enUS,
  common: {
    ...enUS.common,
    agent: { codex: "codex", claude: "claude", unknown: "unknown" },
    action: {
      open: "열기",
      refresh: "새로 고침",
      reset: "초기화",
      clear: "지우기",
      cancel: "취소",
      reveal: "위치 표시",
      openJournal: "journal 열기",
      revealJournal: "journal 표시",
      repair: "수리",
      advice: "조언",
      retry: "다시 시도",
      restart: "다시 시작",
      show: "표시",
      hide: "숨기기"
    },
    status: {
      ...enUS.common.status,
      ok: "정상",
      warn: "경고",
      local: "로컬",
      read: "읽기",
      stream: "스트림",
      indexed: "색인됨",
      exact: "정확",
      resolved: "해결됨",
      on: "켜짐",
      scored: "점수화됨",
      evidence: "증거",
      diagnostic: "진단",
      protected: "보호됨",
      readOnly: "읽기 전용"
    },
    confidence: { exact: "정확", indexed: "색인됨", heuristic: "추정", unknown: "알 수 없음" },
    date: { started: "시작 {{date}}", updated: "업데이트 {{date}}" },
    path: {
      noCommandLine: "명령줄 없음",
      noPathEvidence: "경로 증거 없음",
      noPath: "경로 없음",
      loading: "경로 로드 중",
      path: "경로",
      evidence: "증거 경로",
      directory: "디렉터리",
      file: "파일",
      notAllowed: "경로가 AgentScope 로컬 추적 허용 목록에 없습니다"
    }
  },
  nav: {
    processes: "프로세스",
    sessions: "세션",
    relations: "관계",
    doctor: "진단",
    codexControl: "Codex 제어",
    settings: "설정",
    system: "시스템",
    refreshIndex: "색인 새로 고침"
  },
  relations: {
    kind: {
      parent_child: "세션 파생",
      process_parent: "프로세스 트리",
      transcript: "전사 연결",
      subagent: "하위 에이전트"
    },
    endpoint: {
      parent_child: { source: "부모 세션", target: "자식 세션" },
      process_parent: { source: "부모 PID", target: "자식 PID" },
      transcript: { source: "세션", target: "전사" },
      subagent: { source: "부모 세션", target: "하위 에이전트" }
    }
  },
  menu: {
    file: {
      label: "파일",
      exportSnapshot: "스냅샷 내보내기",
      openAppData: "앱 데이터 열기",
      openCodexHome: "Codex 홈 열기",
      openClaudeHome: "Claude 홈 열기",
      reloadWindow: "창 다시 로드",
      quit: "AgentScope 종료"
    },
    view: {
      label: "보기",
      graphiteTheme: "Graphite 테마",
      blueprintTheme: "Blue 테마",
      highContrast: "고대비",
      midnightTheme: "Midnight 테마",
      toggleInspector: "검사기 전환"
    },
    trace: {
      label: "추적",
      refreshIndex: "색인 새로 고침",
      showWeakCandidates: "약한 후보 표시",
      openSelectedTranscript: "선택한 transcript 열기",
      revealSelectedTranscript: "선택한 transcript 위치 열기",
      openSelectedCwd: "선택한 작업 폴더 열기",
      revealCodexSqlite: "Codex SQLite 위치 열기"
    },
    help: {
      label: "도움말",
      githubRepository: "GitHub 저장소",
      githubActions: "GitHub Actions",
      issues: "Issues",
      readme: "README"
    },
    detail: { json: "JSON", jsonl: "JSONL", logs: "로그", public: "공개" }
  },
  command: {
    searchPlaceholder: "세션, 전사, 명령줄 검색",
    palettePlaceholder: "세션, 경로, 이벤트, 명령 검색",
    proc: "Proc",
    matched: "일치",
    warn: "경고",
    refreshTitle: "새로 고침",
    results: "검색 결과",
    noResults: "일치하는 안전 메타데이터가 없습니다",
    typeToSearch: "키워드를 입력해 인덱싱된 세션과 안전 메타데이터 검색",
    clearSearch: "검색 지우기",
    history: "최근 검색",
    noHistory: "최근 검색이 없습니다",
    suggestions: "추천 검색",
    noSuggestions: "아직 문맥 추천이 없습니다",
    autoSearch: "입력하면 자동 검색",
    contextTitle: "{{view}} 추천",
    suggestion: {
      refresh: "현재 색인 새로 고침",
      processes: "실행 중인 Win32 프로세스 확인",
      sessions: "색인된 세션 탐색",
      relations: "프로세스와 세션 관계 보기",
      doctor: "진단과 수리 조언 확인",
      codexControl: "Codex 설정 표면 편집",
      settings: "작업 영역 동작 조정",
      query: "{{kind}} 검색"
    }
  },
  views: {
    processes: {
      emptyTitle: "관련 프로세스 없음",
      emptyDetail: "Codex, Claude, node_repl, app-server 또는 daemon 프로세스를 찾지 못했습니다.",
      captureOffTitle: "런타임 캡처가 꺼져 있습니다",
      captureOffDetail: "실시간 Agent 프로세스를 보려면 설정 > 런타임에서 Win32_Process를 켜세요.",
      subtitle_one: "{{count}}개의 관련 Win32 행",
      subtitle_other: "{{count}}개의 관련 Win32 행",
      noCandidate: "아직 세션 후보가 없습니다",
      helperNoCandidate: "보조 프로세스입니다. 직접 session id 또는 transcript 증거가 없습니다.",
      weakEvidence: "약한 증거",
      candidate: "후보",
      score: "증거 {{score}}",
      allProcesses: "모든 프로세스",
      taskRoot: "작업 루트 PID {{pid}}",
      noParentPid: "부모 PID 없음",
      noCwdCandidate: "cwd 후보 없음",
      groupCount_one: "{{count}}개 프로세스",
      groupCount_other: "{{count}}개 프로세스",
      sort: {
        label: "정렬",
        active: "활동",
        time: "시간",
        runtime: "실행 시간",
        memory: "메모리",
        score: "증거",
        tree: "프로세스 트리"
      },
      group: {
        label: "그룹",
        task: "작업",
        role: "역할",
        agent: "에이전트",
        parent: "부모 프로세스",
        cwd: "cwd",
        none: "전체"
      },
      context: {
        inspect: "프로세스 검사",
        jumpSession: "세션으로 이동",
        directSessionEvidence: "직접 세션 증거"
      },
      roles: {
        codex_cli: "Codex CLI",
        codex_engine: "Codex 엔진",
        codex_node_repl: "하위 에이전트 런타임",
        codex_app_server: "Codex app-server",
        codex_mcp_tool: "MCP 도구",
        codex_tool_kernel: "도구 커널",
        claude_cli: "Claude CLI",
        claude_daemon: "Claude daemon",
        agent_helper: "에이전트 보조",
        unknown: "알 수 없는 역할"
      }
    },
    sessions: {
      emptyTitle: "색인된 세션 없음",
      emptyDetail: "Doctor를 실행해 Codex 및 Claude 로컬 경로를 확인하세요.",
      subtitle_one: "{{count}}개의 Claude + Codex 레코드",
      subtitle_other: "{{count}}개의 Claude + Codex 레코드",
      groupCount_one: "{{count}}개 세션",
      groupCount_other: "{{count}}개 세션",
      children_one: "{{count}}개 자식 세션",
      children_other: "{{count}}개 자식 세션",
      kind: {
        child: "자식",
        subagent: "하위 에이전트",
        subagentCandidate: "하위 에이전트 후보"
      },
      kindFilter: {
        label: "종류",
        all: "전체",
        root: "루트",
        child: "자식",
        subagent: "하위 에이전트"
      },
      context: {
        selectedCount: "{{count}}개 세션 선택됨"
      },
      allSessions: "모든 세션",
      rootNoParent: "루트 / 부모 없음",
      parentGroup: "부모: {{title}}",
      noCwd: "cwd 없음",
      recycle: {
        title: "휴지통",
        loading: "격리 항목 스캔 중...",
        error: "격리 스캔 실패",
        subtitle: "{{count}}개 격리, {{restorable}}개 복원 가능",
        empty: "격리된 세션이 없습니다.",
        restore: "복원",
        restoreTitle: "검증된 백업에서 이 격리 세션을 복원합니다.",
        restoredAction: "복원됨",
        blockedAction: "차단됨",
        unavailableAction: "사용 불가",
        restoreBlocked: "이 격리 항목은 복원할 수 없습니다.",
        parent: "부모 {{id}}",
        evidence: "{{files}}개 파일 / {{db}}개 DB 단계",
        reason: {
          restored: "이미 복원됨",
          conflict: "로컬 충돌",
          missingBackup: "백업 없음",
          invalid: "Journal 무효",
          blocked: "차단됨"
        },
        status: {
          restorable: "복원 가능",
          restored: "복원됨",
          blocked: "차단됨",
          missing_backup: "백업 없음",
          invalid: "무효"
        }
      },
      group: {
        cwd: "cwd",
        parent: "부모",
        agent: "에이전트",
        none: "전체"
      }
    },
    relations: {
      emptyTitle: "관계 없음",
      emptyDetail: "Codex spawn edge 또는 프로세스 관계가 색인되면 여기에 표시됩니다.",
      filteredEmptyTitle: "일치하는 관계 없음",
      filteredEmptyDetail: "관계 종류, 신뢰도 또는 검색어를 조정하세요.",
      subtitle_one: "{{count}}개의 세션/프로세스 그래프 edge",
      subtitle_other: "{{count}}개의 세션/프로세스 그래프 edge",
      filter: {
        kind: "종류",
        confidence: "신뢰도",
        spawnStatus: "spawn",
        all: "전체",
        open: "open",
        closed: "closed",
        unknown: "알 수 없음",
        search: "세션, 경로, 증거 필터"
      }
    },
    doctor: {
      emptyTitle: "Doctor가 아직 실행되지 않음",
      emptyDetail: "새로 고침하여 로컬 환경 검사를 실행하세요.",
      subtitle_one: "{{count}}개의 환경 검사",
      subtitle_other: "{{count}}개의 환경 검사",
      fix: {
        nativeSqlite:
          "복구는 AgentScope 패키지의 SQLite 네이티브 모듈을 다시 빌드합니다. Codex 데이터 손상이 아니라 앱 런타임 문제입니다.",
        nativeCascade:
          "이 SQLite 경고는 native.better_sqlite3 때문에 차단되었습니다. Codex 데이터를 수정하기 전에 네이티브 모듈을 먼저 복구하세요.",
        rebuild:
          "복구는 고정된 패키지 재빌드 경로를 실행하고 변경된 디렉터리와 파일을 보고합니다.",
        revealPath: "증거 경로 표시: {{path}}",
        manual: "등록된 자동 복구가 없습니다. 증거 경로를 확인하고 데이터는 읽기 전용으로 유지하세요."
      }
    },
    loading: {
      title: "로컬 Agent 상태 읽는 중",
      detail: "Win32_Process, Codex SQLite/JSONL, Claude 세션 파일을 확인하고 있습니다.",
      errorTitle: "Agent 상태 로드 실패",
      errorDetail: "{{message}}. 새로 고침해 다시 시도하세요. 새 스냅샷이 로드될 때까지 AgentScope는 데이터를 읽기 전용으로 유지합니다."
    }
  },
  settings: {
    ...enUS.settings,
    title: "설정",
    subtitle: "읽기 전용 Windows 추적 구성",
    sections: {
      general: "일반",
      appearance: "모양",
      indexing: "색인",
      runtime: "런타임",
      codexControl: "Codex 제어",
      diagnostics: "진단",
      workspace: "작업 영역",
      typography: "글꼴",
      codex: "Codex",
      claude: "Claude",
      runtimeCapture: "런타임 캡처",
      confidence: "신뢰도"
    },
    language: {
      label: "언어",
      detail: "AgentScope UI 텍스트를 즉시 변경합니다.",
      system: "시스템",
      enUS: "English",
      zhCN: "中文",
      jaJP: "日本語",
      koKR: "한국어"
    },
    controlMode: {
      label: "제어 모드",
      detail: "안전 모드는 백업된 세션 제어를 허용합니다. 읽기 전용은 백업, 삭제, 가져오기, 수리를 차단합니다.",
      safe: "안전",
      readOnly: "읽기 전용",
      readOnlyBlocked: "현재 제어 모드는 읽기 전용입니다."
    },
    defaultView: { label: "기본 보기", detail: "AgentScope가 열릴 때 사용할 시작 보기입니다." },
    inspector: {
      label: "검사기",
      detail: "오른쪽 레일에서 주 보기를 전환해도 런타임 증거를 계속 표시합니다.",
      right: "오른쪽",
      hidden: "숨김"
    },
    searchScope: {
      label: "검색 범위",
      detail: "SQLite 식별 필드와 로컬 Codex/Claude JSONL 안전 메타데이터를 검색합니다. transcript 본문이나 hidden/internal 필드는 검색하지 않습니다."
    },
    searchPreview: {
      label: "SQLite preview 검색",
      detail: "Codex SQLite preview 텍스트를 매칭에 포함합니다. 결과에는 preview 본문을 표시하지 않습니다."
    },
    searchLimit: { label: "검색 결과 제한", detail: "명령줄 검색이 반환하는 최대 결과 수입니다." },
    notifications: {
      label: "알림 유지 시간",
      detail: "작업 알림이 자동으로 닫히기 전까지 표시되는 시간입니다."
    },
    searchHistory: {
      label: "검색 기록",
      detail: "최근 검색어를 이 PC에 저장합니다. 민감한 transcript를 다룰 때는 꺼 두세요.",
      clearLabel: "검색 기록 지우기",
      clearDetail_one: "{{count}}개의 검색어가 저장되어 있습니다.",
      clearDetail_other: "{{count}}개의 검색어가 저장되어 있습니다."
    },
    suggestions: {
      label: "문맥 추천",
      detail: "현재 페이지, 선택한 프로세스/세션, cwd, 모델, 도구, 진단에서 검색 추천을 표시합니다."
    },
    transcriptPreview: {
      label: "Transcript hit 미리보기",
      detail: "검색 결과를 선택하면 짧은 발췌와 줄 번호만 표시합니다."
    },
    suggestion: {
      theme: "테마",
      language: "언어",
      motion: "모션",
      indexing: "색인",
      runtime: "런타임"
    },
    resetUi: {
      label: "UI 설정 초기화",
      detail: "테마, 밀도, 모션, 검사기, 글꼴 크기, 언어, 검색 제한을 복원합니다."
    },
    clearCache: {
      label: "앱 캐시 지우기",
      detail: "AgentScope 앱 데이터 아래 Electron 렌더러 캐시를 지웁니다."
    },
    codexControl: {
      ...enUS.settings.codexControl,
      title: "Codex 설정 표면",
      detail:
        "허용 목록에 있는 사용자 소유 Codex 파일만 편집합니다. auth, credentials, logs, history 본문, plugin cache, memory 본문은 계속 차단됩니다.",
      surfaces: "Codex 제어 표면",
      loading: "Codex 제어 표면 로드 중...",
      editable: "편집 가능",
      readOnly: "읽기 전용",
      noChanges: "저장할 Codex 제어 변경이 없습니다.",
      dirty: "저장되지 않은 Codex 제어 변경",
      clean: "대기 중인 Codex 제어 변경 없음",
      emptyTab: "이 탭에서 구조화된 컨트롤을 찾지 못했습니다.",
      changedKeys: "변경된 키",
      savedWithJournal: "저장됨. Journal: {{path}}",
      highRiskTitle: "고위험 Codex 설정",
      highRiskConfirm:
        "이 고위험 Codex 설정을 저장할까요?\n\n{{keys}}\n\n{{warnings}}\n\nAgentScope는 먼저 백업과 journal을 작성합니다.",
      confirmSave: "그래도 저장",
      readOnlyDetail:
        "이 표면은 증거로만 표시됩니다. 상태, 캐시, 공급자 관리 항목 또는 본문 포함 항목이므로 AgentScope는 수정하지 않습니다.",
      emptyTitle: "선택된 표면 없음",
      emptyDetail: "Codex 설정 표면을 선택해 증거를 확인하거나 백업되는 문서를 편집하세요.",
      save: "저장",
      controlSaved: "Codex 제어 저장됨",
      saved: "저장됨. 이전 파일이 없어서 백업은 필요하지 않았습니다.",
      savedWithBackup: "저장됨. 백업: {{path}}",
      backupBeforeSave: "저장 전 sha256을 확인하고 먼저 ~/.agentscope 아래에 백업을 작성합니다.",
      redacted: "민감한 키 이름은 마스킹되었습니다. 다시 로드하거나 위치를 표시한 뒤 AgentScope 밖에서 편집하세요.",
      exists: "있음",
      bytes: "바이트",
      updated: "업데이트",
      modeTitle: "Codex 모드 기본값",
      modeDetail: "문서화된 config.toml 키만 작성합니다. Plan 모드는 기본 모델을 상속하고 reasoning effort만 덮어쓸 수 있습니다.",
      model: "모델",
      reasoning: "추론",
      inheritDefault: "기본값 상속",
      unset: "설정 안 됨",
      planModelNote: "별도 Plan 모델 키는 문서화되어 있지 않습니다. AgentScope는 상속된 기본 모델만 표시합니다.",
      reviewReasoningNote: "Review reasoning은 기본 reasoning 설정을 상속합니다.",
      modeEvidence: "증거 출처: OpenAI Codex manual의 설정 키 설명 및 로컬 config.toml 최상위 할당.",
      mode: {
        default: "Default 모드",
        plan: "Plan 모드",
        review: "Review"
      },
      source: {
        config: "설정",
        inherits_default: "상속",
        unset: "설정 안 됨"
      },
      tabs: {
        overview: "개요",
        models: "모델",
        safety: "안전",
        runtime: "런타임",
        mcp: "MCP",
        skills: "Skills",
        storage: "저장소",
        advanced: "고급",
        files: "파일"
      },
      risk: {
        low: "낮음",
        medium: "중간",
        high: "높음",
        blocked: "차단됨"
      },
      status: {
        ok: "OK",
        warn: "주의",
        blocked: "차단됨"
      },
      auth: {
        present: "보호된 auth 있음",
        missing: "파일 auth 없음"
      },
      overview: {
        codexHome: "공식 CODEX_HOME 루트입니다. AgentScope는 메타데이터만 인벤토리합니다.",
        sqliteHome: "config/env 해석 후 SQLite 상태 루트입니다."
      },
      items: {
        model: {
          label: "기본 모델",
          detail: "CLI, 앱, profile 또는 project 설정이 덮어쓰지 않을 때 쓰는 Codex 최상위 모델입니다."
        },
        review_model: {
          label: "Review 모델",
          detail: "Codex review 워크플로용 선택적 모델 override입니다."
        },
        model_reasoning_effort: {
          label: "기본 추론 강도",
          detail: "Default 모드의 reasoning effort입니다."
        },
        plan_mode_reasoning_effort: {
          label: "Plan 추론 강도",
          detail: "Plan 모드 reasoning override입니다. 모델은 여전히 기본 모델을 상속합니다."
        },
        approval_policy: {
          label: "승인 정책",
          detail: "고위험 작업 전에 Codex가 언제 확인을 요청할지 제어합니다."
        },
        approvals_reviewer: {
          label: "승인 검토자",
          detail: "대상 승인 프롬프트를 사용자 또는 자동 검토로 보냅니다."
        },
        sandbox_mode: {
          label: "샌드박스 모드",
          detail: "shell 작업의 로컬 파일 시스템 및 네트워크 격리를 제어합니다."
        },
        web_search: {
          label: "웹 검색",
          detail: "Codex 웹 검색 동작을 cached, live, disabled로 제어합니다."
        },
        hide_agent_reasoning: {
          label: "reasoning 숨기기",
          detail: "표시 정책만 제어합니다. AgentScope는 hidden vendor reasoning을 읽지 않습니다."
        },
        show_raw_agent_reasoning: {
          label: "raw reasoning 표시",
          detail: "고위험 표시 설정입니다. 이 값과 관계없이 AgentScope는 hidden vendor reasoning을 표시하지 않습니다."
        },
        service_tier: {
          label: "서비스 tier",
          detail: "계정/모델이 지원할 때 선택하는 OpenAI service tier입니다."
        },
        windows_sandbox: {
          label: "Windows 샌드박스",
          detail: "Windows 전용 샌드박스 구현 선호 설정입니다."
        },
        features_multi_agent: {
          label: "Multi-agent 기능",
          detail: "현재 Codex build에 multi-agent/subagent 지원이 있을 때 쓰는 feature flag입니다."
        },
        memories_generate_memories: {
          label: "기억 생성",
          detail: "Codex가 memory record를 생성할지 제어합니다. AgentScope는 memory 본문을 읽지 않습니다."
        },
        memories_use_memories: {
          label: "기억 사용",
          detail: "Codex가 저장된 memory를 주입할지 제어합니다. AgentScope는 memory 본문을 표시하지 않습니다."
        }
      },
      surfaceText: {
        config_global: {
          label: "config.toml",
          detail: "CLI, IDE, desktop이 공유하는 Codex 사용자 설정입니다. 안전 편집은 위 구조화 컨트롤을 사용합니다."
        },
        agents_global: {
          label: "AGENTS.md",
          detail: "개인 Codex 지시문입니다. Codex Desktop personalization이 여기에 씁니다."
        },
        mcp_summary: {
          label: "MCP 서버",
          detail: "config.toml의 MCP 서버 테이블입니다. 변경하려면 설정 문서를 편집합니다."
        },
        archive_summary: {
          label: "보관된 threads",
          detail: "보관 thread 수만 표시합니다. AgentScope는 여기서 보관 대화 본문을 표시하지 않습니다."
        },
        memory_summary: {
          label: "기억",
          detail: "memory database 존재만 표시합니다. AgentScope는 memory content를 읽거나 편집하지 않습니다."
        },
        database_state: {
          label: "state_5.sqlite",
          detail: "Codex state database schema와 행 수 summary만 표시합니다. transcript 본문은 읽지 않습니다."
        },
        database_goals: {
          label: "goals_1.sqlite",
          detail: "Codex goals database schema와 행 수 summary만 표시합니다."
        },
        database_memories: {
          label: "memories_1.sqlite",
          detail: "Codex memories database schema와 행 수 summary만 표시합니다. memory content는 읽지 않습니다."
        },
        database_logs: {
          label: "logs_2.sqlite",
          detail: "Codex logs database schema와 행 수 summary만 표시합니다. log body text는 복원하거나 표시하지 않습니다."
        },
        database_dev: {
          label: "sqlite/codex-dev.db",
          detail: "Codex Desktop automation database schema와 행 수 summary만 표시합니다."
        },
        browser_state: {
          label: "Browser 통합",
          detail: "browser profile/cache 존재만 표시합니다. AgentScope는 browsing data를 읽지 않습니다."
        },
        browser_output: {
          label: "Browser automation 출력",
          detail: "Playwright console/page artifacts를 확장자별로 세기만 합니다. page snapshots나 console 본문은 읽지 않습니다."
        },
        computer_use_state: {
          label: "Computer Use 통합",
          detail: "Computer Use local state 존재만 표시합니다. AgentScope는 desktop control을 실행하지 않습니다."
        },
        mcp_node_runtime: {
          label: "MCP Node 런타임",
          detail: "설치된 MCP Node 런타임 메타데이터입니다. package scripts 실행이나 source bodies 검사는 하지 않습니다."
        },
        node_repl_runtime: {
          label: "Node REPL 런타임",
          detail: "Node REPL 런타임 존재와 항목 수만 표시합니다. active exec bodies는 읽지 않습니다."
        },
        tmp_arg0: {
          label: "Codex 인수 임시 파일",
          detail: "temporary command argument folders만 셉니다. 생성된 command files는 열지 않습니다."
        },
        vendor_imports_cache: {
          label: "Vendor imports 캐시",
          detail: "vendor import cache 존재만 표시합니다. cached marketplace bodies는 읽지 않습니다."
        },
        pets_state: {
          label: "Pets 상태",
          detail: "Codex Desktop local state 존재만 표시합니다."
        },
        plugins_summary: {
          label: "플러그인",
          detail: "installed plugin cache와 config summary입니다. AgentScope는 plugin cache bytes를 직접 편집하지 않습니다."
        },
        rules: {
          label: "규칙 파일",
          detail: "사용자 config layer의 Codex command approval rules입니다."
        },
        skill: {
          label: "사용자 Skill",
          detail: "사용자 Skill 작성 표면입니다. AgentScope는 SKILL.md만 편집하고 먼저 백업합니다."
        },
        skillReadOnly: {
          label: "읽기 전용 Skill",
          detail: "번들/시스템 Skill 표면입니다. AgentScope는 읽기 전용으로 유지합니다."
        }
      },
      warning: {
        authMetadataOnly:
          "auth.json에는 자격 증명 자료가 포함됩니다. AgentScope는 메타데이터만 표시하며 token 필드를 열거나 편집하거나 표시하지 않습니다.",
        rawConfigBlocked: "고위험 키가 구조화된 확인을 우회하지 못하도록 raw config 편집을 차단합니다.",
        sensitiveKeysBlocked: "민감한 키 이름이 감지되었습니다. raw config 편집을 차단합니다.",
        systemSkillsReadOnly: "시스템 또는 플러그인 제공 Skills는 읽기 전용입니다.",
        pluginWorkflowOnly: "install/remove에는 Codex plugin 워크플로를 사용하세요. AgentScope는 증거만 표시합니다.",
        sensitiveConfigBlocked: "민감한 config 키가 감지되었습니다. raw 편집을 차단합니다.",
        highRiskConfirm: "고위험 설정입니다. 실행하려면 명시적 확인이 필요합니다.",
        archivedCountUnreadable: "state_5.sqlite에서 보관된 thread 수를 읽지 못했습니다.",
        sqliteMetadataUnreadable: "이 SQLite 데이터베이스를 메타데이터용 읽기 전용으로 열지 못했습니다."
      },
      mcpTitle: "config.toml의 MCP 서버",
      noMcp: "현재 config.toml에서 MCP 서버 테이블을 찾지 못했습니다.",
      kind: {
        config: "설정",
        agents: "지시문",
        rules: "규칙",
        skill: "Skill",
        plugin: "플러그인",
        mcp: "MCP",
        browser: "브라우저",
        computer_use: "Computer Use",
        database: "데이터베이스",
        runtime: "런타임",
        cache: "캐시",
        memory: "기억",
        archive: "보관"
      }
    },
    theme: {
      label: "테마",
      graphite: "Graphite",
      blueprint: "Blue",
      contrast: "Contrast",
      midnight: "Midnight",
      detail: {
        graphite: "차가운 상태 강조색을 가진 중립 graphite metal 테마입니다.",
        blueprint: "짙은 파란색 운영 작업 영역입니다.",
        contrast: "최대 대비의 검은색 인터페이스입니다.",
        midnight: "절제된 패널을 가진 거의 검은색 집중 테마입니다."
      }
    },
    density: {
      label: "밀도",
      detail: "프로세스 및 세션 목록의 행 간격을 조정합니다.",
      compact: "컴팩트",
      comfortable: "보통",
      spacious: "넓게"
    },
    accent: { label: "강조색", detail: "선택 레일, 버튼, 상태 포커스 색상을 변경합니다." },
    motion: {
      label: "모션",
      detail: "전환, 행 진입, hover lift, 로딩 애니메이션을 제어합니다.",
      full: "전체",
      reduced: "줄임",
      off: "끄기"
    },
    resetAppearance: {
      label: "모양 초기화",
      detail: "테마, 밀도, 모션, 강조색, 글꼴 preset, 글꼴 family, 줄 높이를 복원합니다."
    },
    uiScale: {
      label: "UI 배율",
      detail: "전체 인터페이스 글꼴 크기를 변경합니다.",
      small: "작게",
      normal: "보통",
      large: "크게"
    },
    fontMode: {
      label: "글꼴 모드",
      detail: "통합 글꼴, 언어별 fallback, 또는 언어별 사용자 지정을 선택합니다.",
      language: "언어별",
      unified: "통합",
      custom: "사용자 지정"
    },
    fontPreset: {
      label: "글꼴 프리셋",
      detail: "Windows, Claude 스타일, 일본어 교과서체, 고밀도 trace용 글꼴 스택을 적용합니다.",
      windows: "Windows",
      language: "언어별",
      claude: "Claude",
      japaneseTextbook: "교과서",
      dense: "고밀도",
      custom: "사용자 지정"
    },
    lineHeight: {
      label: "줄 높이",
      detail: "혼합 언어 텍스트와 증거 행의 세로 간격을 조정합니다.",
      compact: "촘촘",
      normal: "보통",
      spacious: "넓게"
    },
    fonts: {
      unified: "통합 UI 글꼴",
      unifiedDetail: "통합 모드에서 사용합니다. PingFang, Inter, Anthropic Sans 등도 직접 입력할 수 있습니다.",
      latin: "영문 / 라틴 글꼴",
      latinDetail: "영문 메뉴, 라벨, 숫자의 기본 글꼴입니다.",
      chinese: "중국어 글꼴",
      chineseDetail: "중국어 라벨과 transcript 텍스트의 fallback입니다.",
      japanese: "일본어 글꼴",
      japaneseDetail: "Yu Gothic UI는 촘촘하고, UD Digi Kyokasho는 교과서식 읽기 느낌입니다.",
      korean: "한국어 글꼴",
      koreanDetail: "Malgun Gothic은 Windows 기본 한국어 UI 기준입니다.",
      detected: "설치된 글꼴",
      detectedDetail_one: "현재 Windows 프로필에서 {{count}}개의 글꼴 패밀리를 감지했습니다.",
      detectedDetail_other: "현재 Windows 프로필에서 {{count}}개의 글꼴 패밀리를 감지했습니다."
    },
    fontPreview: {
      title: "글꼴 미리보기"
    },
    codeFont: { label: "코드 글꼴", detail: "코드, 경로, 명령줄, ID, 표 형태의 증거에 사용합니다." },
    links: {
      githubLabel: "GitHub 열기",
      githubDetail: "issues, actions, releases를 위한 공개 저장소입니다.",
      readmeLabel: "README 열기",
      readmeDetail: "프로젝트 개요, CLI 명령, 데스크톱 메모입니다."
    },
    indexing: {
      sqliteLabel: "SQLite 색인",
      codexHomeLabel: "Codex 홈 열기",
      rolloutLabel: "Rollout JSONL",
      spawnEdgesLabel: "spawn edge",
      spawnEdgesDetail: "thread_spawn_edges 부모/자식 그래프입니다.",
      pidSessionsLabel: "PID 세션",
      claudeHomeLabel: "Claude 홈 열기",
      transcriptsLabel: "전사"
    },
    runtime: {
      win32Label: "Win32_Process",
      win32Detail_one: "{{count}}개의 관련 행; PID, PPID, 경로, 명령줄, 생성 시간.",
      win32Detail_other: "{{count}}개의 관련 행; PID, PPID, 경로, 명령줄, 생성 시간.",
      windowTitlesLabel: "창 제목",
      windowTitlesDetail: "Windows가 노출하는 경우 Get-Process MainWindowTitle을 사용합니다.",
      candidatesLabel: "세션 후보",
      candidatesDetail_one:
        "{{count}}개의 색인된 세션을 PID, cwd, transcript, 제목, 시간 증거로 점수화합니다.",
      candidatesDetail_other:
        "{{count}}개의 색인된 세션을 PID, cwd, transcript, 제목, 시간 증거로 점수화합니다."
    },
    confidence: {
      exactDetail: "Claude PID 파일 또는 향후 hook 매핑입니다.",
      heuristicDetail: "강한 경로/제목 증거를 사용하며 점수와 이유를 표시합니다.",
      unknownDetail: "약한 시간 전용 후보는 표시할 수 있지만 일치로 처리하지 않습니다."
    },
    diagnostics: {
      warningsLabel: "Doctor 경고",
      warningsDetail_one:
        "Codex, Claude, SQLite, JSONL, 프로세스 스캔 전체에서 {{count}}개의 경고.",
      warningsDetail_other:
        "Codex, Claude, SQLite, JSONL, 프로세스 스캔 전체에서 {{count}}개의 경고."
    }
  },
  inspector: {
    nothingTitle: "선택된 항목 없음",
    nothingDetail: "증거를 검사할 프로세스 또는 세션을 선택하세요.",
    likelySessions: "가능성 높은 세션",
    processRole: "프로세스 역할",
    runtime: "런타임",
    identity: "식별",
    transcript: "전사",
    modelRuntime: "모델 및 실행 설정",
    codexSpawn: "Codex spawn",
    processRuntime: "프로세스 런타임",
    mcpIdentity: "MCP 식별",
    control: "안전 제어",
    indexMetadata: "색인 메타데이터",
    relations: "관계",
    relationDetail: "관계 상세",
    endpoints: "엔드포인트",
    evidence: "증거",
    searchHit: "검색 hit",
    safeSearchHitDetail: "안전 검색은 이벤트 메타데이터, 매칭 필드, 파일 위치만 표시하며 transcript 본문은 표시하지 않습니다.",
    activity: "활동",
    topEvents: "주요 이벤트",
    topTools: "주요 도구",
    models: "모델",
    tokens: "토큰",
    noEvidence: "첨부된 증거가 없습니다.",
    noActivity: "transcript 활동 요약이 없습니다.",
    noCandidate:
      "후보 세션이 없습니다. PID, cwd, transcript, 제목 또는 시간 증거가 없으면 AgentScope는 추측하지 않습니다.",
    noCwdEvidence: "cwd 증거 없음",
    safeControlDetail:
      "읽기 전용 모드입니다. 열기, 위치 표시, resume 명령 생성, 내보내기만 허용합니다. kill/archive는 명시적 force 제어가 생기기 전까지 비활성화됩니다.",
    mcpSource: {
      user_config: "사용자 설정",
      plugin_config: "플러그인 설정",
      process_only: "프로세스 증거"
    },
    launchAction: {
      resume: "resume",
      fork: "fork"
    },
    actions: {
      openTranscript: "Transcript 열기",
      revealTranscript: "Transcript 위치 표시",
      backupSession: "세션 백업",
      backupSessions: "{{count}}개 세션 백업",
      deleteSession: "세션 삭제",
      deleteSessions: "{{count}}개 세션 삭제",
      resumeSession: "Agent에서 resume",
      forkSession: "Agent에서 fork",
      resumeInAgent: "{{agent}}에서 resume",
      forkInAgent: "{{agent}}에서 fork",
      importSession: "세션 가져오기",
      writeDeletePlan: "삭제 계획 작성",
      planImport: "가져오기 계획"
    },
    fields: {
      pid: "PID",
      ppid: "PPID",
      title: "제목",
      started: "시작",
      executable: "실행 파일",
      command: "명령",
      role: "역할",
      rootPid: "루트 PID",
      parentAgentPid: "Agent 부모",
      roleEvidence: "역할 증거",
      session: "세션",
      source: "소스",
      target: "대상",
      confidence: "신뢰도",
      status: "상태",
      updated: "업데이트",
      name: "이름",
      path: "경로",
      index: "색인",
      parent: "부모",
      children: "자식",
      lines: "줄 수",
      bytes: "크기",
      firstEvent: "첫 이벤트",
      lastEvent: "마지막 이벤트",
      cliVersion: "CLI",
      gitBranch: "Git",
      permission: "권한",
      mode: "모드",
      compacted: "압축",
      sidechain: "사이드체인",
      parseErrors: "파싱 오류",
      inputTokens: "입력",
      outputTokens: "출력",
      cacheRead: "캐시 읽기",
      cacheWrite: "캐시 쓰기",
      modelProvider: "제공자",
      model: "모델",
      reasoningEffort: "추론 강도",
      tokensUsed: "사용 토큰",
      approvalMode: "승인",
      sandboxPolicy: "샌드박스",
      entrypoint: "진입점",
      spawnStatus: "spawn",
      depth: "깊이",
      agentNickname: "Agent",
      agentRole: "역할",
      agentPath: "Agent 경로",
      sourceKind: "소스 종류",
      runtimeSessionId: "런타임 ID",
      runtimeWorkingDir: "런타임 cwd",
      server: "서버",
      serverKind: "종류",
      transport: "전송",
      configSource: "설정 출처",
      configTable: "설정 테이블",
      commandSummary: "명령 요약",
      resumeCommand: "재개 명령",
      safeControl: "경계"
    }
  },
  toast: {
    snapshotCanceled: "내보내기가 취소됨",
    snapshotExported: "스냅샷을 내보냈습니다",
    externalOpened: "외부 링크 열림",
    externalBlocked: "외부 링크 차단됨",
    openFailed: "열기 실패: {{message}}",
    pathOpened: "경로 열림",
    pathRevealed: "경로 위치 열림",
    sessionBackedUp: "세션 백업 작성됨",
    sessionsBackedUp: "{{count}}/{{total}}개 세션 백업됨",
    noSessionsBackedUp: "백업된 세션 없음",
    sessionDeleted: "세션이 격리 폴더로 이동됨",
    sessionsDeleted: "{{count}}/{{total}}개 세션이 격리 폴더로 이동됨",
    noSessionsDeleted: "삭제된 세션 없음",
    sessionImported: "백업에서 세션을 가져왔습니다",
    sessionRestored: "격리에서 세션을 복원했습니다",
    sessionLaunchStarted: "{{agent}} {{action}} 시작됨",
    sessionLaunchUnsupported: "이 세션은 Codex/Claude 컨트롤로 시작할 수 없습니다",
    deletePlanWritten: "삭제 계획 작성됨: {{path}}",
    deletePlanUnavailable: "삭제 계획을 작성할 수 없습니다",
    deletePlanPartial: "{{count}}/{{total}}개 세션의 삭제 계획 작성됨",
    importPlanWritten: "가져오기 계획 작성됨: {{path}}",
    importPlanCanceled: "가져오기 계획 취소됨",
    settingsReset: "설정 초기화됨",
    cacheCleared: "앱 캐시 지움",
    diagnosticRepairComplete: "진단 수리 완료",
    diagnosticAdvice: "진단 수리 조언",
    operationFailed: "작업 실패: {{message}}"
  },
  confirm: {
    deleteSessionTitle: "세션 삭제",
    deleteSessionsTitle: "{{count}}개 세션 삭제",
    deleteSession:
      "이 세션을 삭제할까요?\n\n{{title}}\n\nBackup:\n{{backupDir}}\n\nQuarantine:\n{{quarantineDir}}\n\nJournal:\n{{journalPath}}\n\nAgentScope는 먼저 백업하고 journal을 쓴 뒤 검증된 로컬 참조를 제거하고 세션 파일을 격리 폴더로 이동합니다. 정확한 PID와 신뢰도 높은 Codex 프로세스 후보는 차단됩니다.",
    deleteSessions:
      "선택한 {{count}}개 세션을 삭제할까요?\n\n첫 Backup:\n{{backupDir}}\n\n첫 Quarantine:\n{{quarantineDir}}\n\n첫 Journal:\n{{journalPath}}\n\nAgentScope는 각 세션을 별도 백업, 격리 디렉터리, journal로 처리합니다. core blocker는 세션별로 적용됩니다."
  }
} satisfies ResourceTree;
