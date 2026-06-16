import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  CodexConfigTemplate,
  CodexConfigTemplateDraft,
  CodexConfigTemplateItem,
  CodexConfigTemplateList,
  CodexConfigTemplatePreview,
  CodexConfigTemplatePreviewRequest,
  CodexConfigUnknownEntry,
  CodexConfigWorkbenchItem,
  CodexConfigWorkbenchSnapshot,
  CodexControlDocument,
  CodexControlEffectiveScope,
  CodexControlCenterItem,
  CodexControlCenterSnapshot,
  CodexControlMutation,
  CodexControlMutationPlan,
  CodexControlMutationRequest,
  CodexControlMutationValue,
  CodexControlRevealResult,
  CodexControlSaveResult,
  CodexControlSnapshot,
  CodexControlSurface,
  CodexControlSurfaceKind,
  CodexControlWriteVerification,
  CodexConfigSupportLevel,
  CodexModeConfigPatch,
  CodexModeConfigSaveResult,
  CodexModeConfigSnapshot,
  CodexModeId,
  CodexModeValue,
  Evidence
} from "@agentscope/shared";
import { agentScopeHome, codexHome, codexSqliteHome, normalizeWindowsPath, userHome } from "./paths.js";
import { openCodexDb, tableColumns } from "./codex.js";
import { emptyConfigInventory, inspectToml, type ConfigInventory } from "./mcpIdentity.js";

const maxEditableBytes = 256 * 1024;
const textEncoding: BufferEncoding = "utf8";
const recommendedModels = ["gpt-5.5", "gpt-5.4-mini", "gpt-5.3-codex-spark"];
const modelProviderValues = ["openai", "amazon-bedrock", "ollama", "lmstudio"];
const reasoningEffortValues = ["minimal", "low", "medium", "high", "xhigh"];
const planReasoningEffortValues = ["none", ...reasoningEffortValues];
const reasoningSummaryValues = ["auto", "concise", "detailed", "none"];
const modelVerbosityValues = ["low", "medium", "high"];
const sandboxModeValues = ["read-only", "workspace-write", "danger-full-access"];
const approvalPolicyValues = ["untrusted", "on-request", "never"];
const approvalsReviewerValues = ["user", "auto_review"];
const webSearchValues = ["cached", "live", "disabled"];
const serviceTierValues = ["default", "fast", "flex"];
const windowsSandboxValues = ["elevated", "unelevated"];
const mcpApprovalModeValues = ["auto", "prompt", "approve"];
const maxCustomTemplateCount = 24;
const maxCustomTemplateItems = 32;
const templateStorageFileName = "codex-config-templates.json";
const currentConfigTemplateId = "current.config";
const codexConfigEffectiveScope: CodexControlEffectiveScope = "new_codex_sessions";
const codexConfigNewSessionWarning =
  "Codex reads config.toml when a new Codex session starts; already-running Codex processes may keep their previous settings.";
const reservedBuiltinProviderIds = new Set(["openai", "ollama", "lmstudio"]);
type EditableConfigDescriptor = {
  keyPath: string;
  section: CodexControlCenterItem["section"];
  label: string;
  detail: string;
  valueKind: CodexControlCenterItem["valueKind"] | "stringArray";
  options?: string[] | undefined;
  allowCustom?: boolean | undefined;
  risk: CodexControlCenterItem["risk"];
  source: CodexControlCenterItem["source"];
  supportLevel?: CodexConfigSupportLevel | undefined;
  effectiveNote?: string | undefined;
};
const editableConfigItems = new Map<
  string,
  EditableConfigDescriptor
>([
  [
    "config.model",
    {
      keyPath: "model",
      section: "models",
      label: "Default model",
      detail: "Top-level Codex model used when CLI/app/profile/project settings do not override it.",
      valueKind: "string",
      options: recommendedModels,
      allowCustom: true,
      risk: "medium",
      source: "official_docs"
    }
  ],
  [
    "config.model_reasoning_effort",
    {
      keyPath: "model_reasoning_effort",
      section: "models",
      label: "Default reasoning",
      detail: "Reasoning effort for the default mode.",
      valueKind: "select",
      options: reasoningEffortValues,
      risk: "medium",
      source: "official_docs"
    }
  ],
  [
    "config.plan_mode_reasoning_effort",
    {
      keyPath: "plan_mode_reasoning_effort",
      section: "models",
      label: "Plan reasoning",
      detail: "Plan mode reasoning override; model still inherits the default model.",
      valueKind: "select",
      options: planReasoningEffortValues,
      risk: "medium",
      source: "official_docs"
    }
  ],
  [
    "config.approval_policy",
    {
      keyPath: "approval_policy",
      section: "safety",
      label: "Approval policy",
      detail: "Controls when Codex asks before running higher-risk operations.",
      valueKind: "select",
      options: approvalPolicyValues,
      risk: "high",
      source: "official_docs"
    }
  ],
  [
    "config.approvals_reviewer",
    {
      keyPath: "approvals_reviewer",
      section: "safety",
      label: "Approval reviewer",
      detail: "Routes eligible approval prompts through the user or auto-review.",
      valueKind: "select",
      options: approvalsReviewerValues,
      risk: "medium",
      source: "official_docs"
    }
  ],
  [
    "config.sandbox_mode",
    {
      keyPath: "sandbox_mode",
      section: "safety",
      label: "Sandbox mode",
      detail: "Controls local filesystem/network isolation for shell work.",
      valueKind: "select",
      options: sandboxModeValues,
      risk: "high",
      source: "official_docs"
    }
  ],
  [
    "config.web_search",
    {
      keyPath: "web_search",
      section: "safety",
      label: "Web search",
      detail: "Cached, live, or disabled web search behavior for Codex.",
      valueKind: "select",
      options: webSearchValues,
      risk: "high",
      source: "official_docs"
    }
  ],
  [
    "config.hide_agent_reasoning",
    {
      keyPath: "hide_agent_reasoning",
      section: "safety",
      label: "Hide reasoning",
      detail: "Display policy only; AgentScope still does not read hidden vendor reasoning.",
      valueKind: "boolean",
      risk: "medium",
      source: "official_docs"
    }
  ],
  [
    "config.show_raw_agent_reasoning",
    {
      keyPath: "show_raw_agent_reasoning",
      section: "safety",
      label: "Show raw reasoning",
      detail: "High-risk display setting. AgentScope never displays hidden vendor reasoning regardless of this value.",
      valueKind: "boolean",
      risk: "high",
      source: "official_docs"
    }
  ],
  [
    "config.service_tier",
    {
      keyPath: "service_tier",
      section: "runtime",
      label: "Service tier",
      detail: "Optional OpenAI service tier selection when supported by the account/model.",
      valueKind: "select",
      options: serviceTierValues,
      allowCustom: true,
      risk: "medium",
      source: "official_docs"
    }
  ],
  [
    "config.windows.sandbox",
    {
      keyPath: "windows.sandbox",
      section: "runtime",
      label: "Windows sandbox",
      detail: "Windows-specific sandbox implementation preference.",
      valueKind: "select",
      options: windowsSandboxValues,
      risk: "medium",
      source: "official_docs"
    }
  ],
  [
    "config.features.multi_agent",
    {
      keyPath: "features.multi_agent",
      section: "runtime",
      label: "Multi-agent feature",
      detail: "Feature flag for Codex multi-agent/subagent support when present in this Codex build.",
      valueKind: "boolean",
      risk: "medium",
      source: "current_code"
    }
  ],
  [
    "config.features.goals",
    {
      keyPath: "features.goals",
      section: "runtime",
      label: "Goals feature",
      detail: "Feature flag for Codex Goal mode when supported by this Codex build.",
      valueKind: "boolean",
      risk: "medium",
      source: "official_docs"
    }
  ],
  [
    "config.model_verbosity",
    {
      keyPath: "model_verbosity",
      section: "models",
      label: "Model verbosity",
      detail: "Text verbosity for GPT-5 family models when the provider uses the Responses API.",
      valueKind: "select",
      options: modelVerbosityValues,
      risk: "medium",
      source: "official_docs"
    }
  ],
  [
    "config.review_model",
    {
      keyPath: "review_model",
      section: "models",
      label: "Review model",
      detail: "Optional model override for Codex review workflows.",
      valueKind: "string",
      options: recommendedModels,
      allowCustom: true,
      risk: "medium",
      source: "official_docs"
    }
  ],
  [
    "config.model_provider",
    {
      keyPath: "model_provider",
      section: "models",
      label: "Model provider",
      detail: "Provider id selected from model_providers. Recommended provider ids are suggestions; custom providers are allowed.",
      valueKind: "select",
      options: modelProviderValues,
      allowCustom: true,
      risk: "medium",
      source: "official_docs"
    }
  ],
  [
    "config.model_reasoning_summary",
    {
      keyPath: "model_reasoning_summary",
      section: "models",
      label: "Reasoning summary",
      detail: "Reasoning summary policy for supported Responses API models.",
      valueKind: "select",
      options: reasoningSummaryValues,
      risk: "medium",
      source: "official_docs"
    }
  ],
  [
    "config.model_supports_reasoning_summaries",
    {
      keyPath: "model_supports_reasoning_summaries",
      section: "models",
      label: "Force reasoning summaries",
      detail: "Force-enable or disable reasoning summaries for the current model.",
      valueKind: "boolean",
      risk: "medium",
      source: "official_docs"
    }
  ],
  [
    "config.openai_base_url",
    {
      keyPath: "openai_base_url",
      section: "models",
      label: "OpenAI base URL",
      detail: "Base URL override for the built-in OpenAI provider. Use this instead of overriding the reserved openai provider id.",
      valueKind: "string",
      risk: "high",
      source: "official_docs"
    }
  ],
  [
    "config.project_doc_max_bytes",
    {
      keyPath: "project_doc_max_bytes",
      section: "runtime",
      label: "Project doc max bytes",
      detail: "Maximum bytes from AGENTS.md/project instructions that Codex embeds into first-turn instructions.",
      valueKind: "number",
      risk: "medium",
      source: "official_docs"
    }
  ],
  [
    "config.features.memories",
    {
      keyPath: "features.memories",
      section: "storage",
      label: "Memories feature",
      detail: "Enable Codex Memories globally. AgentScope still does not read memory bodies.",
      valueKind: "boolean",
      risk: "medium",
      source: "official_docs"
    }
  ],
  [
    "config.features.js_repl",
    {
      keyPath: "features.js_repl",
      section: "runtime",
      label: "JS REPL feature",
      detail: "Feature flag for the JavaScript REPL capability when present in this Codex build.",
      valueKind: "boolean",
      risk: "high",
      source: "current_code"
    }
  ],
  [
    "config.memories.generate_memories",
    {
      keyPath: "memories.generate_memories",
      section: "storage",
      label: "Generate memories",
      detail: "Controls whether Codex generates memory records. AgentScope does not read memory bodies.",
      valueKind: "boolean",
      risk: "medium",
      source: "official_docs"
    }
  ],
  [
    "config.memories.use_memories",
    {
      keyPath: "memories.use_memories",
      section: "storage",
      label: "Use memories",
      detail: "Controls whether Codex injects saved memories. AgentScope does not display memory bodies.",
      valueKind: "boolean",
      risk: "medium",
      source: "official_docs"
    }
  ]
]);
const builtinCodexConfigTemplates: CodexConfigTemplate[] = [
  {
    id: "builtin.yolo-full-access",
    origin: "builtin",
    name: "YOLO / Full Access",
    description:
      "Highest-autonomy local Codex workflow: no approvals, no sandbox boundary, elevated Windows sandbox mode, live web search, xhigh reasoning, and multi-agent enabled.",
    risk: "high",
    readonly: true,
    items: [
      templateItem("config.approval_policy", "never", true, "No approval prompts; Codex runs requested operations directly."),
      templateItem("config.sandbox_mode", "danger-full-access", true, "Full filesystem and network access without sandbox isolation."),
      templateItem("config.windows.sandbox", "elevated", true, "Native Windows sandbox mode recommended when elevated setup is available."),
      templateItem("config.web_search", "live", true, "Live web results instead of cached web search."),
      templateItem("config.model_reasoning_effort", "xhigh", true, "Deep default reasoning for implementation work."),
      templateItem("config.plan_mode_reasoning_effort", "xhigh", true, "Deep planning reasoning before implementation."),
      templateItem("config.features.multi_agent", true, true, "Enable Codex multi-agent/subagent workflows when supported.")
    ],
    evidence: templateEvidence("codex.template.builtin.yolo")
  },
  {
    id: "builtin.safe-workspace",
    origin: "builtin",
    name: "Safe Workspace",
    description:
      "Low-friction local automation inside the workspace boundary with interactive approval for higher-risk operations.",
    risk: "medium",
    readonly: true,
    items: [
      templateItem("config.approval_policy", "on-request", true, "Ask when an operation needs elevated trust."),
      templateItem("config.sandbox_mode", "workspace-write", true, "Write inside the workspace while keeping a sandbox boundary."),
      templateItem("config.windows.sandbox", "elevated", true, "Use the native Windows sandbox when available."),
      templateItem("config.web_search", "cached", true, "Use cached web search to reduce live web exposure."),
      templateItem("config.approvals_reviewer", "user", true, "Keep approval decisions with the user.")
    ],
    evidence: templateEvidence("codex.template.builtin.safe_workspace")
  },
  {
    id: "builtin.readonly-audit",
    origin: "builtin",
    name: "Read-only Audit",
    description: "Repository and evidence review preset: read-only sandbox, user approvals, cached web search, and high planning effort.",
    risk: "medium",
    readonly: true,
    items: [
      templateItem("config.approval_policy", "on-request", true, "Keep approval prompts interactive."),
      templateItem("config.sandbox_mode", "read-only", true, "Prevent workspace writes from the default sandbox."),
      templateItem("config.web_search", "cached", true, "Use cached web search while auditing."),
      templateItem("config.model_reasoning_effort", "high", true, "High reasoning for code and evidence review."),
      templateItem("config.plan_mode_reasoning_effort", "xhigh", true, "Extra planning depth for audit plans.")
    ],
    evidence: templateEvidence("codex.template.builtin.readonly_audit")
  },
  {
    id: "builtin.deep-planning",
    origin: "builtin",
    name: "Deep Planning",
    description: "Reasoning-focused preset that avoids permission changes by default.",
    risk: "medium",
    readonly: true,
    items: [
      templateItem("config.model_reasoning_effort", "xhigh", true, "Deep reasoning for implementation turns."),
      templateItem("config.plan_mode_reasoning_effort", "xhigh", true, "Deep reasoning for planning turns."),
      templateItem("config.web_search", "cached", true, "Keep web search on cached mode.")
    ],
    evidence: templateEvidence("codex.template.builtin.deep_planning")
  },
  {
    id: "builtin.live-research",
    origin: "builtin",
    name: "Live Research",
    description: "Current-information preset: live web search with high reasoning, without changing approval or sandbox permissions.",
    risk: "high",
    readonly: true,
    items: [
      templateItem("config.web_search", "live", true, "Fetch the most recent web data when a task needs current facts."),
      templateItem("config.model_reasoning_effort", "high", true, "High reasoning for synthesis."),
      templateItem("config.plan_mode_reasoning_effort", "high", true, "High planning effort for research plans.")
    ],
    evidence: templateEvidence("codex.template.builtin.live_research")
  }
];
const mcpEditableFieldDescriptors = new Map<
  string,
  Omit<EditableConfigDescriptor, "keyPath" | "section" | "source">
>([
  [
    "enabled",
    {
      label: "MCP enabled",
      detail: "Enable or disable this MCP server without deleting its table.",
      valueKind: "boolean",
      risk: "medium"
    }
  ],
  [
    "command",
    {
      label: "MCP command",
      detail: "STDIO MCP executable or launcher command.",
      valueKind: "path",
      risk: "high"
    }
  ],
  [
    "args",
    {
      label: "MCP args",
      detail: "STDIO MCP command arguments. Sensitive token-like values are blocked.",
      valueKind: "stringArray",
      risk: "high"
    }
  ],
  [
    "cwd",
    {
      label: "MCP cwd",
      detail: "Optional working directory for the MCP process.",
      valueKind: "path",
      risk: "medium"
    }
  ],
  [
    "url",
    {
      label: "MCP URL",
      detail: "HTTP MCP endpoint URL.",
      valueKind: "string",
      risk: "high"
    }
  ],
  [
    "bearer_token_env_var",
    {
      label: "Bearer token env var",
      detail: "Environment variable name containing the bearer token; the token value is not stored here.",
      valueKind: "string",
      risk: "medium"
    }
  ],
  [
    "env_vars",
    {
      label: "Forwarded env vars",
      detail: "Environment variable names Codex may forward to the STDIO MCP server.",
      valueKind: "stringArray",
      risk: "medium"
    }
  ],
  [
    "experimental_environment",
    {
      label: "Experimental environment",
      detail: "Optional remote executor environment selector for STDIO MCP.",
      valueKind: "select",
      options: ["remote"],
      risk: "medium"
    }
  ],
  [
    "startup_timeout_sec",
    {
      label: "MCP startup timeout",
      detail: "Seconds Codex waits for the MCP server to start.",
      valueKind: "number",
      risk: "medium"
    }
  ],
  [
    "tool_timeout_sec",
    {
      label: "MCP tool timeout",
      detail: "Seconds Codex allows a tool call to run.",
      valueKind: "number",
      risk: "medium"
    }
  ],
  [
    "required",
    {
      label: "MCP required",
      detail: "Require this MCP server to initialize successfully.",
      valueKind: "boolean",
      risk: "medium"
    }
  ],
  [
    "default_tools_approval_mode",
    {
      label: "MCP approval mode",
      detail: "Default approval behavior for MCP tools.",
      valueKind: "select",
      options: mcpApprovalModeValues,
      risk: "high"
    }
  ],
  [
    "enabled_tools",
    {
      label: "Enabled tools",
      detail: "Optional allowlist of MCP tool names.",
      valueKind: "stringArray",
      risk: "medium"
    }
  ],
  [
    "disabled_tools",
    {
      label: "Disabled tools",
      detail: "Optional denylist of MCP tool names.",
      valueKind: "stringArray",
      risk: "medium"
    }
  ]
]);
const mcpUserConfigEditableFields = new Set(mcpEditableFieldDescriptors.keys());
const mcpPluginPolicyEditableFields = new Set(["enabled", "required", "default_tools_approval_mode", "enabled_tools", "disabled_tools"]);
const safeMcpServerNameRe = /^[A-Za-z0-9_-]{1,80}$/;
const sensitivePathPartRe = /^(auth|credentials?|secrets?|tokens?|keyrings?|keychains?)$/i;
const safeSkillNameRe = /^[a-z0-9][a-z0-9._-]{0,79}$/i;
const safeRuleNameRe = /^[a-z0-9][a-z0-9._-]{0,79}\.rules$/i;
const sensitiveKeyRe =
  /(?:^|[_.-])(?:api[-_]?key|authorization|bearer|credential|credentials|password|refresh[-_]?token|secret|token)(?:$|[_.-])/i;
