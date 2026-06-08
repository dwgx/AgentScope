import { enUS } from "./en-US.js";
import type { ResourceTree } from "../types.js";

export const koKR = {
  ...enUS,
  app: { tagline: "제어 + 추적 레이어" },
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
      helperNoCandidate: "Helper process; no direct session id or transcript evidence.",
      weakEvidence: "약한 증거",
      candidate: "후보",
      score: "증거 {{score}}",
      allProcesses: "All processes",
      taskRoot: "Task root PID {{pid}}",
      noParentPid: "No parent PID",
      noCwdCandidate: "No cwd candidate",
      groupCount_one: "{{count}}개 프로세스",
      groupCount_other: "{{count}}개 프로세스",
      sort: {
        label: "정렬",
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
        agent: "Agent",
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
        codex_engine: "Codex engine",
        codex_node_repl: "Subagent runtime",
        codex_app_server: "Codex app-server",
        codex_mcp_tool: "MCP tool",
        claude_cli: "Claude CLI",
        claude_daemon: "Claude daemon",
        agent_helper: "Agent helper",
        unknown: "Unknown role"
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
      context: {
        selectedCount: "{{count}}개 세션 선택됨"
      },
      allSessions: "All sessions",
      rootNoParent: "Root / no parent",
      parentGroup: "Parent: {{title}}",
      noCwd: "No cwd",
      recycle: {
        title: "휴지통",
        subtitle: "{{count}}개 격리, {{restorable}}개 복원 가능",
        empty: "격리된 세션이 없습니다.",
        restore: "복원",
        restoreBlocked: "이 격리 항목은 복원할 수 없습니다.",
        parent: "부모 {{id}}",
        evidence: "{{files}} files / {{db}} DB steps",
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
        agent: "Agent",
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
        all: "전체",
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
      detail: "Win32_Process, Codex SQLite/JSONL, Claude 세션 파일을 확인하고 있습니다."
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
      detail: "SQLite 제목/미리보기와 로컬 Codex 및 Claude JSONL transcript를 검색합니다."
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
      spawnEdgesLabel: "Spawn edges",
      spawnEdgesDetail: "thread_spawn_edges 부모/자식 그래프입니다.",
      pidSessionsLabel: "PID 세션",
      claudeHomeLabel: "Claude 홈 열기",
      transcriptsLabel: "Transcripts"
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
    transcript: "Transcript",
    modelRuntime: "모델 및 실행 설정",
    control: "안전 제어",
    indexMetadata: "색인 메타데이터",
    relations: "관계",
    relationDetail: "관계 상세",
    endpoints: "엔드포인트",
    evidence: "증거",
    searchHit: "검색 hit",
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
      rootPid: "Root PID",
      parentAgentPid: "Agent parent",
      roleEvidence: "Role evidence",
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
