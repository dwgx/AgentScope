import { enUS } from "./en-US.js";
import type { ResourceTree } from "../types.js";

export const koKR = {
  ...enUS,
  app: { tagline: "제어 + 추적 레이어" },
  common: {
    ...enUS.common,
    agent: { codex: "codex", claude: "claude", unknown: "unknown" },
    action: { open: "열기", refresh: "새로 고침", reset: "초기화", show: "표시", hide: "숨기기" },
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
    confidence: { exact: "정확", indexed: "색인", heuristic: "추정", unknown: "알 수 없음" },
    date: { started: "시작 {{date}}", updated: "업데이트 {{date}}" },
    path: {
      noCommandLine: "명령줄 없음",
      noPathEvidence: "경로 증거 없음",
      noPath: "경로 없음",
      loading: "경로 로드 중"
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
    searchPlaceholder: "세션, transcript, 명령줄 검색",
    proc: "Proc",
    matched: "일치",
    warn: "경고",
    refreshTitle: "새로 고침"
  },
  views: {
    processes: {
      emptyTitle: "관련 프로세스 없음",
      emptyDetail: "Codex, Claude, node_repl, app-server 또는 daemon 프로세스를 찾지 못했습니다.",
      subtitle_one: "{{count}}개의 관련 Win32 행",
      subtitle_other: "{{count}}개의 관련 Win32 행",
      noCandidate: "아직 세션 후보가 없습니다",
      weakEvidence: "약한 증거",
      candidate: "후보",
      score: "점수 {{score}}"
    },
    sessions: {
      emptyTitle: "색인된 세션 없음",
      emptyDetail: "Doctor를 실행해 Codex 및 Claude 로컬 경로를 확인하세요.",
      subtitle_one: "{{count}}개의 Claude + Codex 레코드",
      subtitle_other: "{{count}}개의 Claude + Codex 레코드"
    },
    relations: {
      emptyTitle: "관계 없음",
      emptyDetail: "Codex spawn edge 또는 프로세스 관계가 색인되면 여기에 표시됩니다.",
      subtitle_one: "{{count}}개의 세션/프로세스 그래프 edge",
      subtitle_other: "{{count}}개의 세션/프로세스 그래프 edge"
    },
    doctor: {
      emptyTitle: "Doctor가 아직 실행되지 않음",
      emptyDetail: "새로 고침하여 로컬 환경 검사를 실행하세요.",
      subtitle_one: "{{count}}개의 환경 검사",
      subtitle_other: "{{count}}개의 환경 검사"
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
      detail: "읽기 전용입니다. 명시적 force 옵션이 생기기 전까지 제어 동작은 제안만 생성합니다."
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
    resetUi: {
      label: "UI 설정 초기화",
      detail: "테마, 밀도, 모션, 검사기, 글꼴 크기, 언어, 검색 제한을 복원합니다."
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
    uiScale: {
      label: "UI 배율",
      detail: "전체 인터페이스 글꼴 크기를 변경합니다.",
      small: "작게",
      normal: "보통",
      large: "크게"
    },
    codeFont: { label: "코드 글꼴", detail: "Cascadia Code" },
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
    runtime: "런타임",
    identity: "식별",
    transcript: "Transcript",
    indexMetadata: "색인 메타데이터",
    relations: "관계",
    evidence: "증거",
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
    fields: {
      pid: "PID",
      ppid: "PPID",
      title: "제목",
      started: "시작",
      executable: "실행 파일",
      command: "명령",
      session: "세션",
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
      cacheWrite: "캐시 쓰기"
    }
  },
  toast: {
    snapshotCanceled: "내보내기가 취소됨",
    snapshotExported: "스냅샷을 내보냈습니다: {{path}}",
    externalOpened: "{{url}} 열림",
    externalBlocked: "외부 URL 차단됨: {{url}}",
    openFailed: "열기 실패: {{message}}",
    pathOpened: "{{path}} 열림",
    pathRevealed: "{{path}} 위치 열림"
  }
} satisfies ResourceTree;