const sensitiveTokenRe =
  /(?:^|[^a-z0-9])(?:api[-_]?key|authorization|bearer|credential|credentials|password|refresh[-_]?token|secret|token)(?:$|[^a-z0-9])/i;
const vendorTokenShapeRe = /\b(?:sk-[A-Za-z0-9_-]{16,}|github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]+)\b/;
const redactedMutationValue = "[redacted by AgentScope]";

interface ResolvedDocument {
  id: string;
  kind: CodexControlSurfaceKind;
  label: string;
  path: string;
  editable: boolean;
}

interface InternalMutationPlan extends CodexControlMutationPlan {
  rawMutations: CodexControlMutationRequest["mutations"];
}

interface FileSnapshot {
  exists: boolean;
  bytes?: number | undefined;
  updatedAt?: string | undefined;
}

export async function listCodexControlSurfaces(home = userHome()): Promise<CodexControlSnapshot> {
  const root = codexHome(home);
  const sqliteRoot = codexSqliteHome(home);
  const configPath = path.join(root, "config.toml");
  const configText = await readSmallText(configPath);
  const configInventory = configText === undefined ? emptyConfigInventory() : inspectToml(configText, configPath);
  const surfaces: CodexControlSurface[] = [
    await fileSurface({
      id: "config.global",
      kind: "config",
      label: "config.toml",
      filePath: configPath,
      editable: false,
      detail: "Codex user configuration shared by CLI, IDE, and desktop. Use the structured controls above for safe edits.",
      warnings: [
        configInventory.sensitiveLines.length
          ? "Sensitive key names were detected. Raw config editing is blocked."
          : "Raw config editing is blocked so high-risk keys cannot bypass structured confirmation."
      ]
    }),
    await fileSurface({
      id: "agents.global",
      kind: "agents",
      label: "AGENTS.md",
      filePath: path.join(root, "AGENTS.md"),
      editable: true,
      detail: "Personal Codex instructions. Codex Desktop personalization writes here.",
      warnings: []
    }),
    configSummarySurface(root, configInventory),
    await archiveSurface(sqliteRoot),
    await memorySurface(sqliteRoot),
    ...(await codexDatabaseSurfaces(root, sqliteRoot)),
    await directorySurface({
      id: "browser.state",
      kind: "browser",
      label: "Browser integration",
      dirPath: path.join(root, "browser"),
      detail: "Browser profile/cache presence only. AgentScope does not read browsing data.",
      evidenceSource: "codex.control.browser"
    }),
    await directorySurface({
      id: "browser.output",
      kind: "browser",
      label: "Browser automation output",
      dirPath: path.join(root, "browser-profiles", "playwright-output"),
      detail: "Playwright console/page artifacts counted by extension only; AgentScope does not read page snapshots or console bodies.",
      evidenceSource: "codex.control.browser_output"
    }),
    await directorySurface({
      id: "computer-use.state",
      kind: "computer_use",
      label: "Computer Use integration",
      dirPath: path.join(root, "computer-use"),
      detail: "Computer Use local state presence only. AgentScope does not launch desktop control.",
      evidenceSource: "codex.control.computer_use"
    }),
    await directorySurface({
      id: "mcp-node.runtime",
      kind: "runtime",
      label: "MCP node runtime",
      dirPath: path.join(root, "mcp-node"),
      detail: "Installed MCP Node runtime metadata. AgentScope does not execute package scripts or inspect package source bodies.",
      evidenceSource: "codex.control.mcp_node"
    }),
    await directorySurface({
      id: "node-repl.runtime",
      kind: "runtime",
      label: "Node REPL runtime",
      dirPath: path.join(root, "node_repl"),
      detail: "Node REPL runtime presence and entry count only; active exec bodies stay unread.",
      evidenceSource: "codex.control.node_repl"
    }),
    await directorySurface({
      id: "tmp.arg0",
      kind: "cache",
      label: "Codex arg temp files",
      dirPath: path.join(root, "tmp", "arg0"),
      detail: "Temporary command argument folders counted only. AgentScope does not open generated command files here.",
      evidenceSource: "codex.control.tmp_arg0"
    }),
    await directorySurface({
      id: "vendor-imports.cache",
      kind: "cache",
      label: "Vendor imports cache",
      dirPath: path.join(root, "vendor_imports"),
      detail: "Vendor import cache presence only; cached marketplace bodies stay unread.",
      evidenceSource: "codex.control.vendor_imports"
    }),
    await directorySurface({
      id: "pets.state",
      kind: "runtime",
      label: "Pets state",
      dirPath: path.join(root, "pets"),
      detail: "Codex Desktop local state presence only.",
      evidenceSource: "codex.control.pets"
    })
  ];
  surfaces.push(...(await ruleSurfaces(root)));
  surfaces.push(...(await skillSurfaces(root)));
  surfaces.push(...(await pluginSurfaces(root, configInventory)));
  return {
    codexHome: root,
    surfaces,
    mcpServers: configInventory.mcpServers,
    warnings: surfaces.flatMap((surface) => surface.warnings),
    evidence: [
      {
        source: "codex.control.official_manual",
        detail:
          "Codex manual identifies config.toml, AGENTS.md, MCP, skills, rules, plugins, memories, and archived threads as Codex app/CLI customization surfaces."
      },
      {
        source: "codex.control.local_inventory",
        detail: "AgentScope scanned only allowlisted metadata under CODEX_HOME.",
        path: root
      }
    ]
  };
}

export async function getCodexControlCenterSnapshot(home = userHome()): Promise<CodexControlCenterSnapshot> {
  const root = codexHome(home);
  const sqliteRoot = codexSqliteHome(home);
  const configPath = path.join(root, "config.toml");
  const configBytes = await readCurrentBytes(configPath);
  const configText = configBytes.toString(textEncoding);
  const sensitive = sensitiveLineNumbers(configText);
  const assignments = parseConfigAssignments(configText, configPath);
  const auth = await authSnapshot(root, configText);
  const configItems = [...editableConfigItems.entries()].map(([id, descriptor]) =>
    configCenterItem(id, descriptor, assignments, configPath, sensitive)
  );
  const inventory = await listCodexControlSurfaces(home);
  const surfaceItems = inventory.surfaces.map((surface) => surfaceCenterItem(surface));
  const warnings = [
    ...(sensitive.length ? ["Sensitive-looking config keys exist; structure edits are blocked until config.toml is cleaned externally."] : []),
    ...auth.warnings,
    ...inventory.warnings
  ];
  return {
    codexHome: root,
    sqliteHome: sqliteRoot,
    configPath,
    configSha256: sha256(configBytes),
    auth,
    items: [...configItems, ...surfaceItems],
    warnings,
    evidence: [
      {
        source: "codex.control.official_manual",
        detail:
          "Codex manual documents config.toml, auth.json credential storage, MCP, skills, plugins, rules, memories, browser/computer-use, and archived threads.",
        path: configPath
      },
      {
        source: "codex.control.local_inventory",
        detail: "AgentScope scanned allowlisted metadata under CODEX_HOME and CODEX_SQLITE_HOME.",
        path: root
      }
    ]
  };
}

export async function planCodexControlMutation(
  request: CodexControlMutationRequest,
  home = userHome()
): Promise<CodexControlMutationPlan> {
  const plan = await planCodexControlMutationInternal(request, home);
  const publicPlan = { ...plan } as CodexControlMutationPlan & { rawMutations?: InternalMutationPlan["rawMutations"] };
  delete publicPlan.rawMutations;
  return publicPlan;
}

export async function listCodexConfigTemplates(home = userHome()): Promise<CodexConfigTemplateList> {
  const storagePath = codexTemplateStoragePath(home);
  const custom = await readCustomCodexConfigTemplates(home);
  const currentTemplate = await currentCodexConfigTemplate(home);
  const warnings = custom.warnings;
  return {
    storagePath,
    templates: [currentTemplate, ...builtinCodexConfigTemplates, ...custom.templates],
    warnings,
    evidence: [
      {
        source: "codex.template.official_manual",
        detail:
          "Codex manual documents config.toml, approval_policy, sandbox_mode, web_search, model reasoning effort, profiles, and Windows sandbox settings.",
        path: path.join(codexHome(home), "config.toml")
      },
      {
        source: "codex.template.local_storage",
        detail: "AgentScope stores custom Codex config templates as local UI metadata, separate from CODEX_HOME.",
        path: storagePath
      }
    ]
  };
}

export async function getCodexConfigWorkbenchSnapshot(home = userHome()): Promise<CodexConfigWorkbenchSnapshot> {
  const root = codexHome(home);
  const configPath = path.join(root, "config.toml");
  const configBytes = await readCurrentBytes(configPath);
  const configText = configBytes.toString(textEncoding);
  const configSha256 = sha256(configBytes);
  const assignments = parseConfigAssignments(configText, configPath);
  const tables = parseConfigTables(configText, configPath);
  const inventory = configText ? inspectToml(configText, configPath) : emptyConfigInventory();
  const templateList = await listCodexConfigTemplates(home);
  const items: CodexConfigWorkbenchItem[] = [];
  const sensitiveLines = sensitiveLineNumbers(configText);
  for (const [itemId, descriptor] of editableConfigItems.entries()) {
    const assignment = assignments.get(descriptor.keyPath);
    const currentValue = configValueFromToml(assignment?.value, descriptor.valueKind);
    items.push({
      id: itemId,
      group: "current",
      keyPath: descriptor.keyPath,
      label: descriptor.label,
      detail: descriptor.detail,
      valueKind: descriptor.valueKind,
      options: descriptor.options,
      allowCustom: descriptor.allowCustom,
      currentValue,
      enabled: currentValue !== undefined,
      editable: sensitiveLines.length === 0,
      risk: descriptor.risk,
      source: descriptor.source,
      supportLevel: descriptorSupportLevel(descriptor),
      effectiveNote: descriptorEffectiveNote(descriptor),
      warnings: [
        ...(assignment && !tomlValueReplacementSafeForKind(assignment.value, descriptor.valueKind)
          ? [`${descriptor.keyPath} currently uses a complex TOML value and is read-only.`]
          : []),
        ...descriptorWarnings(descriptor)
      ],
      evidence: configItemEvidence(configPath, descriptor.keyPath, assignment)
    });
  }
  for (const server of inventory.mcpServers) {
    const table = tables.get(server.table);
    if (!table) continue;
    const fields = server.source === "plugin_config" ? mcpPluginPolicyEditableFields : mcpUserConfigEditableFields;
    for (const field of fields) {
      const descriptor = mcpEditableFieldDescriptors.get(field);
      if (!descriptor) continue;
      const keyPath = `${server.table}.${field}`;
      const raw = table.keys.get(field)?.value;
      const currentValue = configValueFromToml(raw, descriptor.valueKind);
      const transportBlocked =
        server.source === "plugin_config" && !mcpPluginPolicyEditableFields.has(field);
      items.push({
        id: `config.${keyPath}`,
        group: "mcp",
        keyPath,
        table: server.table,
        label: `${server.name} / ${descriptor.label}`,
        detail: descriptor.detail,
        valueKind: descriptor.valueKind,
        options: descriptor.options,
        allowCustom: descriptor.allowCustom,
        currentValue,
        enabled: currentValue !== undefined,
        editable: !transportBlocked && sensitiveLines.length === 0,
        risk: descriptor.risk,
        source: "official_docs",
        supportLevel: "official",
        effectiveNote: codexConfigNewSessionWarning,
        warnings: mcpWorkbenchWarnings(server, field, raw),
        evidence: [
          {
            source: "codex.control.config.toml",
            detail: `${server.source === "plugin_config" ? "Plugin MCP policy" : "MCP server"} field ${field} from ${server.table}.`,
            path: configPath,
            field: keyPath
          }
        ]
      });
    }
  }
  const unknownEntries = unknownConfigEntries(assignments, tables, configPath);
  for (const entry of unknownEntries) {
    const item = unknownWorkbenchItem(entry, assignments, configPath, sensitiveLines.length === 0);
    if (item) items.push(item);
  }
  return {
    codexHome: root,
    configPath,
    configSha256,
    items,
    mcpServers: inventory.mcpServers,
    unknownEntries,
    templateList,
    warnings: [
      ...templateList.warnings,
      ...(inventory.sensitiveLines.length ? ["Sensitive-looking config values detected; structured editing is blocked."] : [])
    ],
    evidence: [
      {
        source: "codex.config.workbench",
        detail:
          "Workbench snapshot was generated from current config.toml using structured allowlists; scalar unknown keys are editable with unverified warnings.",
        path: configPath
      }
    ]
  };
}

export async function saveCodexConfigTemplate(
  draft: CodexConfigTemplateDraft,
  home = userHome()
): Promise<CodexConfigTemplateList> {
  const template = sanitizeCustomTemplateDraft(draft);
  const current = await readCustomCodexConfigTemplates(home);
  const templates = current.templates.filter((item) => item.id !== template.id);
  if (templates.length >= maxCustomTemplateCount) {
    throw new Error(`Codex config template limit reached: ${maxCustomTemplateCount}.`);
  }
  templates.push(template);
  await writeCustomCodexConfigTemplates(home, templates);
  return listCodexConfigTemplates(home);
}

export async function deleteCodexConfigTemplate(id: string, home = userHome()): Promise<CodexConfigTemplateList> {
  if (!isSafeTemplateId(id) || id.startsWith("builtin.")) {
    throw new Error("Only custom Codex config templates can be deleted.");
  }
  const current = await readCustomCodexConfigTemplates(home);
  await writeCustomCodexConfigTemplates(
    home,
    current.templates.filter((template) => template.id !== id)
  );
  return listCodexConfigTemplates(home);
}

