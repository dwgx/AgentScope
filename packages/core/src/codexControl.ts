import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  CodexControlDocument,
  CodexControlSaveResult,
  CodexControlSnapshot,
  CodexControlSurface,
  CodexControlSurfaceKind,
  CodexMcpServerSummary,
  Evidence
} from "@agentscope/shared";
import { codexHome, normalizeWindowsPath, userHome } from "./paths.js";
import { openCodexDb, tableColumns } from "./codex.js";

const maxEditableBytes = 256 * 1024;
const textEncoding: BufferEncoding = "utf8";
const sensitivePathPartRe = /^(auth|credentials?|secrets?|tokens?|keyrings?|keychains?)$/i;
const safeSkillNameRe = /^[a-z0-9][a-z0-9._-]{0,79}$/i;
const safeRuleNameRe = /^[a-z0-9][a-z0-9._-]{0,79}\.rules$/i;
const sensitiveKeyRe =
  /(?:^|[_.-])(?:api[-_]?key|authorization|bearer|credential|credentials|password|refresh[-_]?token|secret|token)(?:$|[_.-])/i;
const sensitiveTokenRe =
  /(?:^|[^a-z0-9])(?:api[-_]?key|authorization|bearer|credential|credentials|password|refresh[-_]?token|secret|token)(?:$|[^a-z0-9])/i;

interface ResolvedDocument {
  id: string;
  kind: CodexControlSurfaceKind;
  label: string;
  path: string;
  editable: boolean;
}

interface FileSnapshot {
  exists: boolean;
  bytes?: number | undefined;
  updatedAt?: string | undefined;
}

