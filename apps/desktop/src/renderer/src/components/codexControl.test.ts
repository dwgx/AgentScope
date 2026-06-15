import { describe, expect, it } from "vitest";
import type { CodexControlCenterSnapshot, CodexControlSurface } from "@agentscope/shared";
import {
  codexControlDraftFromCenter,
  codexControlMutationsFromDraft,
  codexModeDraftFromSnapshot,
  codexModePatchFromDraft,
  localizedCodexSurfaceDetail,
  localizedCodexSurfaceLabel
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
});

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
