import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  CodexControlDocument,
  CodexControlCenterItem,
  CodexControlCenterSnapshot,
  CodexControlMutationPlan,
  CodexControlMutationRequest,
  CodexControlRevealResult,
  CodexControlSaveResult,
  CodexControlSnapshot,
  CodexControlSurface,
  CodexControlSurfaceKind,
  CodexModeConfigPatch,
  CodexModeConfigSaveResult,
  CodexModeConfigSnapshot,
  CodexModeId,
  CodexModeValue,
  Evidence
} from "@agentscope/shared";
import { codexHome, codexSqliteHome, normalizeWindowsPath, userHome } from "./paths.js";
import { openCodexDb, tableColumns } from "./codex.js";
import { emptyConfigInventory, inspectToml, type ConfigInventory } from "./mcpIdentity.js";

const maxEditableBytes = 256 * 1024;
const textEncoding: BufferEncoding = "utf8";
const recommendedModels = ["gpt-5.5", "gpt-5.4-mini", "gpt-5.3-codex-spark"];
const reasoningEffortValues = ["minimal", "low", "medium", "high", "xhigh"];
const planReasoningEffortValues = ["none", ...reasoningEffortValues];
const sandboxModeValues = ["read-only", "workspace-write", "danger-full-access"];
const approvalPolicyValues = ["untrusted", "on-request", "never"];
const approvalsReviewerValues = ["user", "auto_review"];
const webSearchValues = ["cached", "live", "disabled"];
const serviceTierValues = ["default", "fast", "flex"];
const windowsSandboxValues = ["elevated", "unelevated"];
const editableConfigItems = new Map<
  string,
  {
    keyPath: string;
    section: CodexControlCenterItem["section"];
    label: string;
    detail: string;
    valueKind: CodexControlCenterItem["valueKind"];
    options?: string[] | undefined;
    risk: CodexControlCenterItem["risk"];
    source: CodexControlCenterItem["source"];
  }
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
    const descriptor = editableConfigItems.get(mutation.itemId);
    if (!descriptor || descriptor.keyPath !== mutation.keyPath) {
      blockers.push(`Unsupported Codex control mutation: ${mutation.itemId}/${mutation.keyPath}`);
      continue;
    }
    const validation = validateMutationValue(descriptor, mutation.value);
    if (validation) blockers.push(validation);
    const currentValue = configValueForKey(descriptor.keyPath, currentAssignments);
    if (currentValue === mutation.value) warnings.push(`${mutation.keyPath} already has the requested value.`);
    if (isHighRiskMutation(descriptor, mutation.value)) {
      warnings.push(`${mutation.keyPath} is a high-risk Codex control setting.`);
    }
  }
  const highRisk = normalized.some((mutation) => {
    const descriptor = editableConfigItems.get(mutation.itemId);
    return !!descriptor && isHighRiskMutation(descriptor, mutation.value);
  });
  if (highRisk && !request.confirmedHighRisk) {
    blockers.push("High-risk Codex control mutations require explicit confirmation.");
  }
  let next = content;
  if (!blockers.length) {
    for (const mutation of normalized) {
      next = applyConfigMutation(next, mutation.keyPath, mutation.value);
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
    warnings,
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
    next = applyConfigMutation(next, mutation.keyPath, mutation.value);
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
  return {
    id: "config.controlCenter",
    path: resolved.path,
    backupPath,
    journalPath: journal.journalPath,
    changedKeys: plan.changedKeys,
    sha256: nextHash,
    bytes: nextBytes.length,
    evidence: [
      {
        source: "codex.control.mutation.execute",
        detail: "Allowlisted Codex config keys were written after backup, sha256 check, and journal creation.",
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
  descriptor: NonNullable<ReturnType<typeof editableConfigItems.get>>,
  assignments: Map<string, TopLevelAssignment>,
  configPath: string,
  sensitiveLines: number[]
): CodexControlCenterItem {
  const assignment = assignments.get(descriptor.keyPath);
  const assignmentSensitive = assignment ? isSensitiveTomlLine(`${assignment.key} = ${assignment.value}`) : false;
  const value = assignmentSensitive ? undefined : configValueFromToml(assignment?.value, descriptor.valueKind);
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
    value,
    valueKind: descriptor.valueKind,
    options: descriptor.options,
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
    normalized.push({ itemId, keyPath, value: mutation.value });
  }
  return normalized;
}

function safeMutationsForPlan(
  mutations: CodexControlMutationRequest["mutations"]
): CodexControlMutationRequest["mutations"] {
  return mutations.map((mutation) => ({
    ...mutation,
    value: isSensitiveMutationValue(mutation.value) ? redactedMutationValue : mutation.value
  }));
}

function isSensitiveMutationValue(value: string | number | boolean | null): boolean {
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
      typeof mutation.value !== "boolean"
    ) {
      throw new Error("Invalid Codex control mutation value.");
    }
  }
}

function validateMutationValue(
  descriptor: NonNullable<ReturnType<typeof editableConfigItems.get>>,
  value: string | number | boolean | null
): string | undefined {
  if (value === null) return undefined;
  if (descriptor.valueKind === "boolean") {
    return typeof value === "boolean" ? undefined : `${descriptor.keyPath} expects a boolean value.`;
  }
  if (descriptor.valueKind === "number") {
    return typeof value === "number" && Number.isFinite(value) ? undefined : `${descriptor.keyPath} expects a finite number.`;
  }
  if (typeof value !== "string") return `${descriptor.keyPath} expects a string value.`;
  if (value.length > 160) return `${descriptor.keyPath} value is too long.`;
  if (isSensitiveMutationValue(value)) return `${descriptor.keyPath} value looks sensitive and is blocked.`;
  if (descriptor.options?.length && !descriptor.options.includes(value)) {
    return `${descriptor.keyPath} must be one of: ${descriptor.options.join(", ")}`;
  }
  if (descriptor.keyPath.includes("model") && !/^[A-Za-z0-9][A-Za-z0-9._:-]{1,80}$/.test(value)) {
    return `${descriptor.keyPath} is not a valid model-style value.`;
  }
  return undefined;
}

function isHighRiskMutation(
  descriptor: NonNullable<ReturnType<typeof editableConfigItems.get>>,
  value: string | number | boolean | null
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

function configValueForKey(keyPath: string, assignments: Map<string, TopLevelAssignment>): string | number | boolean | undefined {
  const descriptor = [...editableConfigItems.values()].find((item) => item.keyPath === keyPath);
  return configValueFromToml(assignments.get(keyPath)?.value, descriptor?.valueKind ?? "string");
}

function configValueFromToml(
  rawValue: string | undefined,
  kind: CodexControlCenterItem["valueKind"]
): string | number | boolean | undefined {
  if (rawValue === undefined) return undefined;
  if (kind === "boolean") return booleanValue(rawValue);
  if (kind === "number") {
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return stringTomlValue(rawValue) ?? rawValue.replace(/^["']|["']$/g, "");
}

function applyConfigMutation(content: string, keyPath: string, value: string | number | boolean | null): string {
  if (value === null) return removeConfigKey(content, keyPath);
  return setConfigValue(content, keyPath, tomlScalar(value));
}

function setConfigValue(content: string, keyPath: string, encodedValue: string): string {
  const pathParts = keyPath.split(".");
  const key = pathParts.pop();
  if (!key) throw new Error(`Invalid Codex config key path: ${keyPath}`);
  const tableName = pathParts.join(".");
  return tableName
    ? setTableTomlValue(content, tableName, key, encodedValue)
    : setTopLevelTomlValue(content, key, encodedValue);
}

function removeConfigKey(content: string, keyPath: string): string {
  const pathParts = keyPath.split(".");
  const key = pathParts.pop();
  if (!key) throw new Error(`Invalid Codex config key path: ${keyPath}`);
  const tableName = pathParts.join(".");
  return tableName ? removeTableTomlKey(content, tableName, key) : removeTopLevelTomlKey(content, key);
}

function setTopLevelTomlValue(content: string, key: string, encodedValue: string): string {
  const lines = normalizeTrailingNewline(content).split(/\r?\n/);
  const assignmentRe = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`);
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
    if (inTopLevel && assignmentRe.test(rawLine)) {
      lines[index] = `${key} = ${encodedValue}`;
      return lines.join("\n");
    }
    if (inTopLevel) insertAt = index + 1;
  }
  lines.splice(insertAt, 0, `${key} = ${encodedValue}`);
  return lines.join("\n");
}

function setTableTomlValue(content: string, tableName: string, key: string, encodedValue: string): string {
  const lines = normalizeTrailingNewline(content).split(/\r?\n/);
  const assignmentRe = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`);
  const headerRe = tableHeaderRe(tableName);
  let tableStart = -1;
  let tableEnd = lines.length;
  for (let index = 0; index < lines.length; index += 1) {
    const stripped = stripTomlComment(lines[index] ?? "").trim();
    if (headerRe.test(stripped)) {
      tableStart = index;
      continue;
    }
    if (tableStart >= 0 && index > tableStart && /^\[+/.test(stripped)) {
      tableEnd = index;
      break;
    }
  }
  if (tableStart < 0) {
    const needsBlank = lines.length > 1 && (lines[lines.length - 2] ?? "").trim();
    lines.splice(lines.length - 1, 0, ...(needsBlank ? [""] : []), `[${tableName}]`, `${key} = ${encodedValue}`);
    return lines.join("\n");
  }
  for (let index = tableStart + 1; index < tableEnd; index += 1) {
    if (assignmentRe.test(lines[index] ?? "")) {
      lines[index] = `${key} = ${encodedValue}`;
      return lines.join("\n");
    }
  }
  lines.splice(tableEnd, 0, `${key} = ${encodedValue}`);
  return lines.join("\n");
}

function removeTableTomlKey(content: string, tableName: string, key: string): string {
  const assignmentRe = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`);
  const headerRe = tableHeaderRe(tableName);
  const lines = content.split(/\r?\n/);
  let inTable = false;
  const next: string[] = [];
  for (const rawLine of lines) {
    const stripped = stripTomlComment(rawLine).trim();
    if (/^\[+/.test(stripped)) inTable = headerRe.test(stripped);
    if (inTable && assignmentRe.test(rawLine)) continue;
    next.push(rawLine);
  }
  return next.join("\n");
}

function tableHeaderRe(tableName: string): RegExp {
  return new RegExp(`^\\[\\s*${escapeRegExp(tableName)}\\s*\\]$`);
}

function tomlScalar(value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  return tomlString(value);
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
  const assignmentRe = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`);
  const lines = content.split(/\r?\n/);
  let inTopLevel = true;
  const next: string[] = [];
  for (const rawLine of lines) {
    const stripped = stripTomlComment(rawLine).trim();
    if (stripped && /^\[+/.test(stripped)) inTopLevel = false;
    if (inTopLevel && assignmentRe.test(rawLine)) continue;
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
  if (quoted) return (quoted[1] ?? quoted[2] ?? "").replace(/\\"/g, '"');
  const bare = /^[A-Za-z0-9._:-]+/.exec(value)?.[0];
  return bare || undefined;
}

function tomlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function validateTomlShape(content: string): string | undefined {
  const tables = new Set<string>();
  for (const [index, rawLine] of content.split(/\r?\n/).entries()) {
    const lineNumber = index + 1;
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;
    if (!balancedDelimiters(line)) return `line ${lineNumber} has unbalanced quotes or brackets`;
    const tableMatch = /^\[+\s*([^\]]+?)\s*\]+$/.exec(line);
    if (tableMatch) {
      const table = tableMatch[1]!;
      const arrayTable = line.startsWith("[[");
      if (!arrayTable && tables.has(table)) return `line ${lineNumber} repeats table [${table}]`;
      if (!arrayTable) tables.add(table);
      continue;
    }
    if (/^[A-Za-z0-9_.-]+\s*=/.test(line)) continue;
    return `line ${lineNumber} is not a TOML table or key/value assignment`;
  }
  return undefined;
}

function balancedDelimiters(line: string): boolean {
  let single = false;
  let double = false;
  let square = 0;
  let curly = 0;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (char === "'" && !double && line[index - 1] !== "\\") {
      single = !single;
      continue;
    }
    if (char === '"' && !single && line[index - 1] !== "\\") {
      double = !double;
      continue;
    }
    if (single || double) continue;
    if (char === "[") square += 1;
    if (char === "]") square -= 1;
    if (char === "{") curly += 1;
    if (char === "}") curly -= 1;
    if (square < 0 || curly < 0) return false;
  }
  return !single && !double && square === 0 && curly === 0;
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
    if (isSensitiveTomlLine(rawLine)) lines.push(index + 1);
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
  try {
    await fs.promises.writeFile(tempPath, content, { encoding: textEncoding, flag: "wx" });
    await fs.promises.rename(tempPath, filePath);
  } catch (error) {
    await fs.promises.rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
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
  result: { status: "succeeded"; nextSha256: string } | { status: "failed"; error: string }
): Promise<void> {
  journal.updatedAt = new Date().toISOString();
  journal.status = result.status;
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
