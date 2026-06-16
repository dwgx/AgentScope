# AgentScope 当前项目状态与下一 Agent 工作流

Last updated: 2026-06-16.

## 证据来源

本文件只汇总当前可核验事实。

- 原始目标来源：`docs/next-ai-prompt.md`、`AGENTS.md`、`docs/handoff-next-ai.md`、`README.md`。
- 当前实现来源：`packages/core/src/sessionOps.ts`、`packages/core/src/codexControl.ts`、`packages/core/src/scope.ts`、`packages/core/src/search.ts`、`apps/desktop/src/main/main.ts`、`apps/desktop/src/renderer/src/App.tsx`、`apps/desktop/src/renderer/src/styles.css`。
- 本机验证来源：本机命令输出和 GitHub Actions run `27447351810`。
- 记忆来源：本机 Codex memory 中 AgentScope handoff/hygiene 记录。记忆只作为路由提示，当前结论以本仓库文件和本轮验证为准。

## 原始目标

AgentScope 的目标不是做聊天 UI，也不是 Kanban。它是 Windows-only 本地 AI coding agent control + trace layer。

原始目标可以归纳成四句话：

1. 解析本机 Codex 和 Claude Code 的进程、会话、transcript、SQLite、JSONL、PID/session map、路径编码和关系证据。
2. 将进程和会话关联起来，但每个判断都必须带 evidence 和 confidence；heuristic 永远不能伪装成 exact。
3. 对本机会话执行可信的 backup、delete、import、restore，并保证 destructive action 有备份、quarantine、journal、blocker 和恢复证据。
4. 安全管理 Codex 配置、规则、技能、MCP、运行时状态，但不泄露 auth、credentials、hidden reasoning、memory/log/history 正文。

这些目标在 `docs/next-ai-prompt.md` 的“项目定位”“当前重点安全边界”“当前大目标”中明写；`AGENTS.md` 和 `docs/handoff-next-ai.md` 把它们转换成工程规则。

## 当前已经做到什么

### 1. 本地 trace 层

当前代码已经能枚举和解释 Windows 本机 AI agent 相关进程。

- `packages/core/src/processes.ts` 负责 Win32 process capture。
- `packages/core/src/scope.ts` 负责统一 snapshot、process/session candidate scoring、relations、confidence。
- `README.md` 说明 AgentScope 会枚举 Codex、Claude、node、node_repl、app-server、daemon-like processes，并显示 evidence。

重要边界：Codex process-to-thread 仍然不总是 exact。当前做法是用 PID、cwd、transcript path、session id、window title、start/update time 等证据打分；time-only candidate 只能是 weak/unknown，不得升级成 exact。

### 2. Codex / Claude 会话索引

当前已支持：

- Codex `state_5.sqlite`、rollout JSONL、archived/session metadata、thread spawn edges、subagent/process role evidence。
- Versioned Codex SQLite stores such as `state_*.sqlite`, `logs_*.sqlite`,
  `goals_*.sqlite`, and `memories_*.sqlite`, with `CODEX_SQLITE_HOME` /
  `sqlite_home` resolution.
- Codex rollout JSONL roots under `sessions`, `rollouts`,
  `archived_sessions`, and `archived_rollouts`.
- Claude `.claude/sessions` PID map、`.claude/projects` transcript、jobs/daemon/session sidecar 的本地观测解析。
- 统一 Sessions、Relations、Processes、Doctor、Codex Control、Settings 视图。

证据来源：`README.md` MVP Features、`docs/research-local-agent-stores.md` AgentScope Current Parsing、`packages/core/src/codex.ts`、`packages/core/src/claude.ts`、`packages/core/src/scope.ts`。

### 3. 可信 session operations

当前 `packages/core/src/sessionOps.ts` 已有以下能力：

- `planSessionDelete()`、`backupSession()`、`deleteSession()`、`planSessionImport()`、`importSessionBackup()`、`listQuarantinedSessions()`、`planSessionRestore()`、`restoreQuarantinedSession()`。
- delete 前先 backup，再 quarantine，再 journal。
- active exact PID 和 high-confidence active Codex heuristic process candidate 默认阻断。
- parent session 有 child sessions 时默认阻断。
- Claude global history/state/daemon roster 当前是 inspect-only，不做不可逆 patch。
- Codex SQLite delete 会先备份数据库/WAL/SHM，再做事务化 row-level mutation，并有 rollback evidence。
- import 会验证 AgentScope manifest、hash、path traversal、目标冲突、DB/table/payload allowlist。

2026-06-15 `9d774dc` 批次新增的关键点：

