import { describe, expect, it } from "vitest";
import type { CodexConfigWorkbenchItem, CodexControlCenterSnapshot, CodexControlSurface, CodexMcpServerSummary } from "@agentscope/shared";
import {
  codexCombinedDraftFromSnapshots,
  codexControlDraftFromCenter,
  codexControlMutationsFromDraft,
  codexWorkbenchMutationsFromDraft,
  codexModeDraftFromSnapshot,
  codexModePatchFromDraft,
  formatTemplateValue,
  localizedCodexSurfaceDetail,
  localizedCodexSurfaceLabel,
  mcpAddDraftPatch,
  mcpSortedItems,
  mcpWorkbenchGroups
} from "./codexControl.js";

describe("Codex Control renderer helpers", () => {
  it("builds structured mutations only for editable changed config items", () => {
    const snapshot = centerSnapshot();
    const draft = codexControlDraftFromCenter(snapshot);

    expect(codexControlMutationsFromDraft(draft, snapshot)).toEqual([]);

    expect(
      codexControlMutationsFromDraft(
        {
          ...draft,
          "config.model": "gpt-5.5",
          "config.reasoning_effort": "",
          "config.readonly": "changed"
        },
        snapshot
      )
    ).toEqual([
      { itemId: "config.model", keyPath: "model", value: "gpt-5.5" },
      { itemId: "config.reasoning_effort", keyPath: "reasoning_effort", value: null }
    ]);
  });

  it("keeps legacy current values when merging workbench draft entries", () => {
    const center = centerSnapshot();
    const workbench = {
      codexHome: center.codexHome,
      configPath: center.configPath,
      configSha256: center.configSha256,
      items: [
        mcpItem("mcp_servers.debugger-router.command", "command", "node"),
        {
          ...mcpItem("model", "model", "gpt-5.4-mini"),
          id: "config.model",
          group: "current" as const,
          table: undefined,
          keyPath: "model"
        }
      ],
      mcpServers: [],
      unknownEntries: [],
      templateList: { storagePath: "", templates: [], warnings: [], evidence: [] },
      warnings: [],
      evidence: []
    };

    const draft = codexCombinedDraftFromSnapshots(center, workbench);

    expect(draft["config.model"]).toBe("gpt-5.4-mini");
    expect(draft["config.reasoning_effort"]).toBe("medium");
    expect(draft["config.mcp_servers.debugger-router.command"]).toBeUndefined();
    expect(codexControlMutationsFromDraft(draft, center)).toEqual([]);
  });

  it("stages a new MCP server command and enabled flag together", () => {
    expect(mcpAddDraftPatch("debugger-router", "node")).toEqual({
      "config.mcp_servers.debugger-router.command": "node",
      "config.mcp_servers.debugger-router.enabled": true
    });
  });

  it("builds workbench mutations for editable unknown advanced items", () => {
    const snapshot = {
      codexHome: String.raw`C:\AgentScopeTest\.codex`,
      configPath: String.raw`C:\AgentScopeTest\.codex\config.toml`,
      configSha256: "abc",
      items: [
        {
          id: "config.unknown.reason",
          group: "unknown" as const,
          keyPath: "reason",
          label: "reason",
          detail: "Unverified advanced key",
          valueKind: "string" as const,
          currentValue: "current",
          enabled: true,
          editable: true,
          risk: "medium" as const,
          source: "current_code" as const,
          supportLevel: "unverified" as const,
          warnings: ["unverified advanced key"],
          evidence: []
        }
      ],
      mcpServers: [],
      unknownEntries: [],
      templateList: { storagePath: "", templates: [], warnings: [], evidence: [] },
      warnings: [],
      evidence: []
    };

    expect(codexWorkbenchMutationsFromDraft({ "config.unknown.reason": "next" }, snapshot)).toEqual([
      {
        itemId: "config.unknown.reason",
        keyPath: "reason",
        value: "next",
        comment: "current -> next"
      }
    ]);
  });

  it("keeps mode patch output narrow", () => {
    const snapshot = {
      configPath: String.raw`C:\AgentScopeTest\.codex\config.toml`,
      sha256: "abc",
      warnings: [],
      recommendedModels: ["gpt-5.5"],
      reasoningEffortValues: ["low", "medium"],
      planReasoningEffortValues: ["none", "low"],
      modes: {
        default: { source: "config", model: "gpt-5.4-mini", reasoningEffort: "medium", evidence: [] },
        plan: { source: "config", model: "gpt-5.4-mini", reasoningEffort: "low", evidence: [] },
        review: { source: "default", model: "gpt-5.4-mini", reasoningEffort: "medium", evidence: [] }
      }
    } as const;
    const draft = codexModeDraftFromSnapshot(snapshot);

    expect(codexModePatchFromDraft(draft, snapshot)).toEqual({});
    expect(codexModePatchFromDraft({ ...draft, planReasoningEffort: "" }, snapshot)).toEqual({
      planReasoningEffort: null
    });
    expect(codexModePatchFromDraft({ ...draft, reviewModel: "gpt-5.5" }, snapshot)).toEqual({
      reviewModel: "gpt-5.5"
    });
  });

  it("keeps real Skill names while localizing reusable Skill details", () => {
    const surface: CodexControlSurface = {
      id: "skill:review-helper",
      kind: "skill",
      label: "Evidence Review Helper",
      detail: "User skill authoring surface. AgentScope edits only SKILL.md and backs it up first.",
      exists: true,
      editable: true,
      status: "ok",
      warnings: [],
      evidence: []
    };
    const translate = (key: string) => `translated:${key}`;

    expect(localizedCodexSurfaceLabel(surface, translate)).toBe("Evidence Review Helper");
    expect(localizedCodexSurfaceDetail(surface, translate)).toBe("translated:settings.codexControl.surfaceText.skill.detail");
  });

  it("formats Codex template values without leaking undefined as a literal", () => {
    expect(formatTemplateValue(undefined)).toBe("unset");
    expect(formatTemplateValue(null)).toBe("remove");
    expect(formatTemplateValue(true)).toBe("true");
    expect(formatTemplateValue(false)).toBe("false");
    expect(formatTemplateValue("danger-full-access")).toBe("danger-full-access");
  });

  it("groups MCP workbench fields by server and orders child controls", () => {
    const servers: CodexMcpServerSummary[] = [
      {
        name: "debugger-router",
        source: "user_config",
        enabled: false,
        transport: "stdio",
        table: "mcp_servers.debugger-router",
        command: "node",
        args: ["router.mjs"],
        commandSummary: "node router.mjs",
        evidence: []
      }
    ];
    const items: CodexConfigWorkbenchItem[] = [
      mcpItem("mcp_servers.debugger-router.command", "command", "node"),
      mcpItem("mcp_servers.debugger-router.enabled_tools", "enabled_tools", ["open"]),
      mcpItem("mcp_servers.debugger-router.enabled", "enabled", false),
      mcpItem("mcp_servers.debugger-router.default_tools_approval_mode", "default_tools_approval_mode", "prompt"),
      mcpItem("mcp_servers.debugger-router.required", "required", true)
    ];

    const groups = mcpWorkbenchGroups(items, servers);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.server.name).toBe("debugger-router");
    expect(groups[0]?.items.map((item) => item.keyPath)).toEqual(items.map((item) => item.keyPath));
    expect(mcpSortedItems(groups[0]!.items).map((item) => item.keyPath.split(".").at(-1))).toEqual([
      "required",
      "default_tools_approval_mode",
      "enabled_tools",
      "command",
      "enabled"
    ]);
  });
});