export async function previewCodexConfigTemplate(
  request: CodexConfigTemplatePreviewRequest,
  home = userHome()
): Promise<CodexConfigTemplatePreview> {
  const root = codexHome(home);
  const configPath = path.join(root, "config.toml");
  const configBytes = await readCurrentBytes(configPath);
  const configText = configBytes.toString(textEncoding);
  const configSha256 = sha256(configBytes);
  const center = await getCodexControlCenterSnapshot(home);
  const template = await resolveConfigTemplateForPreview(request, home);
  const selectedIds = request.selectedItemIds
    ? new Set(request.selectedItemIds.filter((id) => typeof id === "string" && id.length <= 120))
    : undefined;
  const assignments = parseConfigAssignments(configText, configPath);
  const warnings: string[] = [];
  const blockers: string[] = [];
  const mutations: CodexControlMutationRequest["mutations"] = [];
  const items = template.items.map((templateEntry) => {
    const descriptor = descriptorForMutation(templateEntry);
    const selected = selectedIds ? selectedIds.has(templateEntry.itemId) : templateEntry.defaultSelected !== false;
    const currentValue = descriptor ? configValueForKey(descriptor.keyPath, assignments) : undefined;
    const changed = currentValue !== templateEntry.value;
    const item = center.items.find((entry) => entry.id === templateEntry.itemId);
    const itemWarnings: string[] = [];
    if (!descriptor || descriptor.keyPath !== templateEntry.keyPath) {
      itemWarnings.push(`Unsupported Codex config template item: ${templateEntry.itemId}/${templateEntry.keyPath}`);
    } else {
      const validation = validateMutationValue(descriptor, templateEntry.value);
      if (validation) itemWarnings.push(validation);
      const assignment = assignments.get(descriptor.keyPath);
      if (assignment && !tomlScalarReplacementSafe(assignment.value)) {
        itemWarnings.push(`${descriptor.keyPath} currently uses a complex TOML value and may be replaced by a scalar.`);
      }
      if (!item?.editable) itemWarnings.push(`${descriptor.keyPath} is not editable in the current config snapshot.`);
      if (isHighRiskMutation(descriptor, templateEntry.value)) itemWarnings.push(`${descriptor.keyPath} is a high-risk Codex control setting.`);
      if (template.origin === "current") itemWarnings.push(`${descriptor.keyPath} is shown as current state and is not applied as a template mutation.`);
      const patchBlocker = safeConfigPatchBlocker(configText, descriptor.keyPath, templateEntry.value);
      if (patchBlocker) itemWarnings.push(patchBlocker);
      if (selected && changed && !itemWarnings.some((warning) => /Unsupported|must be one of|expects|sensitive|not editable|not applied|unsafe|cannot safely/i.test(warning))) {
        mutations.push({
          itemId: templateEntry.itemId,
          keyPath: templateEntry.keyPath,
          value: templateEntry.value,
          comment: sanitizeTemplateComment(templateEntry.comment)
        });
      }
    }
    warnings.push(...itemWarnings);
    return {
      itemId: templateEntry.itemId,
      keyPath: templateEntry.keyPath,
      label: item?.label ?? descriptor?.label ?? templateEntry.keyPath,
      detail: item?.detail ?? descriptor?.detail ?? "Unsupported Codex config key.",
      valueKind: item?.valueKind ?? descriptor?.valueKind ?? "string",
      risk: item?.risk ?? descriptor?.risk ?? "blocked",
      currentValue,
      nextValue: templateEntry.value,
      selected,
      editable: !!item?.editable && !!descriptor,
      changed,
      comment: sanitizeTemplateComment(templateEntry.comment),
      warnings: itemWarnings,
      supportLevel: descriptor ? descriptorSupportLevel(descriptor) : undefined,
      effectiveNote: descriptor ? descriptorEffectiveNote(descriptor) : undefined
    };
  });
  const highRisk = mutations.some((mutation) => {
    const descriptor = descriptorForMutation(mutation);
    return !!descriptor && isHighRiskMutation(descriptor, mutation.value);
  });
  const duplicateSelected = new Set<string>();
  for (const mutation of mutations) {
    if (duplicateSelected.has(mutation.keyPath)) blockers.push(`Template selects ${mutation.keyPath} more than once.`);
    duplicateSelected.add(mutation.keyPath);
  }
  if (sensitiveLineNumbers(configText).length > 0) blockers.push("config.toml contains sensitive-looking key names.");
  return {
    configPath,
    configSha256,
    templateId: template.id,
    templateName: template.name,
    templateDescription: template.description,
    storagePath: codexTemplateStoragePath(home),
    items,
    mutations: safeMutationsForPlan(mutations),
    changedKeys: mutations.map((mutation) => mutation.keyPath),
    warnings: [...new Set(warnings)],
    blockers: [...new Set(blockers)],
    highRisk,
    effectiveScope: codexConfigEffectiveScope,
    effectiveWarnings: [codexConfigNewSessionWarning],
    evidence: [
      {
        source: template.origin === "builtin" ? "codex.template.builtin" : "codex.template.custom",
        detail: "Template preview was generated from allowlisted Codex Control keys and current config.toml assignments.",
        path: configPath,
        field: mutations.map((mutation) => mutation.keyPath).join(",")
      }
    ]
  };
}

async function planCodexControlMutationInternal(
  request: CodexControlMutationRequest,
  home = userHome()
): Promise<InternalMutationPlan> {
  validateMutationRequest(request);
  const root = codexHome(home);
  const configPath = path.join(root, "config.toml");
  const current = await readCurrentBytes(configPath);
  const currentHash = sha256(current);
  const content = current.toString(textEncoding);
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (currentHash !== request.expectedSha256) blockers.push(`config.toml changed on disk: ${configPath}`);
  if (sensitiveLineNumbers(content).length > 0) blockers.push("config.toml contains sensitive-looking key names.");
  const normalized = normalizeMutations(request.mutations);
  const currentAssignments = parseConfigAssignments(content, configPath);
  for (const mutation of normalized) {
    const descriptor = descriptorForMutation(mutation);
    if (!descriptor || descriptor.keyPath !== mutation.keyPath) {
      blockers.push(`Unsupported Codex control mutation: ${mutation.itemId}/${mutation.keyPath}`);
      continue;
    }
    const reservedProviderBlocker = reservedProviderMutationBlocker(mutation.keyPath);
    if (reservedProviderBlocker) blockers.push(reservedProviderBlocker);
    if (descriptor.supportLevel === "unverified") {
      warnings.push(`${mutation.keyPath} is an unverified advanced Codex config key; AgentScope can write it but cannot prove Codex will use it.`);
    }
    const sensitiveKeyBlocker = sensitiveMutationKeyBlocker(mutation.keyPath);
    if (sensitiveKeyBlocker) blockers.push(sensitiveKeyBlocker);
    const mcp = parseMcpKeyPath(mutation.keyPath);
    if (mcp) {
      if (!safeMcpServerNameRe.test(mcp.tableName.split(".").at(-1) ?? "")) {
        blockers.push(`Cannot safely edit MCP server with unsupported table name: ${mcp.tableName}`);
      }
      if (mcp.source === "plugin_config" && !mcpPluginPolicyEditableFields.has(mcp.field)) {
        blockers.push(`Plugin MCP transport field is read-only: ${mutation.keyPath}`);
      }
    }
    const validation = validateMutationValue(descriptor, mutation.value);
    if (validation) blockers.push(validation);
    const patchBlocker = safeConfigPatchBlocker(content, descriptor.keyPath, mutation.value);
    if (patchBlocker) blockers.push(patchBlocker);
    const currentValue = configValueForDescriptor(descriptor, currentAssignments);
    if (currentValue === mutation.value) warnings.push(`${mutation.keyPath} already has the requested value.`);
    if (isHighRiskMutation(descriptor, mutation.value)) {
      warnings.push(`${mutation.keyPath} is a high-risk Codex control setting.`);
    }
  }
  const highRisk = normalized.some((mutation) => {
    const descriptor = descriptorForMutation(mutation);
    return !!descriptor && isHighRiskMutation(descriptor, mutation.value);
  });
  if (highRisk && !request.confirmedHighRisk) {
    blockers.push("High-risk Codex control mutations require explicit confirmation.");
  }
  let next = content;
  if (!blockers.length) {
    for (const mutation of normalized) {
      next = applyConfigMutation(next, mutation.keyPath, mutation.value, mutation.comment);
    }
    const validation = validateTomlShape(next);
    if (validation) blockers.push(`config.toml validation failed: ${validation}`);
  }
  return {
    configPath,
    expectedSha256: request.expectedSha256,
    mutations: safeMutationsForPlan(normalized),
    rawMutations: normalized,
    changedKeys: normalized.map((mutation) => mutation.keyPath),
    blockers,
    warnings: [...new Set(warnings)],
    effectiveScope: codexConfigEffectiveScope,
    effectiveWarnings: [codexConfigNewSessionWarning],
    highRisk,
    evidence: [
      {
        source: "codex.control.mutation.plan",
        detail: "Mutation was planned against allowlisted config.toml key paths with sha256 and risk checks.",
        path: configPath,
        field: normalized.map((mutation) => mutation.keyPath).join(",")
      }
    ]
  };
}

export async function executeCodexControlMutation(
  request: CodexControlMutationRequest,
  home = userHome()
): Promise<CodexControlSaveResult> {
  const plan = await planCodexControlMutationInternal(request, home);
  if (plan.blockers.length > 0) {
    throw new Error(`Codex control mutation blocked: ${plan.blockers.join("; ")}`);
  }
  const resolved = resolveDocument("config.global", home);
  const current = await readCurrentBytes(resolved.path);
  const currentHash = sha256(current);
  if (currentHash !== request.expectedSha256) {
    throw new Error(`Codex control config changed on disk; reload before saving: ${resolved.path}`);
  }
  let next = current.toString(textEncoding);
  for (const mutation of plan.rawMutations) {
    next = applyConfigMutation(next, mutation.keyPath, mutation.value, mutation.comment);
  }
  const validation = validateTomlShape(next);
  if (validation) throw new Error(`config.toml validation failed: ${validation}`);
  const backupPath = current.length ? await writeBackup(resolved, current, home) : undefined;
  const nextBytes = Buffer.from(next, textEncoding);
  const nextHash = sha256(nextBytes);
  const journal = await createCodexControlJournal(
    {
      action: "codex-control-mutation",
      targetPath: resolved.path,
      expectedSha256: request.expectedSha256,
      previousSha256: currentHash,
      backupPath,
      changedKeys: plan.changedKeys,
      highRisk: plan.highRisk,
      warnings: plan.warnings,
      evidence: plan.evidence
    },
    home
  );
  let verification: CodexControlWriteVerification = {
    status: "failed",
    checkedKeys: plan.changedKeys,
    warnings: [],
    error: "write_not_attempted"
  };
  try {
    await writeTextAtomically(resolved.path, next);
    verification = await verifyCodexControlMutationWrite(resolved.path, plan.rawMutations);
    if (verification.status !== "passed") {
      throw new Error(verification.error ?? `verification_failed: ${verification.checkedKeys.join(", ")}`);
    }
    await finishCodexControlJournal(journal, { status: "succeeded", nextSha256: nextHash, verification });
  } catch (error) {
    await finishCodexControlJournal(journal, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      verification
    }).catch(() => undefined);
    throw error;
  }
  return {
    id: "config.controlCenter",
    path: resolved.path,
    backupPath,
    journalPath: journal.journalPath,
    changedKeys: plan.changedKeys,
    effectiveScope: plan.effectiveScope,
    effectiveWarnings: plan.effectiveWarnings,
    verification,
    sha256: nextHash,
    bytes: nextBytes.length,
    evidence: [
      {
        source: "codex.control.mutation.execute",
        detail: "Codex config keys were written after backup, sha256 check, journal creation, atomic rename, and read-back verification.",
        path: resolved.path,
        field: plan.changedKeys.join(",")
      },
      ...(backupPath
        ? [
            {
              source: "codex.control.backup",
              detail: "Previous config.toml bytes were copied before save.",
              path: backupPath
            }
          ]
        : []),
      {
        source: "codex.control.journal",
        detail: "Mutation journal records paths, hashes, changed keys, risk, warnings, and evidence only.",
        path: journal.journalPath
      }
    ]
  };
}

export async function readCodexControlDocument(id: string, home = userHome()): Promise<CodexControlDocument> {
  const resolved = resolveDocument(id, home);
  if (id === "config.global") {
    throw new Error("Raw config.toml editing is disabled; use structured Codex controls.");
  }
  await assertResolvedDocumentPathSafe(resolved, home);
  const stat = await statFile(resolved.path);
  if (!stat.exists) {
    return {
      ...resolved,
      content: "",
      sha256: sha256(""),
      bytes: 0,
      editable: resolved.editable,
      redacted: false,
      warnings: [],
      evidence: [
        {
          source: "codex.control.document",
          detail: "Editable Codex control file does not exist yet; saving will create it.",
          path: resolved.path
        }
      ]
    };
  }
  if ((stat.bytes ?? 0) > maxEditableBytes) {
    throw new Error(`Codex control document is too large for built-in editing: ${resolved.path}`);
  }
  const content = await fs.promises.readFile(resolved.path, textEncoding);
  const sensitive = sensitiveDocumentLineNumbers(content);
  const redacted = sensitive.length > 0;
  return {
    ...resolved,
    content: redacted ? redactSensitiveDocumentLines(content) : content,
    sha256: sha256(content),
    bytes: Buffer.byteLength(content, textEncoding),
    updatedAt: stat.updatedAt,
    editable: resolved.editable && !redacted,
    redacted,
    warnings: redacted ? ["Sensitive content was detected; AgentScope redacted this document and will not save edits."] : [],
    evidence: [
      {
        source: "codex.control.document",
        detail: "Document was read through an allowlisted Codex control id.",
        path: resolved.path
      }
    ]
  };
}

export async function readCodexModeConfig(home = userHome()): Promise<CodexModeConfigSnapshot> {
  const root = codexHome(home);
  const configPath = path.join(root, "config.toml");
  const current = await readCurrentBytes(configPath);
  const content = current.toString(textEncoding);
  const sensitive = sensitiveLineNumbers(content);
  const assignments = parseTopLevelAssignments(content, configPath);
  return modeConfigSnapshot(configPath, current, assignments, sensitive);
}

export async function saveCodexModeConfig(
  patch: CodexModeConfigPatch,
  expectedSha256: string,
  home = userHome()
): Promise<CodexModeConfigSaveResult> {
  validateModePatch(patch);
  const resolved = resolveDocument("config.global", home);
  const current = await readCurrentBytes(resolved.path);
  const content = current.toString(textEncoding);
  const currentHash = sha256(content);
  if (currentHash !== expectedSha256) {
    throw new Error(`Codex mode config changed on disk; reload before saving: ${resolved.path}`);
  }
  if (sensitiveLineNumbers(content).length > 0) {
    throw new Error("AgentScope refuses to structurally edit config.toml with sensitive-looking key names.");
  }
  const next = applyModePatch(content, patch);
  const validation = validateTomlShape(next);
  if (validation) throw new Error(`config.toml validation failed: ${validation}`);
  const backupPath = current.length ? await writeBackup(resolved, current, home) : undefined;
  const nextBytes = Buffer.from(next, textEncoding);
  const nextHash = sha256(nextBytes);
  const changedKeys = changedModeKeyPaths(patch);
  const baseEvidence: Evidence[] = [
    {
      source: "codex.control.mode_config.save",
      detail: "Mode defaults were saved by updating allowlisted top-level config.toml keys only.",
      path: resolved.path,
        field: changedKeys.join(",")
    },
    ...(backupPath
      ? [
          {
            source: "codex.control.backup",
            detail: "Previous config.toml bytes were copied before save.",
            path: backupPath
          }
        ]
      : [])
  ];
  const journal = await createCodexControlJournal(
    {
      action: "codex-mode-config-save",
      targetPath: resolved.path,
      expectedSha256,
      previousSha256: currentHash,
      backupPath,
      changedKeys,
      highRisk: false,
      warnings: [],
      evidence: baseEvidence
    },
    home
  );
  try {
    await writeTextAtomically(resolved.path, next);
    await finishCodexControlJournal(journal, { status: "succeeded", nextSha256: nextHash });
  } catch (error) {
    await finishCodexControlJournal(journal, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error)
    }).catch(() => undefined);
    throw error;
  }
  const evidence: Evidence[] = [
    ...baseEvidence,
    {
      source: "codex.control.journal",
      detail: "Codex mode config save journal records started and succeeded states for the atomic write.",
      path: journal.journalPath
    }
  ];
  const snapshot = modeConfigSnapshot(
    resolved.path,
    nextBytes,
    parseTopLevelAssignments(next, resolved.path),
    sensitiveLineNumbers(next)
  );
  return {
    id: "config.modeDefaults",
    path: resolved.path,
    backupPath,
    journalPath: journal.journalPath,
    sha256: snapshot.sha256,
    bytes: nextBytes.length,
    modes: snapshot.modes,
    evidence
  };
}

export async function saveCodexControlDocument(
  id: string,
  content: string,
  expectedSha256: string,
  home = userHome()
): Promise<CodexControlSaveResult> {
  const resolved = resolveDocument(id, home);
  if (id === "config.global") {
    throw new Error("Raw config.toml saving is disabled; use structured Codex controls.");
  }
  if (!resolved.editable) throw new Error(`Codex control document is read-only: ${id}`);
  await assertResolvedDocumentPathSafe(resolved, home);
  if (Buffer.byteLength(content, textEncoding) > maxEditableBytes) {
    throw new Error(`Codex control document is too large for built-in editing: ${resolved.path}`);
  }
  const current = await readCurrentBytes(resolved.path);
  const currentText = current.toString(textEncoding);
  if (current.length > 0 && sensitiveDocumentLineNumbers(currentText).length > 0) {
    throw new Error("AgentScope refuses to save Codex control documents that were redacted on read; clean the file externally first.");
  }
  if (resolved.kind === "config" && sensitiveLineNumbers(content).length > 0) {
    throw new Error("AgentScope refuses to save config.toml with sensitive-looking key names.");
  }
  if (sensitiveDocumentLineNumbers(content).length > 0) {
    throw new Error("AgentScope refuses to save Codex control documents with sensitive-looking content.");
  }
  if (resolved.kind === "config") {
    const validation = validateTomlShape(content);
    if (validation) throw new Error(`config.toml validation failed: ${validation}`);
  }
  const currentHash = sha256(currentText);
  if (currentHash !== expectedSha256) {
    throw new Error(`Codex control document changed on disk; reload before saving: ${resolved.path}`);
  }
  const backupPath = current.length ? await writeBackup(resolved, current, home) : undefined;
  const nextHash = sha256(content);
  const journal = await createCodexControlJournal(
    {
      action: "codex-control-document-save",
      targetPath: resolved.path,
      expectedSha256,
      previousSha256: currentHash,
      backupPath,
      changedKeys: [id],
      highRisk: false,
      warnings: [],
      evidence: [
        {
          source: "codex.control.save",
          detail: "Allowlisted Codex control document save was journaled after backup, conflict check, and atomic write.",
          path: resolved.path,
          field: id
        }
      ]
    },
    home
  );
  try {
    await writeTextAtomically(resolved.path, content);
    await finishCodexControlJournal(journal, { status: "succeeded", nextSha256: nextHash });
  } catch (error) {
    await finishCodexControlJournal(journal, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error)
    }).catch(() => undefined);
    throw error;
  }
  return {
    id,
    path: resolved.path,
    backupPath,
    journalPath: journal.journalPath,
    changedKeys: [id],
    sha256: nextHash,
    bytes: Buffer.byteLength(content, textEncoding),
    evidence: [
      {
        source: "codex.control.save",
        detail: "Document was saved atomically after sha256 conflict check and pre-write backup.",
        path: resolved.path
      },
      ...(backupPath
        ? [
            {
              source: "codex.control.backup",
              detail: "Previous document bytes were copied before save.",
              path: backupPath
            }
          ]
        : []),
      {
        source: "codex.control.journal",
        detail: "Codex control document save journal records started and succeeded states for the atomic write.",
        path: journal.journalPath
      }
    ]
  };
}

