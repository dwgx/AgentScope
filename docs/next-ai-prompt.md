# Prompt For The Next AI

Copy this prompt into the next AI session when handing off AgentScope.

```text
你现在接手 D:\Project\AgentScope。

请使用中文和我对话。不要泛泛而谈，不要假装确定。任何结论都说明来源：官方文档、本机文件实测、当前代码，或明确说是推断。

先读这些文件，不要急着改代码：

1. AGENTS.md
2. docs/handoff-next-ai.md
3. docs/project-state-and-next-agent-workflow-2026-06-13.md
4. docs/research-local-agent-stores.md
5. docs/repository-hygiene.md
6. README.md
7. packages/core/src/sessionOps.ts
8. packages/core/src/codexControl.ts
9. packages/core/src/scope.ts
10. apps/desktop/src/main/main.ts
11. apps/desktop/src/renderer/src/App.tsx

上一轮已验证实现提交：

9d774dc Harden release hygiene and operation journals

该实现提交的 GitHub CI 已通过：

https://github.com/dwgx/AgentScope/actions/runs/27447351810

项目定位：

AgentScope 是 Windows-only 本地 AI coding agent control + trace layer，用 TypeScript/Electron/React 写。它不是聊天 UI，也不是 Kanban。核心是解析、关联、搜索、备份、删除、导入、恢复、控制本机 Codex / Claude Code 会话与安全配置，并且每个判断都必须有 evidence 和 confidence。

当前重点安全边界：

- 不要删除 credentials/auth/settings/plugins/skills/rules/full history。
- 不要解密或展示供应商隐藏 reasoning。
- 不要把 heuristic 当 exact。
- 删除会话必须先备份，再 quarantine，并写 journal。
- Codex SQLite 写入必须事务化、busy_timeout、表/列存在检查、可回滚或有恢复证据。
- 导入必须校验 AgentScope manifest、hash、路径穿越、目标冲突、DB/table/payload allowlist。
- Electron main 不允许打开 transcript/history/log 正文、exe/cmd/ps1/sqlite/db/native module/auth/config/plugins/skills/rules；只能 reveal 或拒绝。
- Codex Control 的 auth.json 只显示 metadata，不读 token 内容，不返回 hash。
- JSONL 搜索只允许 safe metadata fields，不返回 raw excerpt。

当前应先做：

1. 运行：
   npm run audit:repo
   npm run typecheck
   npm test
   npm run i18n:check

2. 查看：
   git status --short
   git diff --stat
   git log --oneline -8

3. 如果继续 UI 或 Electron main 改动，最后还要跑 packaged/dev smoke，并尽量用真实窗口截图复核新 UI 状态。

4. 发布/prebuild 交接跑：
   npm run check:release

工作方式：

- 使用 apply_patch 做手工文件编辑。
- 不要回滚用户未要求回滚的改动。
- 不要提交 node_modules、dist、out、tmp、真实会话数据、凭据。
- 如果要联网查 Codex/Claude 行为，优先官方 OpenAI/Anthropic 文档，并说明来源。
- 如果用户要求 subagent，可以开；线程满了就本地继续并记录你验证了什么。
- 修改核心逻辑必须补测试。
- 提交前检查 git status、git diff --stat、git diff --check。
- 打包产物在 apps/desktop/out/，默认 ignored；用 npm run audit:artifacts 检查，用 npm run clean:artifacts dry-run 清理。

当前大目标：

把 AgentScope 做成真正可信的 Windows 本地 AI agent 控制与追踪层：

- 会话删除/备份/导入/恢复可信、可审计、可回滚或有明确恢复证据。
- Codex/Claude 进程和会话关联可信，heuristic 永远不要伪装成 exact。
- Codex Control 可以安全地管理配置、规则、技能、MCP、运行时状态，但不泄露 auth、memory、logs、history 正文。
- UI 必须像严肃桌面控制台，紧凑、对齐、清晰、可操作，不要营销页、不要花哨装饰。

优先未完成事项：

- Electron IPC sender/origin 鉴权：所有 high-risk IPC handler 应检查 sender ownership 和 app/dev URL。
- backup/quarantine import/restore/open/reveal 入口要做 realpath/lstat，拒绝 Windows junction/symlink/reparse point 指向外部。
- JSONL metadata value redaction：safe field 名不等于 safe value，source/thread_source/agent_* 等要过滤 token-like/secret-like/过长正文。
- 继续增强 Electron/Playwright smoke harness，覆盖 Settings、Codex Control、Sessions recycle、context menu delete、notification、Relations、resume/fork、process tree collapse。
- 增强 restore journal，记录每个文件和 DB rollback 步骤。
- 移除或隔离 sessionOps.ts 中旧 Claude patch helper，除非实现完整 reversible restore。
- 设计 child-session delete 模式：block/include/detach，不能默认静默 detach。
- 继续改进 Codex subagent / process role 识别，但必须保留 evidence/confidence。
- 扩展 Codex Control 时只做结构化 allowlist，任何高风险 key 需要确认、backup、journal。
```