- delete 成功时 journal 现在写 `operation/deleteSession/succeeded`。
- 如果文件 quarantine 中途失败，已移动文件会反向搬回原路径，并写 `rollback_move` journal。
- 相关测试在 `packages/core/src/sessionOps.test.ts` 覆盖了成功 closure 和 partial file rollback。

仍需谨慎：restore 不是跨文件和多 SQLite DB 的真正原子事务。当前有 preflight、rollback attempt 和 journal，但 rollback 本身可能失败，所以 journal 是恢复证据，不是数学意义的全局事务保证。

### 4. Codex Control 安全控制面

当前 `packages/core/src/codexControl.ts` 已支持：

- Codex control center snapshot。
- safe surface inventory：config modes、MCP summary、rules、user skills、archives、memories、browser/computer-use state、runtime/cache、protected auth metadata。
- `auth.json` metadata-only：不读 token 内容，不返回 hash。
- raw `config.toml` 文档编辑禁用，只能走 structured allowlist。
- structured mutation 有 allowlisted key path、sha256 conflict check、risk classification、backup、journal。
- structured mutation 写入 `config.toml` 后会读回校验 changed keys。读回不匹配或 TOML 解析失败时不报告成功。
- Codex 参数模板和当前状态 workbench 区分 official、known local 和 unverified advanced config。
- 未知 scalar / string-array config 项可以作为 unverified advanced settings 编辑；复杂值、敏感键、重复/不安全 TOML 仍阻止或只读。
- 内置 provider id 不能通过 `model_providers.openai.*` 等方式改写。内置 OpenAI base URL 使用顶层 `openai_base_url`。
- UI 明确提示 `config.toml` 改动通常只对新启动的 Codex session 生效，不能承诺正在运行的 Codex 热加载。
- AGENTS/rules/user skill 文档允许编辑，但 sensitive-looking 内容会 redacted 并拒绝保存。

2026-06-15 `9d774dc` 批次新增的关键点：

- structured mutation、mode config save、allowlisted document save 都改成两阶段 journal：先 `started`，写入成功后 `succeeded`，失败则 `failed`。
- `auth.json` 如果是 symlink，只读 link metadata，不 follow target。
- `windows.sandbox = "elevated"` 纳入 high-risk mutation，需要显式确认。
- 对应测试在 `packages/core/src/codexControl.test.ts`。

2026-06-16 后续批次新增的关键点：

- `executeCodexControlMutation()` 成功条件包含 read-back verification。
- `CodexControlSaveResult` 和 journal 记录 `verification`、`effectiveScope`、
  `effectiveWarnings`。
- `model_providers.OpenAI.*` 不再作为官方固定项展示；现有自定义 provider
  表会按 unknown/unverified 规则处理。
- 新增 `motion@12.40.0`，Codex Control 应用弹窗使用 Motion 的 enter/exit、
  stagger、layout 和 reduced-motion 支持。
- 传统 Codex Control 保存和模板/workbench 应用都走同一个中心运行弹窗。

### 5. 搜索与隐私边界

当前 `packages/core/src/search.ts` 和 `packages/core/src/jsonl.ts` 的边界是：

- JSONL search 不返回 raw transcript excerpt。
- 只允许 safe metadata fields。
- deny reasoning/thinking/internal/hidden/content/text/result/output/delta/tool_result/body-like 字段。
- SQLite preview 通过明确选项控制。

剩余风险：metadata 字段名是 allowlist，但 metadata 值本身还需要更强的 token-like / long body / secret-like 过滤。这个应排在后续高价值项。

### 6. Electron main 安全边界

当前 `apps/desktop/src/main/main.ts` 已做：

- renderer 通过 preload narrow API 调 main。
- `shell:openPath` 只允许 AgentScope-owned text evidence：delete/restore journals、backup manifests、redacted exports。
- transcript/history/vendor logs/exe/scripts/SQLite/DB/native modules/auth/config/plugins/skills/rules 不能直接 open，只能 reveal 或拒绝。
- snapshot export 默认 redacted。
- destructive operation 走 main/core，不在 renderer 直接碰文件。

剩余高价值风险：IPC handler 还缺统一 sender/origin ownership 检查；backup/quarantine import/restore 入口还需要 realpath/lstat 抵抗 Windows junction/symlink。

### 7. 桌面 UI 状态

当前 UI 已经是严肃桌面控制台方向，不是营销页。

实现视图：

- Processes
- Sessions with recycle restore
- Relations
- Doctor
- Codex Control
- Settings
- Global `Ctrl+F` command/search palette

2026-06-15 `9d774dc` 批次新增的 UI 点：