function mcpItem(
  keyPath: string,
  field: string,
  currentValue: string | boolean | string[]
): CodexConfigWorkbenchItem {
  return {
    id: `config.${keyPath}`,
    group: "mcp",
    keyPath,
    table: "mcp_servers.debugger-router",
    label: `debugger-router / ${field}`,
    detail: field,
    valueKind: Array.isArray(currentValue) ? "stringArray" : typeof currentValue === "boolean" ? "boolean" : "string",
    currentValue,
    enabled: true,
    editable: true,
    risk: field === "command" ? "high" : "medium",
    source: "official_docs",
    warnings: [],
    evidence: []
  };
}

function centerSnapshot(): CodexControlCenterSnapshot {
  return {
    codexHome: String.raw`C:\AgentScopeTest\.codex`,
    sqliteHome: String.raw`C:\AgentScopeTest\.codex`,
    configPath: String.raw`C:\AgentScopeTest\.codex\config.toml`,
    configSha256: "abc",
    warnings: [],
    items: [
      {
        id: "config.model",
        section: "models",
        label: "model",
        detail: "Model",
        value: "gpt-5.4-mini",
        valueKind: "string",
        editable: true,
        risk: "medium",
        status: "ok",
        keyPath: "model",
        warnings: []
      },
      {
        id: "config.reasoning_effort",
        section: "models",
        label: "reasoning",
        detail: "Reasoning",
        value: "medium",
        valueKind: "string",
        editable: true,
        risk: "medium",
        status: "ok",
        keyPath: "reasoning_effort",
        warnings: []
      },
      {
        id: "config.readonly",
        section: "safety",
        label: "readonly",
        detail: "Readonly",
        value: "original",
        valueKind: "string",
        editable: false,
        risk: "high",
        status: "blocked",
        keyPath: "dangerous",
        warnings: ["High-risk setting; execution requires explicit confirmation"]
      }
    ]
  };
}