export async function revealCodexControlSurface(
  id: string,
  home = userHome()
): Promise<CodexControlRevealResult> {
  const resolved = resolveDocumentForReveal(id, home);
  if (!resolved.revealAllowed) return resolved;
  await assertResolvedDocumentPathSafe(resolveDocument(id, home), home);
  return resolved;
}

function resolveDocument(id: string, home: string): ResolvedDocument {
  const root = codexHome(home);
  if (id === "config.global") {
    return resolveAllowedFile(root, id, "config", "config.toml", path.join(root, "config.toml"), false);
  }
  if (id === "agents.global") {
    return resolveAllowedFile(root, id, "agents", "AGENTS.md", path.join(root, "AGENTS.md"), true);
  }
  if (id.startsWith("rules:")) {
    const name = id.slice("rules:".length);
    if (!safeRuleNameRe.test(name)) throw new Error(`Invalid Codex rules document id: ${id}`);
    return resolveAllowedFile(root, id, "rules", name, path.join(root, "rules", name), true);
  }
  if (id.startsWith("skill:")) {
    const name = id.slice("skill:".length);
    if (!safeSkillNameRe.test(name) || name === ".system") throw new Error(`Invalid Codex skill document id: ${id}`);
    return resolveAllowedFile(root, id, "skill", name, path.join(root, "skills", name, "SKILL.md"), true);
  }
  throw new Error(`Unknown Codex control document id: ${id}`);
}

function resolveDocumentForReveal(id: string, home: string): CodexControlRevealResult {
  const blocked = (reason: string): CodexControlRevealResult => ({
    id,
    path: "",
    revealAllowed: false,
    reason,
    evidence: [
      {
        source: "codex.control.reveal",
        detail: reason
      }
    ]
  });
  if (id === "agents.global" || id.startsWith("rules:") || id.startsWith("skill:")) {
    const resolved = resolveDocument(id, home);
    return {
      id,
      path: resolved.path,
      revealAllowed: true,
      evidence: [
        {
          source: "codex.control.reveal",
          detail: "Codex Control resolved this user-editable document by allowlisted id before reveal.",
          path: resolved.path,
          field: id
        }
      ]
    };
  }
  if (id === "config.global") return blocked("Raw config.toml is managed only through structured Codex Control keys.");
  if (id.startsWith("skill-readonly:")) return blocked("System or plugin-provided skills are read-only and not revealed by AgentScope.");
  if (id.startsWith("rules:")) return blocked("Codex rule id is invalid or blocked.");
  if (id === "plugins.summary") return blocked("Installed plugin cache is evidence-only; AgentScope does not reveal plugin cache paths.");
  return blocked("This Codex Control surface is read-only or metadata-only; AgentScope will not reveal its path.");
}