- Processes task tree 支持节点级折叠，适合多 Codex/Claude/MCP/tool helper 进程场景。
- Sessions recycle panel 不再硬切前 6 条，改为完整列表滚动。
- Codex Control 参数应用使用中心运行弹窗：显示结构化 patch 行、风险颜色、atomic write、读回校验、成功/失败状态。成功短暂停留后自动关闭，失败保留。
- Unknown advanced config 在“未知项”页签中分成可编辑 scalar 和只读复杂/敏感项。

smoke 证据：

- `npm run smoke:desktop:packaged` 通过。
- `npm run smoke:desktop:portable` 通过。
- smoke 截图在 ignored `apps/desktop/out/smoke/`，不提交。

## AgentScope 的独特点

这里的“独特”不是市场宣传，而是当前实现相对普通文件管理器、聊天 UI、任务看板的实际差异。

1. Evidence-first association
   进程和会话不是“看起来像”就直接绑定。所有关联都要显示 evidence 和 confidence，heuristic 不得冒充 exact。

2. Local-only trace/control
   核心对象是本机 Codex/Claude 的进程、SQLite、JSONL、session map、quarantine、backup 和 config surface，不依赖云端会话 API。

3. Destructive action 可审计
   delete/import/restore 不是普通删除文件，而是有 plan、backup、quarantine、journal、DB backup、row-level allowlist、rollback evidence。

4. Codex Control 是结构化安全控制面
   不直接暴露 auth/config/log/history 正文；高风险 key 需要确认；raw config 编辑默认禁用；rules/skills 只走 allowlist。

5. Electron open/reveal 边界明确
   不是“路径能打开就打开”。transcript/history/log/db/auth/config/plugins/skills/rules 等高风险正文默认不 open。

6. workflow 可复刻
   `check:release` 和 CI 把 audit、typecheck、tests、synthetic smoke、package:pre、artifact verification、packaged/portable smoke 串成一条发布链路。

## 当前准确工作流

### 接手后先读

按顺序读：

1. `AGENTS.md`
2. `docs/handoff-next-ai.md`
3. 本文件
4. `docs/research-local-agent-stores.md`
5. `docs/repository-hygiene.md`
6. `README.md`
7. `packages/core/src/sessionOps.ts`
8. `packages/core/src/codexControl.ts`
9. `packages/core/src/scope.ts`
10. `apps/desktop/src/main/main.ts`
11. `apps/desktop/src/renderer/src/App.tsx`

### 基线检查

先运行：

```powershell
npm run audit:repo
npm run typecheck
npm test
npm run i18n:check
```

再查看：

```powershell
git status --short
git diff --stat
git log --oneline -8
```

如果涉及 Codex Control UI 或 config 写入，还要至少跑：

```powershell
npm run lint
npm --workspace @agentscope/desktop run build
npm run smoke:desktop:packaged
```

### 修改规则

- 手工编辑用 `apply_patch`。
- 不回滚用户未要求回滚的改动。
- 核心逻辑改动必须补测试。
- UI/Electron main 改动后要跑 packaged 或 dev desktop smoke，并检查截图。
- Codex config 写入改动必须补 core 测试，证明 atomic write/read-back
  verification、敏感键阻止、未知高级项边界、reserved provider id 规则。
- 动效改动必须尊重 Settings 的 `motion = full | reduced | off`，错误态不能自动消失。
- 不要提交 `node_modules`、`dist`、`out`、`tmp`、真实 `.codex/.claude/.agentscope`、真实 session data、凭据。
- 任何结论都标来源：官方文档、本机文件实测、当前代码、或者明确说是推断。

### 发布/打包 workflow

完整 release/prebuild 本地链路：

```powershell
npm run check:release
```

它等价于：

```powershell
npm run audit:repo
npm run typecheck
npm run i18n:check
npm test
npm run smoke:agentscope
npm run package:pre
npm run verify:desktop-artifacts -- --strict-head
npm run smoke:desktop:packaged
npm run smoke:desktop:portable
```

完全复刻 GitHub CI 时使用下面顺序；它比 `check:release` 多一个显式 `npm run build` 和 `npm run audit:artifacts`：

```powershell
npm ci
npm run audit:repo
npm run typecheck
npm run i18n:check
npm test
npm run smoke:agentscope
npm run build
$env:AGENTSCOPE_PRE_VERSION="0.1.0-pre"; npm run package:pre
npm run verify:desktop-artifacts -- --strict-head
npm run audit:artifacts
npm run smoke:desktop:packaged
npm run smoke:desktop:portable
```

CI 上传 artifact 名为 `AgentScope-win-pre`。

上一轮已验证实现快照的 GitHub CI 证据：

```text
run: 27447351810
commit: 9d774dc4441fc8b152ceb3ba81e850082b1de125
conclusion: success
url: https://github.com/dwgx/AgentScope/actions/runs/27447351810
```

当前 prebuild 产物名：

