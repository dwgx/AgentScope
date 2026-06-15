# MCP Tool Identity Notes - 2026-06-15

AgentScope now gives Codex MCP helper processes a human-readable identity without reading MCP protocol payloads, tool traffic, browser state, or vendor reasoning.

## What Is Identified

- Known MCP entrypoints such as Playwright, Chrome DevTools, IDA Pro, Model Context Protocol packages, Codex MCP nodes, and custom `mcp-server-*` packages.
- Config-backed server names from safe Codex TOML tables:
  - `[mcp_servers.<name>]`
  - `[plugins.<plugin>.mcp_servers.<name>]`
- Live process command markers from Windows process metadata.
- Child helper processes in the same MCP process tree, marked as inherited identity instead of exact command evidence.

## What Is Not Read

- MCP stdio or HTTP request and response bodies.
- Browser pages, console logs, screenshots, or Playwright traces.
- SQLite body rows, hidden vendor reasoning, credentials, auth tokens, or environment secrets.
- Arbitrary files referenced by MCP server arguments.

## Evidence Model

The process tree keeps identity confidence evidence-driven:

- `process.role.mcp.*` identifies why a process is considered an MCP tool.
- `process.mcp.config` means a live process matched a safe Codex MCP config entry.
- `process.mcp.marker` means the identity came from the process command line only.
- `process.mcp.parent_tree` means a helper child inherited identity from an MCP parent.

Config-derived command summaries drop sensitive-looking arguments instead of displaying or indexing them. If no config table can be matched, the UI still shows the best process-derived label with lower confidence.

## UI Surface

- Process rows can display `MCP Tool / <server name>` instead of a generic `MCP Tool`.
- The inspector shows MCP server name, kind, transport, config source, config table, command summary, and confidence when available.
- Codex Control MCP cards show a short command summary to help users recognize what each configured server starts.

## Verification

The implementation is covered by targeted tests for:

- Config-backed Playwright MCP identity.
- Parent-tree identity inheritance for helper child processes.
- Custom Model Context Protocol package names with sensitive argument redaction.
- MCP process classification without promoting arbitrary Node processes.