export async function listCodexControlSurfaces(home = userHome()): Promise<CodexControlSnapshot> {
  const root = codexHome(home);
  const configPath = path.join(root, "config.toml");
  const configText = await readSmallText(configPath);
  const configInventory = configText === undefined ? emptyConfigInventory() : inspectToml(configText, configPath);
  const surfaces: CodexControlSurface[] = [
    await fileSurface({
      id: "config.global",
      kind: "config",
      label: "config.toml",
      filePath: configPath,
      editable: configInventory.sensitiveLines.length === 0,
      detail: configInventory.sensitiveLines.length
        ? "Contains sensitive-looking keys; AgentScope will not open it in the built-in editor."
        : "Codex user configuration shared by CLI, IDE, and desktop.",
      warnings: configInventory.sensitiveLines.length
        ? ["Sensitive key names were detected. Use Reveal and edit outside AgentScope if needed."]
        : []
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
    await archiveSurface(root),
    await memorySurface(root),
    await directorySurface({
      id: "browser.state",
      kind: "browser",
      label: "Browser integration",
      dirPath: path.join(root, "browser"),
      detail: "Browser profile/cache presence only. AgentScope does not read browsing data.",
      evidenceSource: "codex.control.browser"
    }),
    await directorySurface({
      id: "computer-use.state",
      kind: "computer_use",
      label: "Computer Use integration",
      dirPath: path.join(root, "computer-use"),
      detail: "Computer Use local state presence only. AgentScope does not launch desktop control.",
      evidenceSource: "codex.control.computer_use"
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

export async function readCodexControlDocument(id: string, home = userHome()): Promise<CodexControlDocument> {
  const resolved = resolveDocument(id, home);
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
  const sensitive = resolved.kind === "config" ? sensitiveLineNumbers(content) : [];
  const redacted = sensitive.length > 0;
  return {
    ...resolved,
    content: redacted ? redactSensitiveTomlLines(content) : content,
    sha256: sha256(content),
    bytes: Buffer.byteLength(content, textEncoding),
    updatedAt: stat.updatedAt,
    editable: resolved.editable && !redacted,
    redacted,
    warnings: redacted
      ? ["Sensitive key names were detected; AgentScope redacted this document and will not save edits."]
      : [],
    evidence: [
      {
        source: "codex.control.document",
        detail: "Document was read through an allowlisted Codex control id.",
        path: resolved.path
      }
    ]
  };
}

export async function saveCodexControlDocument(
  id: string,
  content: string,
  expectedSha256: string,
  home = userHome()
): Promise<CodexControlSaveResult> {
  const resolved = resolveDocument(id, home);
  if (!resolved.editable) throw new Error(`Codex control document is read-only: ${id}`);
  if (Buffer.byteLength(content, textEncoding) > maxEditableBytes) {
    throw new Error(`Codex control document is too large for built-in editing: ${resolved.path}`);
  }
  if (resolved.kind === "config" && sensitiveLineNumbers(content).length > 0) {
    throw new Error("AgentScope refuses to save config.toml with sensitive-looking key names.");
  }
  if (resolved.kind === "config") {
    const validation = validateTomlShape(content);
    if (validation) throw new Error(`config.toml validation failed: ${validation}`);
  }
  const current = await readCurrentBytes(resolved.path);
  const currentHash = sha256(current.toString(textEncoding));
  if (currentHash !== expectedSha256) {
    throw new Error(`Codex control document changed on disk; reload before saving: ${resolved.path}`);
  }
  const backupPath = current.length ? await writeBackup(resolved, current, home) : undefined;
  await fs.promises.mkdir(path.dirname(resolved.path), { recursive: true });
  const tempPath = path.join(path.dirname(resolved.path), `.${path.basename(resolved.path)}.agentscope-${Date.now()}.tmp`);
  await fs.promises.writeFile(tempPath, content, { encoding: textEncoding, flag: "wx" });
  await fs.promises.rename(tempPath, resolved.path);
  return {
    id,
    path: resolved.path,
    backupPath,
    sha256: sha256(content),
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
        : [])
    ]
  };
}

function resolveDocument(id: string, home: string): ResolvedDocument {
  const root = codexHome(home);
  if (id === "config.global") {
    return resolveAllowedFile(root, id, "config", "config.toml", path.join(root, "config.toml"), true);
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
    surfaces.push({
      id: editable ? `skill:${entry.name}` : `skill-readonly:${entry.name}`,
      kind: "skill",
      label: entry.name,
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

async function directorySurface(input: {
  id: string;
  kind: CodexControlSurfaceKind;
  label: string;
  dirPath: string;
  detail: string;
  evidenceSource: string;
}): Promise<CodexControlSurface> {
  const stat = await statFile(input.dirPath);
  const entries = await countDirectories(input.dirPath);
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
    summary: { entries },
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

interface ConfigInventory {
  exists: boolean;
  mcpServers: CodexMcpServerSummary[];
  pluginTables: string[];
  projectTables: string[];
  sensitiveLines: number[];
}

function emptyConfigInventory(): ConfigInventory {
  return { exists: false, mcpServers: [], pluginTables: [], projectTables: [], sensitiveLines: [] };
}

function inspectToml(content: string, filePath: string): ConfigInventory {
  const tables = parseTomlTables(content);
  const mcpServers = new Map<string, CodexMcpServerSummary>();
  for (const table of tables) {
    const direct = /^mcp_servers\.([^.]+)$/.exec(table.name);
    if (direct) {
      const name = unquoteTomlKey(direct[1]!);
      mcpServers.set(name, {
        name,
        source: "user_config",
        enabled: booleanValue(table.keys.get("enabled")),
        transport: table.keys.has("url") ? "http" : table.keys.has("command") ? "stdio" : "unknown",
        table: table.name,
        evidence: [
          {
            source: "codex.control.config.toml",
            detail: "MCP server table found in user config.",
            path: filePath,
            field: table.name
          }
        ]
      });
    }
    const plugin = /^plugins\.(.+)\.mcp_servers\.([^.]+)$/.exec(table.name);
    if (plugin) {
      const name = `${unquoteTomlKey(plugin[1]!)}:${unquoteTomlKey(plugin[2]!)}`;
      mcpServers.set(name, {
        name,
        source: "plugin_config",
        enabled: booleanValue(table.keys.get("enabled")),
        transport: "plugin",
        table: table.name,
        evidence: [
          {
            source: "codex.control.config.toml",
            detail: "Plugin MCP server policy table found in user config.",
            path: filePath,
            field: table.name
          }
        ]
      });
    }
  }
  return {
    exists: true,
    mcpServers: [...mcpServers.values()].sort((left, right) => left.name.localeCompare(right.name)),
    pluginTables: tables.filter((table) => /^plugins\./.test(table.name)).map((table) => table.name),
    projectTables: tables.filter((table) => /^projects\./.test(table.name)).map((table) => table.name),
    sensitiveLines: sensitiveLineNumbers(content)
  };
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

interface TomlTable {
  name: string;
  keys: Map<string, string>;
}

function parseTomlTables(content: string): TomlTable[] {
  const tables: TomlTable[] = [];
  let current: TomlTable | undefined;
  for (const rawLine of content.split(/\r?\n/)) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;
    const tableMatch = /^\[+\s*([^\]]+?)\s*\]+$/.exec(line);
    if (tableMatch) {
      current = { name: tableMatch[1]!, keys: new Map() };
      tables.push(current);
      continue;
    }
    const keyMatch = /^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/.exec(line);
    if (keyMatch && current) current.keys.set(keyMatch[1]!, keyMatch[2]!.trim());
  }
  return tables;
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

function unquoteTomlKey(value: string): string {
  return value.replace(/^["']|["']$/g, "");
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

function redactSensitiveTomlLines(content: string): string {
  return content
    .split(/\r?\n/)
    .map((line) => {
      const match = /^(\s*[^=]+?=)/.exec(line);
      return match && isSensitiveTomlLine(line) ? `${match[1]} "*** redacted by AgentScope ***"` : line;
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

async function readSmallText(filePath: string): Promise<string | undefined> {
  try {
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile() || stat.size > maxEditableBytes) return undefined;
    return await fs.promises.readFile(filePath, textEncoding);
  } catch {
    return undefined;
  }
}

async function statFile(filePath: string): Promise<FileSnapshot> {
  try {
    const stat = await fs.promises.stat(filePath);
    return {
      exists: true,
      bytes: stat.isFile() ? stat.size : undefined,
      updatedAt: stat.mtime.toISOString()
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

function safeBackupName(id: string): string {
  return id.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 120);
}

function sha256(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}