function resolveAllowedFile(
  root: string,
  id: string,
  kind: CodexControlSurfaceKind,
  label: string,
  filePath: string,
  editable: boolean
): ResolvedDocument {
  const normalizedRoot = normalizeWindowsPath(root) ?? root;
  const normalizedPath = normalizeWindowsPath(filePath) ?? filePath;
  const relative = path.relative(normalizedRoot, normalizedPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Codex control document escapes CODEX_HOME: ${id}`);
  }
  if (relative.split(/[\\/]+/).some((part) => sensitivePathPartRe.test(part))) {
    throw new Error(`Codex control document is sensitive and blocked: ${id}`);
  }
  return { id, kind, label, path: normalizedPath, editable };
}

async function assertResolvedDocumentPathSafe(resolved: ResolvedDocument, home: string): Promise<void> {
  const root = path.resolve(codexHome(home));
  const target = path.resolve(resolved.path);
  if (!pathInsideResolved(root, target)) {
    throw new Error(`Codex control document escapes CODEX_HOME: ${resolved.id}`);
  }

  const targetLstat = await fs.promises.lstat(target).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
  if (targetLstat?.isSymbolicLink()) {
    throw new Error(`Codex control document is a symbolic link and is blocked: ${resolved.id}`);
  }

  const existing = await nearestExistingPath(target);
  const rootReal = await fs.promises.realpath(root).catch(() => root);
  const existingReal = existing ? await fs.promises.realpath(existing) : rootReal;
  if (!pathInsideResolved(rootReal, existingReal)) {
    throw new Error(`Codex control document escapes CODEX_HOME after realpath: ${resolved.id}`);
  }
  if (targetLstat) {
    const targetReal = await fs.promises.realpath(target);
    if (!pathInsideResolved(rootReal, targetReal)) {
      throw new Error(`Codex control document escapes CODEX_HOME after realpath: ${resolved.id}`);
    }
  }
}

async function nearestExistingPath(filePath: string): Promise<string | undefined> {
  let current = path.resolve(filePath);
  while (true) {
    if (await pathExistsLocal(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

async function pathExistsLocal(filePath: string): Promise<boolean> {
  return fs.promises.lstat(filePath).then(() => true, () => false);
}

function pathInsideResolved(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function fileSurface(input: {
  id: string;
  kind: CodexControlSurfaceKind;
  label: string;
  filePath: string;
  editable: boolean;
  detail: string;
  warnings: string[];
}): Promise<CodexControlSurface> {
  const stat = await statFile(input.filePath);
  return {
    id: input.id,
    kind: input.kind,
    label: input.label,
    path: input.filePath,
    exists: stat.exists,
    editable: input.editable,
    status: input.warnings.length ? "warn" : "ok",
    detail: input.detail,
    bytes: stat.bytes,
    updatedAt: stat.updatedAt,
    warnings: input.warnings,
    evidence: [
      {
        source: `codex.control.${input.kind}`,
        detail: stat.exists ? "Codex control file exists." : "Codex control file is allowlisted but not present.",
        path: input.filePath
      }
    ]
  };
}

async function ruleSurfaces(root: string): Promise<CodexControlSurface[]> {
  const rulesRoot = path.join(root, "rules");
  const names = await safeReaddir(rulesRoot);
  const ruleNames = names.filter((entry) => entry.isFile() && safeRuleNameRe.test(entry.name)).map((entry) => entry.name).sort();
  if (!ruleNames.includes("default.rules")) ruleNames.unshift("default.rules");
  return Promise.all(
    ruleNames.map((name) =>
      fileSurface({
        id: `rules:${name}`,
        kind: "rules",
        label: name,
        filePath: path.join(rulesRoot, name),
        editable: true,
        detail: "Codex command approval rules in the user config layer.",
        warnings: []
      })
    )
  );
}

async function skillSurfaces(root: string): Promise<CodexControlSurface[]> {
  const skillsRoot = path.join(root, "skills");
  const entries = await safeReaddir(skillsRoot);
  const surfaces: CodexControlSurface[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(skillsRoot, entry.name, "SKILL.md");
    const stat = await statFile(skillPath);
    const isSystem = entry.name === ".system";
    const editable = !isSystem && safeSkillNameRe.test(entry.name);
    const displayName = await skillDisplayName(skillPath, entry.name);
    surfaces.push({
      id: editable ? `skill:${entry.name}` : `skill-readonly:${entry.name}`,
      kind: "skill",
      label: displayName,
      path: skillPath,
      exists: stat.exists,
      editable,
      status: editable ? "ok" : "blocked",
      detail: editable
        ? "User skill authoring surface. AgentScope edits only SKILL.md and backs it up first."
        : "Bundled/system skill surface. AgentScope keeps it read-only.",
      bytes: stat.bytes,
      updatedAt: stat.updatedAt,
      warnings: editable ? [] : ["System or plugin-provided skills are read-only."],
      evidence: [
        {
          source: "codex.control.skills",
          detail: "Codex manual describes skills as directories with SKILL.md; AgentScope only exposes user-owned SKILL.md files for editing.",
          path: skillPath
        }
      ]
    });
  }
  return surfaces;
}

async function pluginSurfaces(root: string, config: ConfigInventory): Promise<CodexControlSurface[]> {
  const pluginRoot = path.join(root, "plugins");
  const stat = await statFile(pluginRoot);
  const pluginCount = config.pluginTables.length || (await countDirectories(pluginRoot));
  return [
    {
      id: "plugins.summary",
      kind: "plugin",
      label: "Plugins",
      path: pluginRoot,
      exists: stat.exists,
      editable: false,
      status: "blocked",
      detail: "Installed plugin cache and config summary. AgentScope does not edit plugin cache bytes directly.",
      bytes: stat.bytes,
      updatedAt: stat.updatedAt,
      summary: { configured: pluginCount },
      warnings: ["Use Codex plugin workflows for install/remove; AgentScope shows evidence only."],
      evidence: [
        {
          source: "codex.control.plugins",
          detail: "Plugin configuration was inferred from config.toml plugin tables and local plugin directory presence.",
          path: pluginRoot
        }
      ]
    }
  ];
}

function configSummarySurface(root: string, config: ConfigInventory): CodexControlSurface {
  return {
    id: "mcp.summary",
    kind: "mcp",
    label: "MCP servers",
    path: path.join(root, "config.toml"),
    exists: config.exists,
    editable: false,
    status: config.sensitiveLines.length ? "warn" : "ok",
    detail: "MCP server tables from config.toml. Edit the config document to change them.",
    summary: {
      mcpServers: config.mcpServers.length,
      pluginTables: config.pluginTables.length,
      projectTables: config.projectTables.length
    },
    warnings: config.sensitiveLines.length ? ["Sensitive config keys detected; raw editing is blocked."] : [],
    evidence: [
      {
        source: "codex.control.mcp",
        detail: "Official Codex MCP documentation stores MCP server configuration in config.toml.",
        path: path.join(root, "config.toml"),
        field: "mcp_servers.*"
      }
    ]
  };
}

async function archiveSurface(root: string): Promise<CodexControlSurface> {
  const dbPath = path.join(root, "state_5.sqlite");
  const stat = await statFile(dbPath);
  const archived = countArchivedThreads(dbPath);
  return {
    id: "archive.summary",
    kind: "archive",
    label: "Archived threads",
    path: dbPath,
    exists: stat.exists,
    editable: false,
    status: stat.exists ? "ok" : "warn",
    detail: "Archived thread count only; AgentScope does not display archived conversation bodies here.",
    bytes: stat.bytes,
    updatedAt: stat.updatedAt,
    summary: archived === undefined ? undefined : { archived },
    warnings: archived === undefined && stat.exists ? ["Could not read archived thread count from state_5.sqlite."] : [],
    evidence: [
      {
        source: "codex.control.archives",
        detail: "Archived thread metadata is counted from state_5.sqlite without reading transcript bodies.",
        path: dbPath,
        field: "threads.archived"
      }
    ]
  };
}

async function memorySurface(root: string): Promise<CodexControlSurface> {
  const dbPath = path.join(root, "memories_1.sqlite");
  const stat = await statFile(dbPath);
  return {
    id: "memory.summary",
    kind: "memory",
    label: "Memories",
    path: dbPath,
    exists: stat.exists,
    editable: false,
    status: stat.exists ? "ok" : "warn",
    detail: "Memory database presence only. AgentScope does not read or edit memory content.",
    bytes: stat.bytes,
    updatedAt: stat.updatedAt,
    warnings: [],
    evidence: [
      {
        source: "codex.control.memories",
        detail: "Codex memory storage is treated as read-only metadata in AgentScope.",
        path: dbPath
      }
    ]
  };
}

async function codexDatabaseSurfaces(root: string, sqliteRoot: string): Promise<CodexControlSurface[]> {
  const inputs = [
    {
      id: "database.state",
      label: "state_5.sqlite",
      filePath: path.join(sqliteRoot, "state_5.sqlite"),
      detail: "Codex state database schema and row-count summary only. Transcript bodies are not read here."
    },
    {
      id: "database.goals",
      label: "goals_1.sqlite",
      filePath: path.join(sqliteRoot, "goals_1.sqlite"),
      detail: "Codex goals database schema and row-count summary only."
    },
    {
      id: "database.memories",
      label: "memories_1.sqlite",
      filePath: path.join(sqliteRoot, "memories_1.sqlite"),
      detail: "Codex memories database schema and row-count summary only; memory content is not read."
    },
    {
      id: "database.logs",
      label: "logs_2.sqlite",
      filePath: path.join(sqliteRoot, "logs_2.sqlite"),
      detail: "Codex logs database schema and row-count summary only. Log body text is not restored or displayed."
    },
    {
      id: "database.dev",
      label: "sqlite/codex-dev.db",
      filePath: path.join(root, "sqlite", "codex-dev.db"),
      detail: "Codex Desktop automation database schema and row-count summary only."
    }
  ];
  return Promise.all(
    inputs.map(async (input) => {
      const stat = await statFile(input.filePath);
      const summary = summarizeSqlite(input.filePath);
      return {
        id: input.id,
        kind: "database" as const,
        label: input.label,
        path: input.filePath,
        exists: stat.exists,
        editable: false,
        status: stat.exists ? "ok" : "warn",
        detail: input.detail,
        bytes: stat.bytes,
        updatedAt: stat.updatedAt,
        summary,
        warnings: stat.exists && !summary ? ["Could not open this SQLite database read-only for metadata."] : [],
        evidence: [
          {
            source: "codex.control.sqlite_metadata",
            detail: "AgentScope opened the database read-only and counted tables/rows without selecting body columns.",
            path: input.filePath
          }
        ]
      };
    })
  );
}

async function directorySurface(input: {
  id: string;
  kind: CodexControlSurfaceKind;
  label: string;
  dirPath: string;
  detail: string;
  evidenceSource: string;
}): Promise<CodexControlSurface> {
  const stat = await statFile(input.dirPath);
  const summary = await summarizeDirectory(input.dirPath);
  return {
    id: input.id,
    kind: input.kind,
    label: input.label,
    path: input.dirPath,
    exists: stat.exists,
    editable: false,
    status: stat.exists ? "ok" : "warn",
    detail: input.detail,
    bytes: stat.bytes,
    updatedAt: stat.updatedAt,
    summary,
    warnings: [],
    evidence: [
      {
        source: input.evidenceSource,
        detail: "AgentScope inspected directory presence and entry count only.",
        path: input.dirPath
      }
    ]
  };
}

function configCenterItem(
  id: string,
  descriptor: EditableConfigDescriptor,
  assignments: Map<string, TopLevelAssignment>,
  configPath: string,
  sensitiveLines: number[]
): CodexControlCenterItem {
  const assignment = assignments.get(descriptor.keyPath);
  const assignmentSensitive = assignment ? isSensitiveTomlLine(`${assignment.key} = ${assignment.value}`) : false;
  const value = assignmentSensitive ? undefined : configValueFromToml(assignment?.value, descriptor.valueKind);
  const valueKind = descriptor.valueKind === "stringArray" ? "summary" : descriptor.valueKind;
  const warnings = [
    ...(sensitiveLines.length ? ["Sensitive-looking config keys block structural edits."] : []),
    ...(assignmentSensitive ? ["This config value looks sensitive and is not displayed."] : []),
    ...(descriptor.risk === "high" ? ["High-risk setting; execution requires explicit confirmation."] : [])
  ];
  return {
    id,
    section: descriptor.section,
    label: descriptor.label,
    detail: descriptor.detail,
    keyPath: descriptor.keyPath,
    value: Array.isArray(value) ? value.join(", ") : value,
    valueKind,
    options: descriptor.options,
    allowCustom: descriptor.allowCustom,
    editable: sensitiveLines.length === 0,
    risk: descriptor.risk,
    targetPath: configPath,
    source: descriptor.source,
    status: sensitiveLines.length ? "blocked" : descriptor.risk === "high" ? "warn" : "ok",
    warnings,
    evidence: [
      assignment
        ? {
            source: "codex.control.config.toml",
            detail: `Config key ${descriptor.keyPath} found at line ${assignment.line}.`,
            path: assignment.path,
            field: descriptor.keyPath
          }
        : {
            source: "codex.control.config.toml",
            detail: `Config key ${descriptor.keyPath} is not present; Codex will use profile, project, CLI, or built-in defaults.`,
            path: configPath,
            field: descriptor.keyPath
          },
      {
        source: descriptor.source === "official_docs" ? "codex.control.official_manual" : "codex.control.current_code",
        detail: "This key is exposed through the structured Codex Control Center allowlist.",
        path: configPath,
        field: descriptor.keyPath
      }
    ]
  };
}

function surfaceCenterItem(surface: CodexControlSurface): CodexControlCenterItem {
  const section: CodexControlCenterItem["section"] =
    surface.kind === "mcp"
      ? "mcp"
      : surface.kind === "skill" || surface.kind === "plugin" || surface.kind === "rules"
        ? "skills"
        : surface.kind === "browser" ||
            surface.kind === "computer_use" ||
            surface.kind === "memory" ||
            surface.kind === "archive" ||
            surface.kind === "database" ||
            surface.kind === "cache"
          ? "storage"
          : "advanced";
  const displayText =
    surface.kind === "skill"
      ? {
          displayLabel: surface.label,
          displayDetail: surface.detail,
        }
      : {};
  return {
    id: `surface.${surface.id}`,
    section,
    label: surface.label,
    detail: surface.detail,
    ...displayText,
    value: surface.exists ? "present" : "missing",
    valueKind: "summary",
    editable: false,
    risk: surface.status === "blocked" ? "blocked" : "low",
    targetPath: surface.path,
    source: "local_inventory",
    status: surface.status,
    warnings: surface.warnings,
    evidence: surface.evidence
  };
}

async function skillDisplayName(skillPath: string, fallbackName: string): Promise<string> {
  const content = await readSmallText(skillPath);
  const header = markdownHeading(content);
  const frontmatterName = skillFrontmatterName(content);
  return cleanSkillDisplayName(header) ?? cleanSkillDisplayName(frontmatterName) ?? cleanSkillDisplayName(fallbackName) ?? fallbackName;
}

function markdownHeading(content: string | undefined): string | undefined {
  return content
    ?.split(/\r?\n/)
    .map((line) => /^#\s+(.+?)\s*$/.exec(line)?.[1]?.trim())
    .find((value): value is string => !!value);
}

function skillFrontmatterName(content: string | undefined): string | undefined {
  if (!content?.startsWith("---")) return undefined;
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  if (!match) return undefined;
  const name = /^name\s*:\s*(.+?)\s*$/im.exec(match[1] ?? "")?.[1];
  if (!name) return undefined;
  return name.replace(/^["']|["']$/g, "");
}

function cleanSkillDisplayName(value: string | undefined): string | undefined {
  const cleaned = value
    ?.replace(/[`*_~[\]()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return undefined;
  return cleaned.length > 80 ? `${cleaned.slice(0, 77)}...` : cleaned;
}

async function authSnapshot(root: string, configText: string): Promise<CodexControlCenterSnapshot["auth"]> {
  const authPath = path.join(root, "auth.json");
  const stat = await statFile(authPath, { followSymlink: false });
  const storageMode = authStorageMode(configText);
  return {
    path: authPath,
    exists: stat.exists,
    bytes: stat.bytes,
    updatedAt: stat.updatedAt,
    sha256: undefined,
    storageMode,
    warnings: [
      "auth.json is credential material. AgentScope shows metadata only and never opens, edits, or displays token fields.",
      ...(stat.isSymbolicLink
        ? ["auth.json is a symlink; AgentScope reports link metadata only and does not follow the target."]
        : [])
    ],
    evidence: [
      {
        source: "codex.control.official_manual",
        detail: "Codex documentation says file-based auth is stored in auth.json and must be treated like a password.",
        path: authPath
      },
      {
        source: "codex.control.local_inventory",
        detail: stat.isSymbolicLink
          ? "AgentScope checked auth.json symlink metadata without following the target."
          : stat.exists
          ? "AgentScope checked file existence, size, and mtime without reading JSON content."
          : "AgentScope checked that auth.json is not present at CODEX_HOME.",
        path: authPath
      }
    ]
  };
}

function authStorageMode(configText: string): CodexControlCenterSnapshot["auth"]["storageMode"] {
  const assignments = parseConfigAssignments(configText, "");
  const value = stringTomlValue(assignments.get("cli_auth_credentials_store")?.value);
  if (value === "file" || value === "keyring" || value === "auto" || value === "ephemeral") return value;
  return value ? "unknown" : undefined;
}

function normalizeMutations(mutations: CodexControlMutationRequest["mutations"]): CodexControlMutationRequest["mutations"] {
  const seen = new Set<string>();
  const normalized: CodexControlMutationRequest["mutations"] = [];
  for (const mutation of mutations) {
    const itemId = String(mutation.itemId);
    const keyPath = String(mutation.keyPath);
    const key = `${itemId}\n${keyPath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({ itemId, keyPath, value: mutation.value, comment: sanitizeTemplateComment(mutation.comment) });
  }
  return normalized;
}

function descriptorForMutation(
  mutation: Pick<CodexControlMutation, "itemId" | "keyPath"> & Partial<Pick<CodexControlMutation, "value">>
): EditableConfigDescriptor | undefined {
  const staticDescriptor = editableConfigItems.get(mutation.itemId);
  if (staticDescriptor) return staticDescriptor;
  const parsed = parseMcpKeyPath(mutation.keyPath);
  if (parsed && mutation.itemId === `config.${mutation.keyPath}`) {
    const fieldDescriptor = mcpEditableFieldDescriptors.get(parsed.field);
    if (!fieldDescriptor) return undefined;
    if (parsed.source === "plugin_config" && !mcpPluginPolicyEditableFields.has(parsed.field)) return undefined;
    if (parsed.source === "user_config" && !mcpUserConfigEditableFields.has(parsed.field)) return undefined;
    return {
      keyPath: mutation.keyPath,
      section: "mcp",
      label: fieldDescriptor.label,
      detail: fieldDescriptor.detail,
      valueKind: fieldDescriptor.valueKind,
      options: fieldDescriptor.options,
      allowCustom: fieldDescriptor.allowCustom,
      risk: fieldDescriptor.risk,
      source: "official_docs",
      supportLevel: "official",
      effectiveNote: codexConfigNewSessionWarning
    };
  }
  if (isCustomConfigItemId(mutation.itemId)) {
    return customConfigDescriptorForMutation(mutation);
  }
  return undefined;
}

function parseMcpKeyPath(keyPath: string):
  | { source: "user_config" | "plugin_config"; tableName: string; serverName: string; field: string }
  | undefined {
  const direct = /^mcp_servers\.([A-Za-z0-9_-]{1,80})\.([A-Za-z0-9_.-]{1,80})$/.exec(keyPath);
  if (direct) return { source: "user_config", tableName: `mcp_servers.${direct[1]!}`, serverName: direct[1]!, field: direct[2]! };
  const plugin = /^plugins\.([A-Za-z0-9_-]{1,80})\.mcp_servers\.([A-Za-z0-9_-]{1,80})\.([A-Za-z0-9_.-]{1,80})$/.exec(keyPath);
  if (plugin) {
    return {
      source: "plugin_config",
      tableName: `plugins.${plugin[1]!}.mcp_servers.${plugin[2]!}`,
      serverName: `${plugin[1]!}:${plugin[2]!}`,
      field: plugin[3]!
    };
  }
  return undefined;
}

function safeMutationsForPlan(
  mutations: CodexControlMutationRequest["mutations"]
): CodexControlMutationRequest["mutations"] {
  return mutations.map((mutation) => ({
    ...mutation,
    value: isSensitiveMutationValue(mutation.value) ? redactedMutationValue : mutation.value
  }));
}

function descriptorSupportLevel(descriptor: EditableConfigDescriptor): CodexConfigSupportLevel {
  if (descriptor.supportLevel) return descriptor.supportLevel;
  return descriptor.source === "official_docs" ? "official" : "known_local";
}

function descriptorEffectiveNote(descriptor: EditableConfigDescriptor): string {
  return descriptor.effectiveNote ?? codexConfigNewSessionWarning;
}

function descriptorWarnings(descriptor: EditableConfigDescriptor): string[] {
  const warnings: string[] = [];
  if (descriptorSupportLevel(descriptor) === "unverified") {
    warnings.push(`${descriptor.keyPath} is an unverified advanced Codex config key; AgentScope can write it but cannot prove Codex will use it.`);
  }
  const reserved = reservedProviderMutationBlocker(descriptor.keyPath);
  if (reserved) warnings.push(reserved);
  return warnings;
}

function isCustomConfigItemId(itemId: string): boolean {
  return /^config\.(?:custom|unknown)\.[A-Za-z0-9_.-]{1,110}$/.test(itemId);
}

function customConfigDescriptorForMutation(
  mutation: Pick<CodexControlMutation, "itemId" | "keyPath"> & Partial<Pick<CodexControlMutation, "value">>
): EditableConfigDescriptor | undefined {
  if (!safeCustomConfigKeyPath(mutation.keyPath)) return undefined;
  const kind = valueKindForMutationValue(mutation.value);
  return {
    keyPath: mutation.keyPath,
    section: "advanced",
    label: mutation.keyPath,
    detail: "Unverified advanced Codex config key preserved from the user's config.toml or custom edit.",
    valueKind: kind,
    risk: riskForCustomKeyPath(mutation.keyPath),
    source: "current_code",
    supportLevel: "unverified",
    effectiveNote: codexConfigNewSessionWarning
  };
}

function valueKindForMutationValue(value: CodexControlMutationValue | undefined): EditableConfigDescriptor["valueKind"] {
  if (Array.isArray(value)) return "stringArray";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  return "string";
}

function valueKindForUnknownEntry(entry: CodexConfigUnknownEntry, assignments: Map<string, TopLevelAssignment>): EditableConfigDescriptor["valueKind"] {
  const value = assignments.get(entry.keyPath)?.value;
  if (entry.valueKind === "array") return "stringArray";
  const boolean = booleanValue(value);
  if (boolean !== undefined) return "boolean";
  if (value !== undefined && /^-?\d+(?:\.\d+)?$/.test(value.trim())) return "number";
  return "string";
}

function safeCustomConfigKeyPath(keyPath: string): boolean {
  if (!keyPath || keyPath.length > 120) return false;
  if (keyPath.split(".").some((part) => !safeTomlBareKey(part))) return false;
  if (keyPath.startsWith("auth.") || keyPath === "auth" || keyPath.includes("..")) return false;
  return true;
}

function sensitiveMutationKeyBlocker(keyPath: string): string | undefined {
  if (sensitiveKeyRe.test(keyPath)) {
    const tail = keyPath.split(".").at(-1) ?? keyPath;
    if (tail === "bearer_token_env_var" || tail === "env_vars" || tail === "env_http_headers") return undefined;
    return `Cannot safely edit sensitive-looking Codex config key: ${keyPath}`;
  }
  return undefined;
}

function reservedProviderMutationBlocker(keyPath: string): string | undefined {
  const match = /^model_providers\.([A-Za-z0-9_-]+)\./.exec(keyPath);
  if (!match) return undefined;
  const providerId = match[1]!;
  if (!reservedBuiltinProviderIds.has(providerId)) return undefined;
  if (providerId === "openai") {
    return "The built-in openai provider id is reserved; edit openai_base_url instead of model_providers.openai.*.";
  }
  return `The built-in ${providerId} provider id is reserved; use a custom provider id before editing model_providers.${providerId}.*.`;
}

function riskForCustomKeyPath(keyPath: string): CodexControlCenterItem["risk"] {
  if (
    keyPath === "approval_policy" ||
    keyPath === "sandbox_mode" ||
    keyPath === "web_search" ||
    keyPath.endsWith(".command") ||
    keyPath.endsWith(".url") ||
    keyPath.endsWith(".base_url") ||
    keyPath.includes("mcp_servers")
  ) {
    return "high";
  }
  if (keyPath.startsWith("model_providers.") || keyPath.startsWith("features.")) return "medium";
  return "medium";
}

function isSensitiveMutationValue(value: CodexControlMutationValue): boolean {
  if (Array.isArray(value)) return value.some((item) => isSensitiveMutationValue(item));
  return typeof value === "string" && (sensitiveTokenRe.test(value) || vendorTokenShapeRe.test(value));
}

function validateMutationRequest(request: CodexControlMutationRequest): void {
  if (!request || typeof request !== "object") throw new Error("Invalid Codex control mutation request.");
  if (!/^[a-f0-9]{64}$/i.test(request.expectedSha256)) {
    throw new Error("Invalid Codex control expected sha256.");
  }
  if (!Array.isArray(request.mutations) || request.mutations.length < 1 || request.mutations.length > 32) {
    throw new Error("Codex control mutation request must contain 1-32 mutations.");
  }
  for (const mutation of request.mutations) {
    if (!mutation || typeof mutation !== "object") throw new Error("Invalid Codex control mutation.");
    if (typeof mutation.itemId !== "string" || mutation.itemId.length > 120) {
      throw new Error("Invalid Codex control mutation item id.");
    }
    if (typeof mutation.keyPath !== "string" || mutation.keyPath.length > 120) {
      throw new Error("Invalid Codex control mutation key path.");
    }
    if (
      mutation.value !== null &&
      typeof mutation.value !== "string" &&
      typeof mutation.value !== "number" &&
      typeof mutation.value !== "boolean" &&
      !Array.isArray(mutation.value)
    ) {
      throw new Error("Invalid Codex control mutation value.");
    }
    if (Array.isArray(mutation.value) && mutation.value.some((item) => typeof item !== "string" || item.length > 200)) {
      throw new Error("Invalid Codex control mutation array value.");
    }
    if (mutation.comment !== undefined && typeof mutation.comment !== "string") {
      throw new Error("Invalid Codex control mutation comment.");
    }
  }
}

function validateMutationValue(
  descriptor: EditableConfigDescriptor,
  value: CodexControlMutationValue
): string | undefined {
  if (value === null) return undefined;
  if (descriptor.valueKind === "stringArray") {
    if (!Array.isArray(value)) return `${descriptor.keyPath} expects an array of strings.`;
    if (value.length > 64) return `${descriptor.keyPath} has too many entries.`;
    for (const item of value) {
      if (!item.trim() || item.length > 200) return `${descriptor.keyPath} has an invalid empty or long entry.`;
      if (isSensitiveMutationValue(item)) return `${descriptor.keyPath} contains a sensitive-looking value and is blocked.`;
    }
    return undefined;
  }
  if (descriptor.valueKind === "boolean") {
    return typeof value === "boolean" ? undefined : `${descriptor.keyPath} expects a boolean value.`;
  }
  if (descriptor.valueKind === "number") {
    return typeof value === "number" && Number.isFinite(value) ? undefined : `${descriptor.keyPath} expects a finite number.`;
  }
  if (typeof value !== "string") return `${descriptor.keyPath} expects a string value.`;
  if (value.length > 160) return `${descriptor.keyPath} value is too long.`;
  if (isSensitiveMutationValue(value)) return `${descriptor.keyPath} value looks sensitive and is blocked.`;
  if (descriptor.options?.length && !descriptor.allowCustom && !descriptor.options.includes(value)) {
    return `${descriptor.keyPath} must be one of: ${descriptor.options.join(", ")}`;
  }
  if (
    (descriptor.keyPath === "model" || descriptor.keyPath === "review_model") &&
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{1,80}$/.test(value)
  ) {
    return `${descriptor.keyPath} is not a valid model-style value.`;
  }
  if (descriptor.keyPath === "model_provider" && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(value)) {
    return `${descriptor.keyPath} is not a valid provider id.`;
  }
  if ((descriptor.keyPath.endsWith(".base_url") || descriptor.keyPath === "openai_base_url") && !/^https?:\/\/[^\s]+$/i.test(value)) {
    return `${descriptor.keyPath} expects an http(s) URL.`;
  }
  if (descriptor.keyPath.endsWith(".name") && value.length > 100) {
    return `${descriptor.keyPath} value is too long.`;
  }
  return undefined;
}

function isHighRiskMutation(
  descriptor: EditableConfigDescriptor,
  value: CodexControlMutationValue
): boolean {
  if (descriptor.risk === "high") return true;
  return (
    (descriptor.keyPath === "show_raw_agent_reasoning" && value === true) ||
    (descriptor.keyPath === "web_search" && value === "live") ||
    (descriptor.keyPath === "approval_policy" && value === "never") ||
    (descriptor.keyPath === "sandbox_mode" && value === "danger-full-access") ||
    (descriptor.keyPath === "windows.sandbox" && value === "elevated")
  );
}

function configValueForKey(keyPath: string, assignments: Map<string, TopLevelAssignment>): string | number | boolean | string[] | undefined {
  const descriptor = [...editableConfigItems.values()].find((item) => item.keyPath === keyPath);
  return configValueFromToml(assignments.get(keyPath)?.value, descriptor?.valueKind ?? "string");
}

function configValueForDescriptor(
  descriptor: EditableConfigDescriptor,
  assignments: Map<string, TopLevelAssignment>
): string | number | boolean | string[] | undefined {
  return configValueFromToml(assignments.get(descriptor.keyPath)?.value, descriptor.valueKind);
}

async function verifyCodexControlMutationWrite(
  configPath: string,
  mutations: CodexControlMutationRequest["mutations"]
): Promise<CodexControlWriteVerification> {
  const checkedKeys = mutations.map((mutation) => mutation.keyPath);
  const warnings: string[] = [];
  let content: string;
  try {
    content = await fs.promises.readFile(configPath, textEncoding);
  } catch (error) {
    return {
      status: "failed",
      checkedKeys,
      warnings,
      error: `verification_failed: could not read config.toml after write: ${error instanceof Error ? error.message : String(error)}`
    };
  }
  const validation = validateTomlShape(content);
  if (validation) {
    return {
      status: "failed",
      checkedKeys,
      warnings,
      error: `verification_failed: config.toml validation failed after write: ${validation}`
    };
  }
  const assignments = parseConfigAssignments(content, configPath);
  const mismatches: string[] = [];
  for (const mutation of mutations) {
    const descriptor = descriptorForMutation(mutation);
    if (!descriptor) {
      mismatches.push(`${mutation.keyPath}: descriptor missing during verification`);
      continue;
    }
    const actual = configValueFromToml(assignments.get(mutation.keyPath)?.value, descriptor.valueKind);
    if (mutation.value === null) {
      if (actual !== undefined) mismatches.push(`${mutation.keyPath}: expected removal`);
      continue;
    }
    if (!codexMutationValueEquals(actual, mutation.value)) {
      mismatches.push(`${mutation.keyPath}: expected ${safeVerificationValue(mutation.value)} but read ${safeVerificationValue(actual)}`);
    }
  }
  if (mismatches.length) {
    return {
      status: "failed",
      checkedKeys,
      warnings,
      error: `verification_failed: ${mismatches.join("; ")}`
    };
  }
  return { status: "passed", checkedKeys, warnings };
}

function codexMutationValueEquals(
  actual: string | number | boolean | string[] | undefined,
  expected: Exclude<CodexControlMutationValue, null>
): boolean {
  if (Array.isArray(actual) || Array.isArray(expected)) {
    return JSON.stringify(actual ?? []) === JSON.stringify(expected ?? []);
  }
  return actual === expected;
}

function safeVerificationValue(value: string | number | boolean | string[] | undefined | null): string {
  if (value === undefined) return "unset";
  if (value === null) return "remove";
  if (isSensitiveMutationValue(value)) return redactedMutationValue;
  return Array.isArray(value) ? JSON.stringify(value) : String(value);
}

function configValueFromToml(
  rawValue: string | undefined,
  kind: EditableConfigDescriptor["valueKind"]
): string | number | boolean | string[] | undefined {
  if (rawValue === undefined) return undefined;
  if (kind === "boolean") return booleanValue(rawValue);
  if (kind === "number") {
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (kind === "stringArray") return tomlStringArrayValue(rawValue);
  return stringTomlValue(rawValue) ?? rawValue.replace(/^["']|["']$/g, "");
}

function templateItem(
  itemId: string,
  value: CodexControlMutationValue,
  defaultSelected: boolean,
  comment: string
): CodexConfigTemplateItem {
  const descriptor = editableConfigItems.get(itemId);
  if (!descriptor) throw new Error(`Invalid built-in Codex config template item: ${itemId}`);
  return {
    itemId,
    keyPath: descriptor.keyPath,
    value,
    defaultSelected,
    comment: `AgentScope template: ${comment}`
  };
}

function templateEvidence(source: string): Evidence[] {
  return [
    {
      source,
      detail: "Built-in Codex config template derived from documented config.toml keys and AgentScope's structured control allowlist."
    }
  ];
}

function codexTemplateStoragePath(home: string): string {
  return path.join(agentScopeHome(home), "codex-control", templateStorageFileName);
}

async function readCustomCodexConfigTemplates(home: string): Promise<{ templates: CodexConfigTemplate[]; warnings: string[] }> {
  const storagePath = codexTemplateStoragePath(home);
  let content: string;
  try {
    const stat = await fs.promises.stat(storagePath);
    if (!stat.isFile() || stat.size > maxEditableBytes) {
      return { templates: [], warnings: [`Codex config template storage is not a small file: ${storagePath}`] };
    }
    content = await fs.promises.readFile(storagePath, textEncoding);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { templates: [], warnings: [] };
    return { templates: [], warnings: [`Could not read Codex config templates: ${storagePath}`] };
  }
  try {
    const parsed = JSON.parse(content) as unknown;
    const rawTemplates = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { templates?: unknown }).templates)
        ? (parsed as { templates: unknown[] }).templates
        : [];
    const templates = rawTemplates
      .map((entry) => sanitizeStoredTemplate(entry))
      .filter((entry): entry is CodexConfigTemplate => !!entry)
      .slice(0, maxCustomTemplateCount);
    return { templates, warnings: [] };
  } catch {
    return { templates: [], warnings: [`Codex config template storage is invalid JSON: ${storagePath}`] };
  }
}

async function writeCustomCodexConfigTemplates(home: string, templates: CodexConfigTemplate[]): Promise<void> {
  const storagePath = codexTemplateStoragePath(home);
  await fs.promises.mkdir(path.dirname(storagePath), { recursive: true });
  const body = `${JSON.stringify({ schemaVersion: 1, templates }, null, 2)}\n`;
  await writeTextAtomically(storagePath, body);
}

async function currentCodexConfigTemplate(home: string): Promise<CodexConfigTemplate> {
  const configPath = path.join(codexHome(home), "config.toml");
  const content = (await readCurrentBytes(configPath)).toString(textEncoding);
  const assignments = parseConfigAssignments(content, configPath);
  const items: CodexConfigTemplateItem[] = [];
  for (const [itemId, descriptor] of editableConfigItems.entries()) {
    const value = configValueForKey(descriptor.keyPath, assignments);
    if (value === undefined) continue;
    items.push({
      itemId,
      keyPath: descriptor.keyPath,
      value,
      defaultSelected: false,
      comment: "AgentScope current snapshot"
    });
  }
  return {
    id: currentConfigTemplateId,
    origin: "current",
    name: "Current config",
    description:
      "Read-only view of allowlisted values already present in config.toml. Unknown advanced settings stay untouched and are not copied.",
    risk: templateRisk(items),
    readonly: true,
    items,
    evidence: [
      {
        source: "codex.template.current",
        detail:
          "Current-state template is generated from allowlisted config.toml assignments only; unsupported advanced settings are preserved but not copied.",
        path: configPath
      }
    ]
  };
}

function sanitizeStoredTemplate(value: unknown): CodexConfigTemplate | undefined {
  if (!value || typeof value !== "object") return undefined;
  try {
    return sanitizeCustomTemplateDraft(value as CodexConfigTemplateDraft);
  } catch {
    return undefined;
  }
}

function sanitizeCustomTemplateDraft(draft: CodexConfigTemplateDraft): CodexConfigTemplate {
  if (!draft || typeof draft !== "object") throw new Error("Invalid Codex config template.");
  const rawId = typeof draft.id === "string" && draft.id.trim() ? draft.id.trim() : `custom.${slugifyTemplateId(draft.name)}-${Date.now().toString(36)}`;
  const id = rawId.startsWith("custom.") ? rawId : `custom.${rawId}`;
  if (!isSafeTemplateId(id) || id.startsWith("builtin.") || id.startsWith("current.")) throw new Error("Invalid Codex config template id.");
  const name = normalizeTemplateText(draft.name, 80, "Codex config template name");
  const description = normalizeTemplateText(draft.description ?? "", 240, "Codex config template description", true);
  if (!Array.isArray(draft.items) || draft.items.length < 1 || draft.items.length > maxCustomTemplateItems) {
    throw new Error(`Codex config template must contain 1-${maxCustomTemplateItems} items.`);
  }
  const seen = new Set<string>();
  const items: CodexConfigTemplateItem[] = [];
  for (const entry of draft.items) {
    const item = sanitizeTemplateItem(entry);
    if (seen.has(item.itemId)) continue;
    seen.add(item.itemId);
    items.push(item);
  }
  if (!items.length) throw new Error("Codex config template has no supported items.");
  const risk = templateRisk(items);
  return {
    id,
    origin: "custom",
    name,
    description,
    risk,
    readonly: false,
    items,
    evidence: [
      {
        source: "codex.template.custom",
        detail: "Custom Codex config template stored as AgentScope local metadata."
      }
    ]
  };
}

function sanitizeTemplateItem(entry: CodexConfigTemplateItem): CodexConfigTemplateItem {
  if (!entry || typeof entry !== "object") throw new Error("Invalid Codex config template item.");
  const itemId = typeof entry.itemId === "string" ? entry.itemId.trim() : "";
  const keyPath = typeof entry.keyPath === "string" ? entry.keyPath.trim() : "";
  const descriptor = descriptorForMutation({ itemId, keyPath });
  if (!descriptor) throw new Error(`Unsupported Codex config template item: ${itemId}`);
  if (keyPath !== descriptor.keyPath) throw new Error(`Codex config template item key mismatch: ${itemId}`);
  const validation = validateMutationValue(descriptor, entry.value);
  if (validation) throw new Error(validation);
  return {
    itemId,
    keyPath: descriptor.keyPath,
    value: entry.value,
    defaultSelected: entry.defaultSelected !== false,
    comment: sanitizeTemplateComment(entry.comment)
  };
}

async function resolveConfigTemplateForPreview(
  request: CodexConfigTemplatePreviewRequest,
  home: string
): Promise<CodexConfigTemplate> {
  if (request.template) return sanitizeCustomTemplateDraft(request.template);
  const id = request.templateId;
  if (!id || !isSafeTemplateId(id)) throw new Error("Invalid Codex config template id.");
  const list = await listCodexConfigTemplates(home);
  const template = list.templates.find((entry) => entry.id === id);
  if (!template) throw new Error(`Codex config template not found: ${id}`);
  return template;
}

function templateRisk(items: CodexConfigTemplateItem[]): CodexControlCenterItem["risk"] {
  let risk: CodexControlCenterItem["risk"] = "low";
  for (const item of items) {
    const descriptor = descriptorForMutation(item);
    if (!descriptor) return "blocked";
    if (isHighRiskMutation(descriptor, item.value)) return "high";
    if (descriptor.risk === "medium" && risk === "low") risk = "medium";
  }
  return risk;
}

function isSafeTemplateId(id: string): boolean {
  return /^(?:current|builtin|custom)\.[A-Za-z0-9][A-Za-z0-9._-]{1,95}$/.test(id);
}

function slugifyTemplateId(value: string): string {
  return (value || "template")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "template";
}

function normalizeTemplateText(value: string, maxLength: number, label: string, allowEmpty = false): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!allowEmpty && !normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maxLength) throw new Error(`${label} is too long.`);
  if (isSensitiveDocumentLine(normalized)) throw new Error(`${label} looks sensitive and is blocked.`);
  return normalized;
}

function sanitizeTemplateComment(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized || isSensitiveDocumentLine(normalized)) return undefined;
  return normalized.replace(/#/g, "").slice(0, 160);
}

function commentLines(comment?: string): string[] {
  const sanitized = sanitizeTemplateComment(comment);
  return sanitized ? [`# ${sanitized}`] : [];
}

function tomlScalarReplacementSafe(rawValue: string): boolean {
  const trimmed = rawValue.trim();
  return (
    /^"((?:\\"|[^"])*)"|'([^']*)'$/.test(trimmed) ||
    /^\[(?:\s*(?:"(?:\\"|[^"])*"|'[^']*')\s*,?)*\]$/.test(trimmed) ||
    /^(true|false)$/i.test(trimmed) ||
    /^-?\d+(?:\.\d+)?$/.test(trimmed) ||
    /^[A-Za-z0-9._:-]+$/.test(trimmed)
  );
}

function tomlValueReplacementSafeForKind(rawValue: string, kind: EditableConfigDescriptor["valueKind"]): boolean {
  if (kind === "stringArray") return Array.isArray(tomlStringArrayValue(rawValue));
  return tomlScalarReplacementSafe(rawValue);
}

function applyConfigMutation(content: string, keyPath: string, value: CodexControlMutationValue, comment?: string): string {
  if (value === null) return removeConfigKey(content, keyPath);
  return setConfigValue(content, keyPath, tomlValue(value), comment);
}

function setConfigValue(content: string, keyPath: string, encodedValue: string, comment?: string): string {
  const pathParts = keyPath.split(".");
  const key = pathParts.pop();
  if (!key) throw new Error(`Invalid Codex config key path: ${keyPath}`);
  const tableName = pathParts.join(".");
  return tableName
    ? setTableTomlValue(content, tableName, key, encodedValue, comment)
    : setTopLevelTomlValue(content, key, encodedValue, comment);
}

function removeConfigKey(content: string, keyPath: string): string {
  const pathParts = keyPath.split(".");
  const key = pathParts.pop();
  if (!key) throw new Error(`Invalid Codex config key path: ${keyPath}`);
  const tableName = pathParts.join(".");
  return tableName ? removeTableTomlKey(content, tableName, key) : removeTopLevelTomlKey(content, key);
}

function setTopLevelTomlValue(content: string, key: string, encodedValue: string, comment?: string): string {
  assertSafeTomlPatch(content, key);
  const normalized = normalizeTrailingNewline(content);
  const lines = normalized.split(/\r?\n/);
  let insertAt = 0;
  let inTopLevel = true;
  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? "";
    const stripped = stripTomlComment(rawLine).trim();
    if (!stripped) {
      if (inTopLevel) insertAt = index + 1;
      continue;
    }
    if (/^\[+/.test(stripped)) {
      inTopLevel = false;
      break;
    }
    if (inTopLevel && assignmentKey(rawLine) === key) {
      lines[index] = replaceTomlAssignmentValue(rawLine, key, encodedValue);
      return lines.join("\n");
    }
    if (inTopLevel) insertAt = index + 1;
  }
  lines.splice(insertAt, 0, ...commentLines(comment), `${key} = ${encodedValue}`);
  return lines.join("\n");
}

function setTableTomlValue(content: string, tableName: string, key: string, encodedValue: string, comment?: string): string {
  assertSafeTomlPatch(content, `${tableName}.${key}`);
  const lines = normalizeTrailingNewline(content).split(/\r?\n/);
  const dottedKey = `${tableName}.${key}`;
  for (const { lineIndex, assignment } of topLevelAssignments(lines)) {
    if (assignment.key === dottedKey) {
      lines[lineIndex] = replaceTomlAssignmentValue(lines[lineIndex] ?? "", dottedKey, encodedValue);
      return lines.join("\n");
    }
  }
  const range = findTomlTableRange(lines, tableName);
  const tableStart = range?.start ?? -1;
  const tableEnd = range?.end ?? lines.length;
  if (tableStart < 0) {
    const needsBlank = lines.length > 1 && (lines[lines.length - 2] ?? "").trim();
    lines.splice(lines.length - 1, 0, ...(needsBlank ? [""] : []), `[${tableName}]`, ...commentLines(comment), `${key} = ${encodedValue}`);
    return lines.join("\n");
  }
  for (let index = tableStart + 1; index < tableEnd; index += 1) {
    if (assignmentKey(lines[index] ?? "") === key) {
      lines[index] = replaceTomlAssignmentValue(lines[index] ?? "", key, encodedValue);
      return lines.join("\n");
    }
  }
  lines.splice(tableEnd, 0, ...commentLines(comment), `${key} = ${encodedValue}`);
  return lines.join("\n");
}

function removeTableTomlKey(content: string, tableName: string, key: string): string {
  assertSafeTomlPatch(content, `${tableName}.${key}`);
  const lines = content.split(/\r?\n/);
  const dottedKey = `${tableName}.${key}`;
  for (const { lineIndex, assignment } of topLevelAssignments(lines)) {
    if (assignment.key === dottedKey) {
      const next = [...lines];
      next.splice(lineIndex, 1);
      return next.join("\n");
    }
  }
  const range = findTomlTableRange(lines, tableName);
  if (!range) return content;
  const next = [...lines];
  for (let index = range.start + 1; index < range.end; index += 1) {
    if (assignmentKey(next[index] ?? "") === key) {
      next.splice(index, 1);
      return next.join("\n");
    }
  }
  return content;
}

function tableHeaderRe(tableName: string): RegExp {
  return new RegExp(`^\\[\\s*${escapeRegExp(tableName)}\\s*\\]$`);
}

interface TomlTableRange {
  start: number;
  end: number;
}

function safeConfigPatchBlocker(content: string, keyPath: string, value: CodexControlMutationValue): string | undefined {
  try {
    if (value !== null) tomlValue(value);
    assertSafeTomlPatch(content, keyPath);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function assertSafeTomlPatch(content: string, keyPath: string): void {
  const pathParts = keyPath.split(".");
  const key = pathParts.pop();
  if (!key || pathParts.some((part) => !safeTomlBareKey(part)) || !safeTomlBareKey(key)) {
    throw new Error(`Cannot safely edit unsupported TOML key path: ${keyPath}`);
  }
  const tableName = pathParts.join(".");
  const lines = normalizeTrailingNewline(content).split(/\r?\n/);
  const duplicateCount = countConfigAssignments(content, keyPath);
  if (duplicateCount > 1) {
    throw new Error(`Cannot safely edit ${keyPath}: duplicate assignments exist.`);
  }
  if (tableName) {
    const tableConflict = tablePathConflict(lines, tableName);
    if (tableConflict) throw new Error(tableConflict);
    const dottedAssignment = topLevelAssignment(lines, keyPath);
    if (dottedAssignment && !tomlScalarReplacementSafe(dottedAssignment.value)) {
      throw new Error(`Cannot safely edit ${keyPath}: current dotted value is complex TOML.`);
    }
    const range = findTomlTableRange(lines, tableName);
    if (range && hasInlineTableAssignment(lines, range, key)) {
      throw new Error(`Cannot safely edit ${keyPath}: inline table value uses the same key.`);
    }
  } else {
    const existing = topLevelAssignment(lines, key);
    if (existing && !tomlScalarReplacementSafe(existing.value)) {
      throw new Error(`Cannot safely edit ${keyPath}: current value is complex TOML.`);
    }
    if (hasTopLevelDottedDescendant(lines, key)) {
      throw new Error(`Cannot safely edit ${keyPath}: dotted child keys already exist.`);
    }
  }
}

function countConfigAssignments(content: string, keyPath: string): number {
  let count = 0;
  let currentTable = "";
  for (const rawLine of content.split(/\r?\n/)) {
    const stripped = stripTomlComment(rawLine).trim();
    if (!stripped) continue;
    const table = tableNameFromLine(stripped);
    if (table !== undefined) {
      currentTable = table;
      continue;
    }
    const key = assignmentKey(rawLine);
    if (!key) continue;
    const fullKey = currentTable ? `${currentTable}.${key}` : key;
    if (fullKey === keyPath) count += 1;
  }
  return count;
}

function tablePathConflict(lines: string[], tableName: string): string | undefined {
  const parts = tableName.split(".");
  for (let depth = 1; depth < parts.length; depth += 1) {
    const parentTable = parts.slice(0, depth).join(".");
    const childKey = parts[depth]!;
    const parentRange = findTomlTableRange(lines, parentTable);
    if (parentRange && hasInlineTableAssignment(lines, parentRange, childKey)) {
      return `Cannot safely edit ${tableName}: parent table [${parentTable}] has inline value for ${childKey}.`;
    }
  }
  const topKey = parts[0]!;
  if (hasTopLevelInlineOrScalar(lines, topKey)) {
    return `Cannot safely edit ${tableName}: top-level ${topKey} already exists as a value.`;
  }
  return undefined;
}

function findTomlTableRange(lines: string[], tableName: string): TomlTableRange | undefined {
  let start = -1;
  let end = lines.length;
  for (let index = 0; index < lines.length; index += 1) {
    const stripped = stripTomlComment(lines[index] ?? "").trim();
    if (!stripped) continue;
    if (/^\[\[/.test(stripped) && tableNameFromLine(stripped) === tableName) {
      throw new Error(`Cannot safely edit [${tableName}]: array table exists.`);
    }
    if (tableHeaderRe(tableName).test(stripped)) {
      if (start >= 0) throw new Error(`Cannot safely edit [${tableName}]: duplicate table exists.`);
      start = index;
      continue;
    }
    if (start >= 0 && index > start && /^\[+/.test(stripped)) {
      end = index;
      break;
    }
  }
  return start >= 0 ? { start, end } : undefined;
}

function hasInlineTableAssignment(lines: string[], range: TomlTableRange, key: string): boolean {
  for (let index = range.start + 1; index < range.end; index += 1) {
    const assignment = parseAssignmentLine(lines[index] ?? "");
    if (!assignment || assignment.key !== key) continue;
    return !tomlScalarReplacementSafe(assignment.value);
  }
  return false;
}

function hasTopLevelInlineOrScalar(lines: string[], key: string): boolean {
  return !!topLevelAssignment(lines, key);
}

function hasTopLevelDottedDescendant(lines: string[], key: string): boolean {
  for (const { assignment } of topLevelAssignments(lines)) {
    if (assignment?.key.startsWith(`${key}.`)) return true;
  }
  return false;
}

function topLevelAssignment(lines: string[], key: string):
  | {
      key: string;
      value: string;
      valueStart: number;
      valueEnd: number;
    }
  | undefined {
  for (const { assignment } of topLevelAssignments(lines)) {
    if (assignment?.key === key) return assignment;
  }
  return undefined;
}

function* topLevelAssignments(lines: string[]): Iterable<{ lineIndex: number; assignment: NonNullable<ReturnType<typeof parseAssignmentLine>> }> {
  for (const [lineIndex, rawLine] of lines.entries()) {
    const stripped = stripTomlComment(rawLine).trim();
    if (stripped && /^\[+/.test(stripped)) return;
    const assignment = parseAssignmentLine(rawLine);
    if (assignment) yield { lineIndex, assignment };
  }
}

function replaceTomlAssignmentValue(rawLine: string, key: string, encodedValue: string): string {
  const parsed = parseAssignmentLine(rawLine);
  if (!parsed || parsed.key !== key) {
    throw new Error(`Cannot safely replace TOML assignment for ${key}.`);
  }
  return `${rawLine.slice(0, parsed.valueStart)}${encodedValue}${rawLine.slice(parsed.valueEnd)}`;
}

function assignmentKey(rawLine: string): string | undefined {
  return parseAssignmentLine(rawLine)?.key;
}

function parseAssignmentLine(rawLine: string):
  | {
      key: string;
      value: string;
      valueStart: number;
      valueEnd: number;
    }
  | undefined {
  const lineWithoutComment = stripTomlComment(rawLine);
  const match = /^(\s*)([A-Za-z0-9_.-]+)\s*=\s*(.*?)(\s*)$/.exec(lineWithoutComment);
  if (!match) return undefined;
  const key = match[2]!;
  const beforeValue = lineWithoutComment.length - match[3]!.length - match[4]!.length;
  const valueEnd = lineWithoutComment.length - match[4]!.length;
  return {
    key,
    value: match[3]!.trim(),
    valueStart: beforeValue,
    valueEnd
  };
}

function tableNameFromLine(strippedLine: string): string | undefined {
  const match = /^\[+\s*([^\]]+?)\s*\]+$/.exec(strippedLine);
  return match?.[1]?.trim();
}

function safeTomlBareKey(key: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(key);
}

function tomlValue(value: string | number | boolean | string[]): string {
  if (Array.isArray(value)) return tomlStringArray(value);
  return tomlScalar(value);
}

function tomlScalar(value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  return tomlString(value);
}

function tomlStringArray(values: string[]): string {
  return `[${values.map((value) => tomlString(value)).join(", ")}]`;
}

function parseConfigAssignments(content: string, filePath: string): Map<string, TopLevelAssignment> {
  const assignments = new Map<string, TopLevelAssignment>();
  let currentTable = "";
  for (const [index, rawLine] of content.split(/\r?\n/).entries()) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;
    const tableMatch = /^\[+\s*([^\]]+?)\s*\]+$/.exec(line);
    if (tableMatch) {
      currentTable = tableMatch[1]!;
      continue;
    }
    const match = /^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/.exec(line);
    if (!match) continue;
    const key = currentTable ? `${currentTable}.${match[1]!}` : match[1]!;
    assignments.set(key, {
      key,
      value: match[2]!.trim(),
      line: index + 1,
      raw: rawLine,
      path: filePath
    });
  }
  return assignments;
}

interface TopLevelAssignment {
  key: string;
  value: string;
  line: number;
  raw: string;
  path: string;
}

interface ConfigTableAssignment {
  key: string;
  value: string;
  line: number;
  raw: string;
  path: string;
}

interface ConfigTable {
  name: string;
  line: number;
  keys: Map<string, ConfigTableAssignment>;
}

function parseConfigTables(content: string, filePath: string): Map<string, ConfigTable> {
  const tables = new Map<string, ConfigTable>();
  let current: ConfigTable | undefined;
  for (const [index, rawLine] of content.split(/\r?\n/).entries()) {
    const stripped = stripTomlComment(rawLine).trim();
    if (!stripped) continue;
    const table = tableNameFromLine(stripped);
    if (table !== undefined) {
      current = { name: table, line: index + 1, keys: new Map() };
      if (!tables.has(table)) tables.set(table, current);
      continue;
    }
    if (!current) continue;
    const assignment = parseAssignmentLine(rawLine);
    if (!assignment) continue;
    current.keys.set(assignment.key, {
      key: assignment.key,
      value: assignment.value,
      line: index + 1,
      raw: rawLine,
      path: filePath
    });
  }
  return tables;
}

function unknownConfigEntries(
  assignments: Map<string, TopLevelAssignment>,
  tables: Map<string, ConfigTable>,
  configPath: string
): CodexConfigUnknownEntry[] {
  const knownTopLevel = new Set([...editableConfigItems.values()].map((item) => item.keyPath).filter((key) => !key.includes(".")));
  const knownTableKeys = new Set<string>();
  for (const descriptor of editableConfigItems.values()) {
    if (!descriptor.keyPath.includes(".")) continue;
    knownTableKeys.add(descriptor.keyPath);
  }
  const out: CodexConfigUnknownEntry[] = [];
  for (const assignment of assignments.values()) {
    if (assignment.key.includes(".")) continue;
    const parsed = parseMcpKeyPath(assignment.key);
    const isKnownMcp = parsed && (mcpUserConfigEditableFields.has(parsed.field) || mcpPluginPolicyEditableFields.has(parsed.field));
    if (knownTopLevel.has(assignment.key) || knownTableKeys.has(assignment.key) || isKnownMcp) continue;
    out.push(unknownEntryFromAssignment(assignment.key, undefined, assignment, configPath));
  }
  for (const table of tables.values()) {
    const mcpDirect = /^mcp_servers\.([A-Za-z0-9_-]{1,80})$/.test(table.name);
    const mcpPlugin = /^plugins\.[A-Za-z0-9_-]{1,80}\.mcp_servers\.[A-Za-z0-9_-]{1,80}$/.test(table.name);
    for (const assignment of table.keys.values()) {
      const fullKey = `${table.name}.${assignment.key}`;
      if (knownTableKeys.has(fullKey)) continue;
      if (mcpDirect && mcpUserConfigEditableFields.has(assignment.key)) continue;
      if (mcpPlugin && mcpPluginPolicyEditableFields.has(assignment.key)) continue;
      out.push(unknownEntryFromAssignment(fullKey, table.name, assignment, configPath));
    }
  }
  return out.sort((left, right) => left.line - right.line || left.keyPath.localeCompare(right.keyPath)).slice(0, 200);
}

function unknownEntryFromAssignment(
  keyPath: string,
  table: string | undefined,
  assignment: TopLevelAssignment | ConfigTableAssignment,
  configPath: string
): CodexConfigUnknownEntry {
  const sensitive = isSensitiveTomlLine(assignment.raw);
  return {
    id: `unknown.${assignment.line}.${keyPath}`,
    table,
    keyPath,
    line: assignment.line,
    valueKind: tomlUnknownValueKind(assignment.value),
    sensitive,
    displayValue: sensitive ? undefined : truncateText(assignment.value.trim(), 120),
    warnings: [
      sensitive
        ? "Unknown config entry has a sensitive-looking key or value and stays read-only."
        : "Unknown config entry is preserved. Scalar values can be edited as unverified advanced settings."
    ],
    evidence: [
      {
        source: "codex.config.unknown",
        detail: `Unknown config key ${keyPath} was found and preserved.`,
        path: configPath,
        field: keyPath
      }
    ]
  };
}

function unknownWorkbenchItem(
  entry: CodexConfigUnknownEntry,
  assignments: Map<string, TopLevelAssignment>,
  configPath: string,
  editableAllowed: boolean
): CodexConfigWorkbenchItem | undefined {
  if (entry.sensitive) return undefined;
  if (!safeCustomConfigKeyPath(entry.keyPath)) return undefined;
  const raw = assignments.get(entry.keyPath)?.value;
  if (raw === undefined) return undefined;
  if (entry.valueKind !== "scalar" && entry.valueKind !== "array") return undefined;
  const valueKind = valueKindForUnknownEntry(entry, assignments);
  const currentValue = configValueFromToml(raw, valueKind);
  if (currentValue === undefined) return undefined;
  const warnings = [
    `${entry.keyPath} is an unverified advanced Codex config key; AgentScope can write it but cannot prove Codex will use it.`,
    codexConfigNewSessionWarning,
    ...entry.warnings
  ];
  const reserved = reservedProviderMutationBlocker(entry.keyPath);
  if (reserved) warnings.unshift(reserved);
  const sensitive = sensitiveMutationKeyBlocker(entry.keyPath);
  if (sensitive) warnings.unshift(sensitive);
  return {
    id: `config.unknown.${sha256(entry.keyPath).slice(0, 16)}`,
    group: "unknown",
    keyPath: entry.keyPath,
    table: entry.table,
    label: entry.keyPath,
    detail: "Unverified advanced Codex config key preserved from config.toml.",
    valueKind,
    currentValue,
    enabled: true,
    editable: editableAllowed && !reserved && !sensitive,
    risk: sensitive || reserved ? "blocked" : riskForCustomKeyPath(entry.keyPath),
    source: "current_code",
    supportLevel: "unverified",
    effectiveNote: codexConfigNewSessionWarning,
    warnings,
    evidence: [
      {
        source: "codex.config.unknown",
        detail: `Scalar unknown config key ${entry.keyPath} is editable with unverified warnings.`,
        path: configPath,
        field: entry.keyPath
      }
    ]
  };
}

function tomlUnknownValueKind(rawValue: string): CodexConfigUnknownEntry["valueKind"] {
  const trimmed = rawValue.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) return "array";
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return "inline";
  if (tomlScalarReplacementSafe(trimmed)) return "scalar";
  return "unknown";
}

function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 3))}...` : value;
}

function configItemEvidence(configPath: string, keyPath: string, assignment: TopLevelAssignment | undefined): Evidence[] {
  return [
    assignment
      ? {
          source: "codex.control.config.toml",
          detail: `Config key ${keyPath} found at line ${assignment.line}.`,
          path: configPath,
          field: keyPath
        }
      : {
          source: "codex.control.config.toml",
          detail: `Config key ${keyPath} is not present; Codex will use defaults, profile, project, or CLI overrides.`,
          path: configPath,
          field: keyPath
        }
  ];
}

function mcpWorkbenchWarnings(server: { source: "user_config" | "plugin_config" }, field: string, rawValue?: string): string[] {
  const warnings: string[] = [];
  if (server.source === "plugin_config" && !mcpPluginPolicyEditableFields.has(field)) warnings.push("Plugin-owned MCP transport is read-only.");
  if (rawValue && isSensitiveTomlLine(`${field} = ${rawValue}`)) warnings.push("Sensitive-looking MCP value is not displayed or edited.");
  if (field === "command" || field === "args" || field === "url") warnings.push("MCP transport changes are high risk and require confirmation.");
  return warnings;
}

function parseTopLevelAssignments(content: string, filePath: string): Map<string, TopLevelAssignment> {
  const assignments = new Map<string, TopLevelAssignment>();
  let inTopLevel = true;
  for (const [index, rawLine] of content.split(/\r?\n/).entries()) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;
    if (/^\[+/.test(line)) {
      inTopLevel = false;
      continue;
    }
    if (!inTopLevel) continue;
    const match = /^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/.exec(line);
    if (!match) continue;
    assignments.set(match[1]!, {
      key: match[1]!,
      value: match[2]!.trim(),
      line: index + 1,
      raw: rawLine,
      path: filePath
    });
  }
  return assignments;
}

function modeConfigSnapshot(
  configPath: string,
  bytes: Buffer,
  assignments: Map<string, TopLevelAssignment>,
  sensitiveLines: number[]
): CodexModeConfigSnapshot {
  const modelAssignment = assignments.get("model");
  const reviewModelAssignment = assignments.get("review_model");
  const model = safeModeModelValue(modelAssignment, sensitiveLines);
  const reviewModel = safeModeModelValue(reviewModelAssignment, sensitiveLines);
  const defaultReasoning = stringTomlValue(assignments.get("model_reasoning_effort")?.value);
  const planReasoning = stringTomlValue(assignments.get("plan_mode_reasoning_effort")?.value);
  const modes: Record<CodexModeId, CodexModeValue> = {
    default: {
      model,
      reasoningEffort: defaultReasoning,
      source: model || defaultReasoning ? "config" : "unset",
      evidence: modeEvidence(configPath, [
        assignments.get("model"),
        assignments.get("model_reasoning_effort")
      ])
    },
    plan: {
      model,
      reasoningEffort: planReasoning ?? defaultReasoning,
      source: planReasoning ? "config" : defaultReasoning || model ? "inherits_default" : "unset",
      evidence: modeEvidence(configPath, [
        assignments.get("plan_mode_reasoning_effort"),
        assignments.get("model"),
        assignments.get("model_reasoning_effort")
      ])
    },
    review: {
      model: reviewModel ?? model,
      reasoningEffort: defaultReasoning,
      source: reviewModel ? "config" : model || defaultReasoning ? "inherits_default" : "unset",
      evidence: modeEvidence(configPath, [
        assignments.get("review_model"),
        assignments.get("model"),
        assignments.get("model_reasoning_effort")
      ])
    }
  };
  return {
    configPath,
    sha256: sha256(bytes),
    modes,
    recommendedModels,
    reasoningEffortValues,
    planReasoningEffortValues,
    warnings: sensitiveLines.length
      ? ["Sensitive key names were detected; mode defaults are read-only until config.toml is edited externally."]
      : [],
    evidence: [
      {
        source: "codex.control.official_manual",
        detail:
          "Codex manual documents model, review_model, model_reasoning_effort, and plan_mode_reasoning_effort in config.toml.",
        path: configPath,
        field: "model,review_model,model_reasoning_effort,plan_mode_reasoning_effort"
      }
    ]
  };
}

function modeEvidence(configPath: string, assignments: Array<TopLevelAssignment | undefined>): Evidence[] {
  const present = assignments.filter((assignment): assignment is TopLevelAssignment => !!assignment);
  if (!present.length) {
    return [
      {
        source: "codex.control.mode_config",
        detail: "Mode setting is not present in user config; Codex will use profile, project, CLI, or built-in defaults.",
        path: configPath
      }
    ];
  }
  return present.map((assignment) => ({
    source: "codex.control.config.toml",
    detail: `Top-level config key ${assignment.key} found at line ${assignment.line}.`,
    path: assignment.path,
    field: assignment.key
  }));
}

function safeModeModelValue(assignment: TopLevelAssignment | undefined, sensitiveLines: number[]): string | undefined {
  if (!assignment) return undefined;
  const value = stringTomlValue(assignment.value);
  if (!value) return undefined;
  if (sensitiveLines.includes(assignment.line)) return undefined;
  if (isSensitiveDocumentLine(value)) return undefined;
  return value;
}

function applyModePatch(content: string, patch: CodexModeConfigPatch): string {
  let next = normalizeTrailingNewline(content);
  const entries: Array<[string, string | null | undefined]> = [
    ["model", patch.defaultModel],
    ["model_reasoning_effort", patch.defaultReasoningEffort],
    ["plan_mode_reasoning_effort", patch.planReasoningEffort],
    ["review_model", patch.reviewModel]
  ];
  for (const [key, value] of entries) {
    if (value === undefined) continue;
    next = value === null ? removeTopLevelTomlKey(next, key) : setTopLevelTomlString(next, key, value);
  }
  return next;
}

function setTopLevelTomlString(content: string, key: string, value: string): string {
  return setTopLevelTomlValue(content, key, tomlString(value));
}

function removeTopLevelTomlKey(content: string, key: string): string {
  assertSafeTomlPatch(content, key);
  const lines = content.split(/\r?\n/);
  let inTopLevel = true;
  const next: string[] = [];
  for (const rawLine of lines) {
    const stripped = stripTomlComment(rawLine).trim();
    if (stripped && /^\[+/.test(stripped)) inTopLevel = false;
    if (inTopLevel && assignmentKey(rawLine) === key) continue;
    next.push(rawLine);
  }
  return next.join("\n");
}

function normalizeTrailingNewline(content: string): string {
  return content.endsWith("\n") ? content : `${content}\n`;
}

function validateModePatch(patch: CodexModeConfigPatch): void {
  const modelEntries = [
    ["defaultModel", patch.defaultModel],
    ["reviewModel", patch.reviewModel]
  ];
  for (const [key, value] of modelEntries) {
    if (value === null) continue;
    if (typeof value === "string" && isSensitiveDocumentLine(value)) {
      throw new Error(`Invalid Codex model value for ${key}: sensitive-looking value.`);
    }
    if (value !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._:-]{1,80}$/.test(value)) {
      throw new Error(`Invalid Codex model value for ${key}.`);
    }
  }
  if (
    patch.defaultReasoningEffort !== null &&
    patch.defaultReasoningEffort !== undefined &&
    !reasoningEffortValues.includes(patch.defaultReasoningEffort)
  ) {
    throw new Error("Invalid Codex reasoning effort for defaultReasoningEffort.");
  }
  if (
    patch.planReasoningEffort !== null &&
    patch.planReasoningEffort !== undefined &&
    !planReasoningEffortValues.includes(patch.planReasoningEffort)
  ) {
    throw new Error("Invalid Codex reasoning effort for planReasoningEffort.");
  }
}

function changedModeKeyPaths(patch: CodexModeConfigPatch): string[] {
  const keys: string[] = [];
  if (patch.defaultModel !== undefined) keys.push("model");
  if (patch.defaultReasoningEffort !== undefined) keys.push("model_reasoning_effort");
  if (patch.planReasoningEffort !== undefined) keys.push("plan_mode_reasoning_effort");
  if (patch.reviewModel !== undefined) keys.push("review_model");
  return keys;
}

function stringTomlValue(value?: string): string | undefined {
  if (!value) return undefined;
  const quoted = /^"((?:\\"|[^"])*)"|'([^']*)'/.exec(value);
  if (quoted) return unescapeTomlString(quoted[1] ?? quoted[2] ?? "");
  const bare = /^[A-Za-z0-9._:-]+/.exec(value)?.[0];
  return bare || undefined;
}

function tomlStringArrayValue(value?: string): string[] | undefined {
  if (!value?.trim().startsWith("[")) return undefined;
  const out: string[] = [];
  for (const match of value.matchAll(/"((?:\\"|[^"])*)"|'([^']*)'/g)) {
    const item = unescapeTomlString(match[1] ?? match[2] ?? "").trim();
    if (item && !isSensitiveMutationValue(item)) out.push(item);
  }
  return out;
}

function unescapeTomlString(value: string): string {
  return value.replace(/\\\\/g, "\\").replace(/\\"/g, '"');
}

function tomlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function validateTomlShape(content: string): string | undefined {
  const tables = new Set<string>();
  let state: TomlLineScanState = { single: false, double: false, square: 0, curly: 0 };
  for (const [index, rawLine] of content.split(/\r?\n/).entries()) {
    const lineNumber = index + 1;
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;
    const inContinuation = tomlLineScanOpen(state);
    const scanned = scanTomlLine(line, state);
    if (scanned.error) return `line ${lineNumber} ${scanned.error}`;
    state = scanned.state;
    if (inContinuation) continue;
    const tableMatch = /^\[+\s*([^\]]+?)\s*\]+$/.exec(line);
    if (tableMatch) {
      const table = tableMatch[1]!;
      const arrayTable = line.startsWith("[[");
      if (!arrayTable && tables.has(table)) return `line ${lineNumber} repeats table [${table}]`;
      if (!arrayTable) tables.add(table);
      continue;
    }
    if (tomlAssignmentStart(line)) continue;
    return `line ${lineNumber} is not a TOML table or key/value assignment`;
  }
  if (tomlLineScanOpen(state)) return "file ended inside a TOML multiline value";
  return undefined;
}

interface TomlLineScanState {
  single: boolean;
  double: boolean;
  square: number;
  curly: number;
}

function tomlLineScanOpen(state: TomlLineScanState): boolean {
  return state.single || state.double || state.square > 0 || state.curly > 0;
}

function scanTomlLine(
  line: string,
  initial: TomlLineScanState
): { state: TomlLineScanState; error?: string | undefined } {
  const state = { ...initial };
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (char === "'" && !state.double && line[index - 1] !== "\\") {
      state.single = !state.single;
      continue;
    }
    if (char === '"' && !state.single && line[index - 1] !== "\\") {
      state.double = !state.double;
      continue;
    }
    if (state.single || state.double) continue;
    if (char === "[") state.square += 1;
    if (char === "]") state.square -= 1;
    if (char === "{") state.curly += 1;
    if (char === "}") state.curly -= 1;
    if (state.square < 0 || state.curly < 0) return { state, error: "has unbalanced quotes or brackets" };
  }
  return { state };
}

function tomlAssignmentStart(line: string): boolean {
  return /^(?:[A-Za-z0-9_-]+|"[^"]+"|'[^']+')(?:\.(?:[A-Za-z0-9_-]+|"[^"]+"|'[^']+'))*\s*=/.test(line);
}

function stripTomlComment(line: string): string {
  let quoted = false;
  let quote = "";
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if ((char === "'" || char === '"') && line[index - 1] !== "\\") {
      if (!quoted) {
        quoted = true;
        quote = char;
      } else if (quote === char) {
        quoted = false;
        quote = "";
      }
    }
    if (char === "#" && !quoted) return line.slice(0, index);
  }
  return line;
}

function booleanValue(value?: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (/^true\b/i.test(value)) return true;
  if (/^false\b/i.test(value)) return false;
  return undefined;
}

function sensitiveLineNumbers(content: string): number[] {
  const lines: number[] = [];
  content.split(/\r?\n/).forEach((rawLine, index) => {
    if (isBlockingSensitiveTomlLine(rawLine)) lines.push(index + 1);
  });
  return lines;
}

function sensitiveDocumentLineNumbers(content: string): number[] {
  const lines: number[] = [];
  content.split(/\r?\n/).forEach((rawLine, index) => {
    if (isSensitiveDocumentLine(rawLine)) lines.push(index + 1);
  });
  return lines;
}

function redactSensitiveDocumentLines(content: string): string {
  return content
    .split(/\r?\n/)
    .map((line) => {
      const match = /^(\s*[^=]+?=)/.exec(line);
      if (match && isSensitiveTomlLine(line)) return `${match[1]} "*** redacted by AgentScope ***"`;
      return isSensitiveDocumentLine(line) ? "*** redacted by AgentScope ***" : line;
    })
    .join("\n");
}

function isSensitiveTomlLine(rawLine: string): boolean {
  const line = stripTomlComment(rawLine).trim();
  if (!line.includes("=")) return false;
  const key = /^([A-Za-z0-9_.-]+)\s*=/.exec(line)?.[1];
  if (key && sensitiveKeyRe.test(key)) return true;
  const [, value = ""] = line.split(/=(.*)/s);
  return sensitiveTokenRe.test(value);
}

function isBlockingSensitiveTomlLine(rawLine: string): boolean {
  const line = stripTomlComment(rawLine).trim();
  if (!line.includes("=")) return vendorTokenShapeRe.test(line);
  const match = /^([A-Za-z0-9_.-]+)\s*=\s*(.*)$/.exec(line);
  if (!match) return vendorTokenShapeRe.test(line);
  const key = match[1] ?? "";
  const value = match[2] ?? "";
  if (sensitiveKeyRe.test(key) && isSafeSensitiveReferenceTomlKey(key, value)) return false;
  if (sensitiveTokenRe.test(value) || vendorTokenShapeRe.test(value)) return true;
  if (!sensitiveKeyRe.test(key)) return false;
  return true;
}

function isSafeSensitiveReferenceTomlKey(key: string, rawValue: string): boolean {
  const tail = key.split(".").at(-1) ?? key;
  const trimmed = rawValue.trim();
  if (tail === "bearer_token_env_var") {
    const value = stringTomlValue(trimmed);
    return !!value && /^[A-Z_][A-Z0-9_]{0,127}$/.test(value);
  }
  if (tail === "env_vars") {
    const values = tomlStringArrayValue(trimmed);
    return !!values && values.every((value) => /^[A-Z_][A-Z0-9_]{0,127}$/.test(value));
  }
  if (tail === "env_http_headers") return trimmed.startsWith("{");
  return false;
}

function isSensitiveDocumentLine(rawLine: string): boolean {
  const line = rawLine.trim();
  if (!line) return false;
  if (isSensitiveTomlLine(line)) return true;
  if (sensitiveTokenRe.test(line)) return true;
  if (vendorTokenShapeRe.test(line)) return true;
  if (/\b(?:api[_-]?key|authorization|bearer|password|refresh[_-]?token|access[_-]?token|id[_-]?token)\b/i.test(line)) return true;
  return false;
}

async function readSmallText(filePath: string): Promise<string | undefined> {
  try {
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile() || stat.size > maxEditableBytes) return undefined;
    return await fs.promises.readFile(filePath, textEncoding);
  } catch {
    return undefined;
  }
}

async function statFile(filePath: string, options: { followSymlink?: boolean } = {}): Promise<FileSnapshot & { isSymbolicLink?: boolean }> {
  try {
    const stat = options.followSymlink === false ? await fs.promises.lstat(filePath) : await fs.promises.stat(filePath);
    const isSymbolicLink = stat.isSymbolicLink();
    return {
      exists: true,
      bytes: isSymbolicLink ? undefined : stat.isFile() ? stat.size : undefined,
      updatedAt: stat.mtime.toISOString(),
      isSymbolicLink
    };
  } catch {
    return { exists: false };
  }
}

async function safeReaddir(dirPath: string): Promise<fs.Dirent[]> {
  try {
    return await fs.promises.readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function countDirectories(dirPath: string): Promise<number> {
  return (await safeReaddir(dirPath)).length;
}

async function summarizeDirectory(dirPath: string): Promise<Record<string, string | number | boolean>> {
  const entries = await safeReaddir(dirPath);
  const summary: Record<string, string | number | boolean> = {
    entries: entries.length,
    files: entries.filter((entry) => entry.isFile()).length,
    directories: entries.filter((entry) => entry.isDirectory()).length
  };
  const extensionCounts = new Map<string, number>();
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const extension = path.extname(entry.name).toLowerCase().replace(/^\./, "") || "no_ext";
    extensionCounts.set(extension, (extensionCounts.get(extension) ?? 0) + 1);
  }
  for (const [extension, count] of [...extensionCounts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 4)) {
    summary[`ext_${extension}`] = count;
  }
  return summary;
}

function summarizeSqlite(dbPath: string): Record<string, string | number | boolean> | undefined {
  if (!fs.existsSync(dbPath)) return undefined;
  const opened = openCodexDb(dbPath);
  if (!opened) return undefined;
  try {
    const rows = opened.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as Array<{
      name?: string;
    }>;
    const summary: Record<string, string | number | boolean> = {
      tables: rows.length
    };
    for (const row of rows.slice(0, 6)) {
      const table = row.name;
      if (!table || !/^[A-Za-z0-9_]+$/.test(table)) continue;
      const count = opened.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count?: number } | undefined;
      summary[`rows_${table.slice(0, 28)}`] = Number(count?.count ?? 0);
    }
    return summary;
  } catch {
    return undefined;
  } finally {
    opened.db.close();
  }
}

function countArchivedThreads(dbPath: string): number | undefined {
  if (!fs.existsSync(dbPath)) return undefined;
  const opened = openCodexDb(dbPath);
  if (!opened) return undefined;
  try {
    const columns = tableColumns(opened.db, "threads");
    if (!columns.has("archived")) return undefined;
    const row = opened.db.prepare("SELECT COUNT(*) AS count FROM threads WHERE archived = 1").get() as
      | { count?: number }
      | undefined;
    return Number(row?.count ?? 0);
  } catch {
    return undefined;
  } finally {
    opened.db.close();
  }
}

async function readCurrentBytes(filePath: string): Promise<Buffer> {
  try {
    return await fs.promises.readFile(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return Buffer.alloc(0);
    throw error;
  }
}

async function writeBackup(resolved: ResolvedDocument, bytes: Buffer, home: string): Promise<string> {
  const backupDir = path.join(home, ".agentscope", "codex-control-backups", new Date().toISOString().replace(/[:.]/g, "-"));
  await fs.promises.mkdir(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `${safeBackupName(resolved.id)}.bak`);
  await fs.promises.writeFile(backupPath, bytes, { flag: "wx" });
  return backupPath;
}

async function writeTextAtomically(filePath: string, content: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(path.dirname(filePath), `${path.basename(filePath)}.agentscope-${Date.now()}.tmp`);
  let handle: fs.promises.FileHandle | undefined;
  try {
    handle = await fs.promises.open(tempPath, "wx");
    await handle.writeFile(content, { encoding: textEncoding });
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.promises.rename(tempPath, filePath);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await fs.promises.rm(tempPath, { force: true }).catch(() => undefined);
    throw codexAtomicWriteError(error, filePath);
  }
}

function codexAtomicWriteError(error: unknown, filePath: string): Error {
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === "EBUSY" || code === "EPERM" || code === "EACCES") {
    const wrapped = new Error(`file_busy_or_denied: config.toml may be open or access denied: ${filePath}`);
    (wrapped as NodeJS.ErrnoException).code = "file_busy_or_denied";
    return wrapped;
  }
  if (code === "ENOENT") {
    const wrapped = new Error(`atomic_target_missing: config.toml parent path disappeared: ${filePath}`);
    (wrapped as NodeJS.ErrnoException).code = "atomic_target_missing";
    return wrapped;
  }
  return error instanceof Error ? error : new Error(String(error));
}

interface CodexControlJournal extends Record<string, unknown> {
  schemaVersion: 1;
  createdAt: string;
  updatedAt: string;
  status: "started" | "succeeded" | "failed";
  action: string;
  targetPath: string;
  expectedSha256: string;
  previousSha256: string;
  nextSha256?: string | undefined;
  backupPath?: string | undefined;
  changedKeys: string[];
  highRisk: boolean;
  warnings: string[];
  verification?: CodexControlWriteVerification | undefined;
  evidence: Evidence[];
  journalPath: string;
  error?: string | undefined;
}

type CodexControlJournalStart = {
  action: string;
  targetPath: string;
  expectedSha256: string;
  previousSha256: string;
  backupPath?: string | undefined;
  changedKeys: string[];
  highRisk: boolean;
  warnings: string[];
  evidence: Evidence[];
};

async function createCodexControlJournal(
  payload: CodexControlJournalStart,
  home: string
): Promise<CodexControlJournal> {
  const journalDir = path.join(home, ".agentscope", "codex-control", new Date().toISOString().replace(/[:.]/g, "-"));
  await fs.promises.mkdir(journalDir, { recursive: true });
  const journalPath = path.join(journalDir, "journal.json");
  const now = new Date().toISOString();
  const journal: CodexControlJournal = {
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    status: "started",
    ...payload,
    journalPath
  };
  await fs.promises.writeFile(journalPath, `${JSON.stringify(journal, null, 2)}\n`, { encoding: textEncoding, flag: "wx" });
  return journal;
}

async function finishCodexControlJournal(
  journal: CodexControlJournal,
  result:
    | { status: "succeeded"; nextSha256: string; verification?: CodexControlWriteVerification | undefined }
    | { status: "failed"; error: string; verification?: CodexControlWriteVerification | undefined }
): Promise<void> {
  journal.updatedAt = new Date().toISOString();
  journal.status = result.status;
  journal.verification = result.verification;
  if (result.status === "succeeded") {
    journal.nextSha256 = result.nextSha256;
    delete journal.error;
  } else {
    journal.error = result.error;
  }
  await fs.promises.writeFile(journal.journalPath, `${JSON.stringify(journal, null, 2)}\n`, { encoding: textEncoding });
}

function safeBackupName(id: string): string {
  return id.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 120);
}

function sha256(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}