```text
apps/desktop/out/AgentScope-0.1.0-pre-Setup-x64.exe
apps/desktop/out/AgentScope-0.1.0-pre-Portable-x64.exe
apps/desktop/out/AgentScope-0.1.0-pre-win-x64.zip
apps/desktop/out/AgentScope-0.1.0-pre-Setup-x64.exe.blockmap
apps/desktop/out/agentscope-prebuild.json
apps/desktop/out/win-unpacked/AgentScope.exe
```

这些产物在 ignored `apps/desktop/out/`，不进入 git。

注意：每次新提交后，local `apps/desktop/out/agentscope-prebuild.json` 都可能落后于 HEAD，因为它记录的是运行 `npm run package:pre` 时的 commit。严格验证当前 HEAD 的本地产物前，必须重新跑 `npm run package:pre` 或完整 release workflow。GitHub Actions 对应 commit 的 artifact 才是该 commit 的 release 证据。

### artifact 清理边界

查看：

```powershell
npm run audit:artifacts
```

dry-run 清理：

```powershell
npm run clean:artifacts
```

实际清理：

```powershell
npm run clean:artifacts -- --apply
```

默认只清 repo 内 `apps/desktop/out/ci-pre` 和 `builder-debug.yml`。`smoke` 和当前 release 文件需要显式 `-- --smoke` 或 `-- --releasables`。

绝对不要把这些当 repo 垃圾删：

- `%USERPROFILE%\.codex`
- `%USERPROFILE%\.claude`
- `%USERPROFILE%\.agentscope\backups`
- `%USERPROFILE%\.agentscope\quarantine`
- 用户真实 session/transcript/log/history/auth/config/plugins/skills/rules

## 下一阶段高价值任务

按优先级：

1. process/session command line redaction
   当前原始 `commandLine` 仍会显示在 Processes/Inspector，并可能进入 launcher evidence。保留 raw value 给 core matching 使用，但 renderer、export、notification、evidence 应展示 redacted summary，剥离 `--token value`、`--token=value`、API key、bearer、cookie/session/password 等敏感参数。

2. session import/restore target hardening
   import/restore 文件落地要使用 exclusive create/copy，避免 preflight 后目标出现而被覆盖；core 侧目标父目录也要做 lstat/realpath/reparse containment，拒绝 Windows symlink/junction 指向外部路径。

3. Electron open/reveal realpath hardening
   `shell:openPath` 和 `shell:revealPath` 已有 sender 校验、allowlist 和 open/reveal 角色限制，但本地路径 allowlist 仍应从字符串前缀升级为 realpath/reparse-safe containment。

4. Codex metadata value redaction
   `source/thread_source/agent_*` 等 metadata 字段值要做 token-like、secret-like、过长正文过滤。字段名安全不等于字段值安全。

5. 旧 Claude patch helper 隔离
   旧 patch helper 仍在 `sessionOps.ts` 中。除非实现完整 reversible restore，否则应移除或隔离，保持 execution path inspect-only。

6. smoke 补洞
   继续补真正可点击 smoke：session context delete confirm/cancel/execute、read-only session UI 阻断、notification body click 不关闭、process node collapse、Settings 保存阻断。

7. process/subagent/MCP role 识别
   继续改进 Codex subagent、MCP、tool kernel、app-server 识别，但每一步都必须保留 evidence/confidence，不要为了 UI 好看升级 confidence。

## 低价值或不要优先做

- 不要因为发现轻微 UI 间距问题就打断安全边界工作。
- 不要把 App.tsx 大拆分当作当前最高优先级；除非它阻挡 smoke 或安全修复。
- 不要把 heuristic 变成 exact 来让数字更好看。
- 不要做聊天 UI、Kanban、营销页。
- 不要打开/展示 transcript/history/log/auth/config/plugins/skills/rules 正文来“证明功能”。
- 不要默认清理用户真实 Codex/Claude/AgentScope runtime state。

## 已验证实现快照

2026-06-15 代码和打包验证落在这个提交：

```text
9d774dc Harden release hygiene and operation journals
8c23209 Stabilize prebuild packaging names
20ef449 Trace Codex MCP process trees in smoke
```

2026-06-16 后续批次在本机通过 typecheck、i18n、lint、tests、desktop build、package、packaged smoke、repo audit、artifact audit 和 `git diff --check`。如果本文件被提交到新的 HEAD，该 HEAD 是否有 CI/release 产物仍以对应 GitHub Actions run 为准。

本机 ignored 产物仍可能存在：

```text
apps/desktop/out/
apps/desktop/dist/
packages/*/dist/
node_modules/
```

这是正常状态，不提交。需要清理时先 `npm run audit:artifacts`。
