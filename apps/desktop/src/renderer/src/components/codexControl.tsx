import { Check, Code2, FileText, FolderOpen, Layers3, LoaderCircle, Plus, Save, Trash2, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type {
  CodexConfigTemplate,
  CodexConfigTemplateDraft,
  CodexConfigTemplateList,
  CodexConfigTemplatePreview,
  CodexConfigUnknownEntry,
  CodexConfigWorkbenchItem,
  CodexConfigWorkbenchSnapshot,
  CodexMcpServerSummary,
  CodexControlCenterItem,
  CodexControlCenterSection,
  CodexControlCenterSnapshot,
  CodexControlDocument,
  CodexControlMutation,
  CodexControlMutationRequest,
  CodexControlRisk,
  CodexControlSaveResult,
  CodexControlSnapshot,
  CodexControlSurface,
  CodexModeConfigPatch,
  CodexModeConfigSnapshot,
  CodexModeId,
  Evidence
} from "@agentscope/shared";
import { Badge } from "./common.js";
import { ActionButton, MiniSegmentedControl, SearchableComboBox, SwitchControl } from "./controls.js";
import { compactPath, formatBytes, formatDate, shortHash } from "../utils/display.js";

export type CodexControlTab = CodexControlCenterSection | "templates" | "files";
export type CodexModeDraft = {
  defaultModel: string;
  defaultReasoningEffort: string;
  planReasoningEffort: string;
  reviewModel: string;
};
export type CodexControlDraftMap = Record<string, string | number | boolean | string[] | undefined>;

const fallbackCodexModels = ["gpt-5.5", "gpt-5.4-mini", "gpt-5.3-codex-spark"];
const fallbackReasoningEfforts = ["minimal", "low", "medium", "high", "xhigh"];
const fallbackPlanReasoningEfforts = ["none", ...fallbackReasoningEfforts];

export type CodexTemplateSelection = {
  templateId: string;
  selectedItemIds: string[];
};

export type CodexApplyModalPhase = "animating" | "writing" | "success" | "error";

export interface CodexApplyModalState {
  phase: CodexApplyModalPhase;
  mutations: CodexControlMutation[];
  activeIndex: number;
  error?: string | undefined;
  resultPath?: string | undefined;
  verification?: CodexControlSaveResult["verification"] | undefined;
  effectiveWarnings?: string[] | undefined;
}

export function CodexControlCenterPanel(props: {
  snapshot: CodexControlCenterSnapshot | null;
  surfaces?: CodexControlSurface[] | undefined;
  draft: CodexControlDraftMap;
  tab: CodexControlTab;
  loading: boolean;
  status?: string | undefined;
  readOnlyMode: boolean;
  hideTabs?: boolean | undefined;
  onTabChange: (tab: CodexControlTab) => void;
  onDraftChange: (draft: CodexControlDraftMap) => void;
  onRefresh: () => void;
  onSave: () => void;
  onRevealPath: (targetPath?: string) => void;
  onSelectSurface: (surface: CodexControlSurface) => void;
}) {
  const { t } = useTranslation();
  const tabs: CodexControlTab[] = ["templates", "overview", "models", "safety", "runtime", "mcp", "skills", "storage", "files"];
  const dirty = props.snapshot ? codexControlMutationsFromDraft(props.draft, props.snapshot).length > 0 : false;
  const editableItems = props.snapshot?.items.filter((item) => item.section === props.tab && item.keyPath) ?? [];
  const summaryItems = props.snapshot?.items.filter((item) => item.section === props.tab && !item.keyPath) ?? [];
  const surfaceForItem = (item: CodexControlCenterItem) =>
    props.surfaces?.find((surface) => item.id === `surface.${surface.id}`);
  const setValue = (item: CodexControlCenterItem, value: string | number | boolean | undefined) =>
    props.onDraftChange({ ...props.draft, [item.id]: value });
  return (
    <section className="codexCenterPanel">
      <div className="codexCenterTabs">
        {props.hideTabs ? <span /> : (
          <MiniSegmentedControl
            value={props.tab}
            values={tabs}
            label={(tab) => t(`settings.codexControl.tabs.${tab}`)}
            testId="codex-control-tabs"
            onChange={props.onTabChange}
          />
        )}
        <div className="settingInlineActions">
          <ActionButton label={t("common.action.refresh")} testId="codex-control-center-refresh" onClick={props.onRefresh} disabled={props.loading} />
          <ActionButton
            label={t("settings.codexControl.save")}
            testId="codex-control-center-save"
            onClick={props.onSave}
            disabled={props.loading || props.readOnlyMode || !dirty}
          />
        </div>
      </div>
      {props.tab === "overview" && (
        <div className="codexOverviewGrid">
          <CodexOverviewCard
            label="CODEX_HOME"
            value={compactPath(props.snapshot?.codexHome)}
            detail={t("settings.codexControl.overview.codexHome")}
            onReveal={() => props.onRevealPath(props.snapshot?.codexHome)}
          />
          <CodexOverviewCard
            label="CODEX_SQLITE_HOME"
            value={compactPath(props.snapshot?.sqliteHome)}
            detail={t("settings.codexControl.overview.sqliteHome")}
            onReveal={() => props.onRevealPath(props.snapshot?.sqliteHome)}
          />
          <CodexOverviewCard
            label="config.toml"
            value={compactPath(props.snapshot?.configPath)}
            detail={props.snapshot?.configSha256 ? shortHash(props.snapshot.configSha256) : t("common.status.unknown")}
            tone="warn"
          />
          <CodexOverviewCard
            label="auth.json"
            value={props.snapshot?.auth.exists ? t("settings.codexControl.auth.present") : t("settings.codexControl.auth.missing")}
            detail={[
              props.snapshot?.auth.storageMode ? `store=${props.snapshot.auth.storageMode}` : undefined,
              props.snapshot?.auth.bytes !== undefined ? formatBytes(props.snapshot.auth.bytes) : undefined
            ]
              .filter(Boolean)
              .join(" / ")}
            tone="warn"
          />
        </div>
      )}
      {props.snapshot?.warnings.length ? (
        <div className="codexControlWarnings">
          {props.snapshot.warnings.slice(0, 6).map((warning) => (
            <span key={warning}>{localizedCodexControlWarning(warning, (key) => String(t(key)))}</span>
          ))}
        </div>
      ) : null}
      {editableItems.length > 0 && (
        <div className="codexControlItems">
          {editableItems.map((item) => (
            <CodexControlItemRow
              key={item.id}
              item={item}
              value={scalarDraftValue(props.draft[item.id])}
              disabled={props.loading || props.readOnlyMode || !item.editable}
              onChange={(value) => setValue(item, value)}
            />
          ))}
        </div>
      )}
      {summaryItems.length > 0 && props.tab !== "overview" && (
        <div className="codexSummaryGrid">
          {summaryItems.map((item) => {
            const surface = surfaceForItem(item);
            return (
              <button
                key={item.id}
                type="button"
                className="codexSummaryCard"
                data-testid="codex-control-summary-card"
                data-surface-id={surface?.id}
                data-status={surface?.status ?? item.status}
                data-editable={surface?.editable}
                onClick={() => surface && props.onSelectSurface(surface)}
                disabled={!surface}
              >
                <span>
                  <strong>{localizedCodexControlItemLabel(item, (key) => String(t(key)))}</strong>
                  <em>{localizedCodexControlItemDetail(item, (key) => String(t(key)))}</em>
                </span>
                <Badge text={t(`settings.codexControl.status.${item.status}`)} tone={item.status === "ok" ? "ok" : "warn"} />
              </button>
            );
          })}
        </div>
      )}
      {!editableItems.length && !summaryItems.length && props.tab !== "overview" && props.tab !== "files" && (
        <p className="inlineHint">{props.loading ? t("settings.codexControl.loading") : t("settings.codexControl.emptyTab")}</p>
      )}
      <div className="codexModeFooter">
        <span className="inlineHint">
          {dirty ? t("settings.codexControl.dirty") : t("settings.codexControl.clean")}
        </span>
        {props.status && <span className="inlineHint">{props.status}</span>}
        {props.loading && <span className="inlineHint">{t("settings.codexControl.loading")}</span>}
      </div>
    </section>
  );
}

export function CodexConfigWorkbenchPanel(props: {
  snapshot: CodexConfigWorkbenchSnapshot | null;
  draft: CodexControlDraftMap;
  selectedTemplateId?: string | undefined;
  selectedTemplateItemIds: string[];
  templatePreview: CodexConfigTemplatePreview | null;
  loading: boolean;
  status?: string | undefined;
  readOnlyMode: boolean;
  onDraftChange: (draft: CodexControlDraftMap) => void;
  onRefresh: () => void;
  onSelectTemplate: (templateId: string) => void;
  onToggleTemplateItem: (itemId: string, selected: boolean) => void;
  onStageTemplate: () => void;
  onSaveCustom: (template: CodexConfigTemplateDraft) => void;
  onDeleteCustom: (templateId: string) => void;
  onApply: () => void;
  onPickPath: (kind: "file" | "directory", itemId: string) => void;
}) {
  const { t } = useTranslation();
  const [section, setSection] = useState<"current" | "mcp" | "templates" | "unknown">("current");
  const [customName, setCustomName] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const selectedTemplate = props.snapshot?.templateList.templates.find((template) => template.id === props.selectedTemplateId);
  const staged = props.snapshot ? codexWorkbenchMutationsFromDraft(props.draft, props.snapshot) : [];
  const currentItems = props.snapshot?.items.filter((item) => item.group === "current") ?? [];
  const unknownItems = props.snapshot?.items.filter((item) => item.group === "unknown") ?? [];
  const selectedSet = new Set(props.selectedTemplateItemIds);
  const templateGroups = (["builtin", "custom"] as const).map((origin) => ({
    origin,
    templates: props.snapshot?.templateList.templates.filter((template) => template.origin === origin) ?? []
  }));
  useEffect(() => {
    if (!selectedTemplate) return;
    setCustomName(`${localizedCodexTemplateName(selectedTemplate, (key) => String(t(key)))} copy`);
    setCustomDescription(props.templatePreview?.templateDescription ?? "");
  }, [props.templatePreview?.templateDescription, selectedTemplate?.id, t]);
  return (
    <section className="codexWorkbench" data-testid="codex-config-workbench">
      <div className="codexWorkbenchToolbar">
        <div>
          <strong>{t("settings.codexControl.workbench.title")}</strong>
          <span>{t("settings.codexControl.workbench.detail")}</span>
          {props.snapshot?.configPath && <code className="mono">{compactPath(props.snapshot.configPath)}</code>}
        </div>
        <div className="settingInlineActions">
          <ActionButton label={t("common.action.refresh")} onClick={props.onRefresh} disabled={props.loading} />
          <ActionButton
            label={t("settings.codexControl.templates.apply")}
            testId="codex-workbench-apply"
            onClick={props.onApply}
            disabled={props.loading || props.readOnlyMode || staged.length === 0}
          />
        </div>
      </div>
      {props.snapshot?.warnings.length ? (
        <div className="codexControlWarnings">
          {props.snapshot.warnings.slice(0, 6).map((warning) => (
            <span key={warning}>{localizedCodexControlWarning(warning, (key) => String(t(key)))}</span>
          ))}
        </div>
      ) : null}
      <div className="codexWorkbenchLayout">
        <nav className="codexWorkbenchNav" aria-label={t("settings.codexControl.workbench.sections")}>
          {(["current", "mcp", "templates", "unknown"] as const).map((entry) => (
            <button
              key={entry}
              type="button"
              className={section === entry ? "active" : ""}
              onClick={() => setSection(entry)}
              data-testid={`codex-workbench-section-${entry}`}
            >
              <strong>{t(`settings.codexControl.workbench.section.${entry}`)}</strong>
              <span>{workbenchSectionCount(entry, props.snapshot)}</span>
            </button>
          ))}
        </nav>
        <div className="codexWorkbenchMain">
          {section === "current" ? (
            <div className="codexWorkbenchItems">
              {currentItems.map((item) => (
                <CodexWorkbenchItemRow
                  key={item.id}
                  item={item}
                  value={props.draft[item.id]}
                  disabled={props.loading || props.readOnlyMode || !item.editable}
                  onChange={(value) => props.onDraftChange({ ...props.draft, [item.id]: value })}
                  onPickPath={(kind) => props.onPickPath(kind, item.id)}
                />
              ))}
              {!currentItems.length && <p className="inlineHint">{props.loading ? t("settings.codexControl.loading") : t("settings.codexControl.emptyTab")}</p>}
            </div>
          ) : null}
          {section === "mcp" && (
            <div className="codexWorkbenchItems">
              <McpAddStrip
                disabled={props.loading || props.readOnlyMode}
                onAdd={(serverName, command) =>
                  props.onDraftChange({
                    ...props.draft,
                    ...mcpAddDraftPatch(serverName, command)
                  })
                }
              />
              <CodexMcpServerGroups
                snapshot={props.snapshot}
                draft={props.draft}
                disabled={props.loading || props.readOnlyMode}
                onChange={(item, value) => props.onDraftChange({ ...props.draft, [item.id]: value })}
                onPickPath={(kind, itemId) => props.onPickPath(kind, itemId)}
              />
            </div>
          )}
          {section === "templates" && (
            <div className="codexWorkbenchTemplates">
              <div className="codexTemplateList compact" aria-label={t("settings.codexControl.templates.list")}>
                {templateGroups.map((group) =>
                  group.templates.length ? (
                    <div key={group.origin} className="codexTemplateGroup">
                      <span>{t(`settings.codexControl.templates.group.${group.origin}`)}</span>
                      {group.templates.map((template) => (
                        <button
                          key={template.id}
                          type="button"
                          className={`codexTemplateCard ${template.id === props.selectedTemplateId ? "active" : ""}`}
                          data-testid="codex-template-card"
                          data-template-id={template.id}
                          data-template-origin={template.origin}
                          onClick={() => props.onSelectTemplate(template.id)}
                        >
                          <span className="codexTemplateIcon">
                            <Layers3 size={16} />
                          </span>
                          <span>
                            <strong>{localizedCodexTemplateName(template, (key) => String(t(key)))}</strong>
                            <em>{localizedCodexTemplateDescription(template, (key) => String(t(key)))}</em>
                          </span>
                          <Badge text={t(`settings.codexControl.risk.${template.risk}`)} tone={template.risk === "high" ? "warn" : undefined} />
                        </button>
                      ))}
                    </div>
                  ) : null
                )}
              </div>
              <div className="codexTemplatePreview workbench">
                <div className="codexTemplatePreviewBar">
                  <div>
                    <strong>{props.templatePreview ? localizedCodexTemplatePreviewName(props.templatePreview, (key) => String(t(key))) : t("settings.codexControl.templates.preview")}</strong>
                    <span>{props.templatePreview ? localizedCodexTemplatePreviewDescription(props.templatePreview, (key) => String(t(key))) : t("settings.codexControl.templates.previewEmpty")}</span>
                  </div>
                  <div className="settingInlineActions">
                    {selectedTemplate && !selectedTemplate.readonly && (
                      <button
                        type="button"
                        className="iconButton tiny"
                        title={t("settings.codexControl.templates.delete")}
                        onClick={() => props.onDeleteCustom(selectedTemplate.id)}
                        disabled={props.loading || props.readOnlyMode}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="iconButton tiny"
                      title={t("settings.codexControl.templates.saveCustom")}
                      onClick={() =>
                        props.templatePreview &&
                        props.onSaveCustom({
                          name: customName,
                          description: customDescription,
                          items: staged.map((mutation) => ({
                            itemId: mutation.itemId,
                            keyPath: mutation.keyPath,
                            value: mutation.value,
                            defaultSelected: true,
                            comment: mutation.comment
                          }))
                        })
                      }
                      disabled={props.loading || props.readOnlyMode || !customName.trim() || staged.length === 0}
                    >
                      <Save size={14} />
                    </button>
                  </div>
                </div>
                <div className="codexTemplateCustomBar">
                  <input value={customName} onChange={(event) => setCustomName(event.currentTarget.value)} disabled={props.loading || props.readOnlyMode} />
                  <input value={customDescription} onChange={(event) => setCustomDescription(event.currentTarget.value)} disabled={props.loading || props.readOnlyMode} />
                </div>
                <div className="codexTemplateRows">
                  {(props.templatePreview?.items ?? []).map((item) => (
                    <label key={item.itemId} className={`codexTemplateRow risk-${item.risk}`} data-testid="codex-template-row" data-item-id={item.itemId}>
                      <input
                        type="checkbox"
                        checked={selectedSet.has(item.itemId)}
                        disabled={props.loading || props.readOnlyMode || !item.editable}
                        onChange={(event) => props.onToggleTemplateItem(item.itemId, event.currentTarget.checked)}
                      />
                      <span className="codexTemplateRowMain">
                        <strong>{localizedTemplateItemLabel(item.label, item.itemId, (key) => String(t(key)))}</strong>
                        <em>{localizedTemplateItemDetail(item.detail, item.itemId, (key) => String(t(key)))}</em>
                        <code className="mono">{item.keyPath}</code>
                      </span>
                      <span className="codexTemplateValues">
                        <ValuePair label={t("settings.codexControl.templates.current")} value={formatTemplateValue(item.currentValue)} />
                        <ValuePair label={t("settings.codexControl.templates.templateValue")} value={formatTemplateValue(item.nextValue)} />
                      </span>
                    </label>
                  ))}
                </div>
                <div className="settingInlineActions">
                  <ActionButton
                    label={t("settings.codexControl.workbench.stageTemplate")}
                    onClick={props.onStageTemplate}
                    disabled={props.loading || props.readOnlyMode || !props.templatePreview?.mutations.length}
                  />
                </div>
              </div>
            </div>
          )}
          {section === "unknown" && (
            <div className="codexWorkbenchItems">
              {unknownItems.map((item) => (
                <CodexWorkbenchItemRow
                  key={item.id}
                  item={item}
                  value={props.draft[item.id]}
                  disabled={props.loading || props.readOnlyMode || !item.editable}
                  onChange={(value) => props.onDraftChange({ ...props.draft, [item.id]: value })}
                  onPickPath={(kind) => props.onPickPath(kind, item.id)}
                />
              ))}
              <CodexUnknownEntries entries={props.snapshot?.unknownEntries ?? []} editableCount={unknownItems.length} />
            </div>
          )}
        </div>
        <aside className="codexWorkbenchStage" data-testid="codex-workbench-stage">
          <strong>{t("settings.codexControl.workbench.staged")}</strong>
          <span className="inlineHint">{t("settings.codexControl.workbench.stagedDetail", { count: staged.length })}</span>
          <div className="codexStageList">
            {staged.map((mutation) => (
              <div key={`${mutation.itemId}:${mutation.keyPath}`} className={`codexStageItem risk-${mutationRisk(mutation, props.snapshot?.items)}`}>
                <code className="mono">{mutation.keyPath}</code>
                <strong className="mono">{formatTemplateValue(mutation.value)}</strong>
              </div>
            ))}
            {!staged.length && <p className="inlineHint">{t("settings.codexControl.noChanges")}</p>}
          </div>
          {props.status && <p className="inlineHint">{props.status}</p>}
        </aside>
      </div>
    </section>
  );
}

function McpAddStrip(props: {
  disabled: boolean;
  onAdd: (serverName: string, command: string) => void;
}) {
  const { t } = useTranslation();
  const [serverName, setServerName] = useState("");
  const [command, setCommand] = useState("");
  const safe = /^[A-Za-z0-9_-]{1,80}$/.test(serverName);
  return (
    <div className="mcpAddStrip" data-testid="codex-mcp-add-strip">
      <Plus size={16} />
      <input className="mono" value={serverName} onChange={(event) => setServerName(event.currentTarget.value)} disabled={props.disabled} placeholder={t("settings.codexControl.workbench.mcpName")} />
      <input className="mono" value={command} onChange={(event) => setCommand(event.currentTarget.value)} disabled={props.disabled} placeholder={t("settings.codexControl.workbench.mcpCommand")} />
      <ActionButton
        label={t("settings.codexControl.workbench.stageMcp")}
        onClick={() => {
          if (!safe || !command.trim()) return;
          props.onAdd(serverName.trim(), command.trim());
          setServerName("");
          setCommand("");
        }}
        disabled={props.disabled || !safe || !command.trim()}
      />
    </div>
  );
}

function CodexMcpServerGroups(props: {
  snapshot: CodexConfigWorkbenchSnapshot | null;
  draft: CodexControlDraftMap;
  disabled: boolean;
  onChange: (item: CodexConfigWorkbenchItem, value: string | number | boolean | string[] | undefined) => void;
  onPickPath: (kind: "file" | "directory", itemId: string) => void;
}) {
  const { t } = useTranslation();
  const items = props.snapshot?.items.filter((item) => item.group === "mcp") ?? [];
  const groups = mcpWorkbenchGroups(items, props.snapshot?.mcpServers ?? []);
  if (!groups.length) return <p className="inlineHint">{t("settings.codexControl.noMcp")}</p>;
  return (
    <div className="codexMcpServerGroups">
      {groups.map((group) => {
        const enabledItem = group.items.find((item) => item.keyPath.endsWith(".enabled"));
        const enabledValue = enabledItem ? props.draft[enabledItem.id] ?? enabledItem.currentValue : undefined;
        const configEnabled = enabledValue === undefined ? true : enabledValue === true;
        return (
          <section key={group.table} className={`codexMcpServerGroup ${configEnabled ? "enabled" : "disabled"}`} data-testid="codex-mcp-server-group" data-server-name={group.server.name}>
            <div className="codexMcpServerHeader">
              <span>
                <strong>{group.server.name}</strong>
                <em>{[group.server.transport, group.server.source, group.server.commandSummary].filter(Boolean).join(" / ")}</em>
                <code className="mono">{group.table}</code>
              </span>
              <div className="settingInlineActions">
                {enabledItem && (
                  <>
                    <SwitchControl
                      checked={configEnabled}
                      disabled={props.disabled || !enabledItem.editable}
                      testId={`codex-mcp-server-enabled-${safeTestId(group.server.name)}`}
                      onChange={(next) => props.onChange(enabledItem, next)}
                    />
                    <Badge text={configEnabled ? t("settings.codexControl.workbench.enabled") : t("settings.codexControl.workbench.disabled")} tone={configEnabled ? "ok" : "warn"} />
                  </>
                )}
                <Badge text={t(`settings.codexControl.risk.${mcpGroupRisk(group.items)}`)} tone={mcpGroupRisk(group.items) === "high" ? "warn" : "ok"} />
              </div>
            </div>
            <div className="codexMcpServerChildren">
              {mcpSortedItems(group.items)
                .filter((item) => !item.keyPath.endsWith(".enabled"))
                .map((item) => (
                  <CodexWorkbenchItemRow
                    key={item.id}
                    item={item}
                    value={props.draft[item.id]}
                    disabled={props.disabled || !item.editable}
                    onChange={(value) => props.onChange(item, value)}
                    onPickPath={(kind) => props.onPickPath(kind, item.id)}
                  />
                ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function CodexWorkbenchItemRow(props: {
  item: CodexConfigWorkbenchItem;
  value: string | number | boolean | string[] | undefined;
  disabled: boolean;
  onChange: (value: string | number | boolean | string[] | undefined) => void;
  onPickPath: (kind: "file" | "directory") => void;
}) {
  const { t } = useTranslation();
  const activeValue = props.value ?? props.item.currentValue;
  return (
    <div className={`codexControlItem workbench risk-${props.item.risk}`} data-testid="codex-workbench-item" data-item-id={props.item.id}>
      <div className="codexControlItemMeta">
        <strong>{localizedWorkbenchItemLabel(props.item, (key) => String(t(key)))}</strong>
        <span>{localizedWorkbenchItemDetail(props.item, (key) => String(t(key)))}</span>
        <code className="mono">{props.item.keyPath}</code>
        <em>{props.item.enabled ? t("settings.codexControl.workbench.enabled") : t("settings.codexControl.workbench.disabled")}</em>
        {props.item.warnings.length > 0 && <em>{props.item.warnings.slice(0, 2).join(" ")}</em>}
      </div>
      <div className="codexControlItemControl">
        {props.item.valueKind === "boolean" ? (
          <SwitchControl checked={activeValue === true} disabled={props.disabled} onChange={(next) => props.onChange(next)} />
        ) : props.item.valueKind === "stringArray" ? (
          <textarea
            className="codexArrayInput mono"
            value={Array.isArray(activeValue) ? activeValue.join("\n") : ""}
            disabled={props.disabled}
            spellCheck={false}
            onChange={(event) => props.onChange(event.currentTarget.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))}
          />
        ) : props.item.options?.length ? (
          <SearchableComboBox
            className="codexModeCombo"
            value={activeValue === undefined ? "" : String(activeValue)}
            options={props.item.options}
            disabled={props.disabled}
            allowCustom={props.item.allowCustom === true}
            allowEmpty
            emptyLabel={t("settings.codexControl.inheritDefault")}
            onChange={(next) => props.onChange(next || undefined)}
          />
        ) : (
          <div className="codexPathField">
            <input
              className="codexModeInput mono"
              value={activeValue === undefined ? "" : String(activeValue)}
              disabled={props.disabled}
              onChange={(event) => props.onChange(event.currentTarget.value || undefined)}
            />
            {props.item.valueKind === "path" && (
              <button type="button" className="iconButton tiny" title={t("common.action.reveal")} disabled={props.disabled} onClick={() => props.onPickPath(props.item.keyPath.endsWith(".cwd") ? "directory" : "file")}>
                <FolderOpen size={14} />
              </button>
            )}
          </div>
        )}
        <div className="settingInlineActions">
          {!props.item.enabled && (
            <ActionButton label={t("settings.codexControl.workbench.enable")} onClick={() => props.onChange(defaultWorkbenchValue(props.item))} disabled={props.disabled} />
          )}
          <ActionButton label={t("settings.codexControl.workbench.reset")} onClick={() => props.onChange(undefined)} disabled={props.disabled || props.value === undefined} />
          <Badge text={t(`settings.codexControl.risk.${props.item.risk}`)} tone={props.item.risk === "high" ? "warn" : props.item.risk === "blocked" ? "warn" : "ok"} />
        </div>
      </div>
    </div>
  );
}

export function mcpWorkbenchGroups(
  items: CodexConfigWorkbenchItem[],
  servers: CodexMcpServerSummary[]
): Array<{ table: string; server: CodexMcpServerSummary; items: CodexConfigWorkbenchItem[] }> {
  return servers
    .map((server) => ({
      table: server.table,
      server,
      items: items.filter((item) => item.table === server.table)
    }))
    .filter((group) => group.items.length)
    .sort((left, right) => left.server.name.localeCompare(right.server.name));
}

export function mcpSortedItems(items: CodexConfigWorkbenchItem[]): CodexConfigWorkbenchItem[] {
  const order = new Map([
    ["required", 0],
    ["default_tools_approval_mode", 1],
    ["enabled_tools", 2],
    ["disabled_tools", 3],
    ["startup_timeout_sec", 4],
    ["tool_timeout_sec", 5],
    ["command", 6],
    ["args", 7],
    ["cwd", 8],
    ["url", 9],
    ["bearer_token_env_var", 10],
    ["env_vars", 11],
    ["experimental_environment", 12]
  ]);
  return [...items].sort((left, right) => {
    const leftKey = left.keyPath.split(".").at(-1) ?? left.keyPath;
    const rightKey = right.keyPath.split(".").at(-1) ?? right.keyPath;
    return (order.get(leftKey) ?? 99) - (order.get(rightKey) ?? 99) || leftKey.localeCompare(rightKey);
  });
}

function mcpGroupRisk(items: CodexConfigWorkbenchItem[]): CodexControlRisk {
  return items.some((item) => item.risk === "high") ? "high" : items.some((item) => item.risk === "medium") ? "medium" : "low";
}

function safeTestId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, "-");
}

function CodexUnknownEntries(props: { entries: CodexConfigUnknownEntry[]; editableCount?: number | undefined }) {
  const { t } = useTranslation();
  const readonlyEntries = props.entries.filter((entry) => entry.sensitive || entry.valueKind === "inline" || entry.valueKind === "unknown");
  return (
    <div className="codexUnknownList" data-testid="codex-unknown-config-list">
      {props.editableCount ? (
        <p className="inlineHint">{t("settings.codexControl.workbench.editableUnknown", { count: props.editableCount })}</p>
      ) : null}
      {readonlyEntries.map((entry) => (
        <div key={entry.id} className={entry.sensitive ? "sensitive" : ""}>
          <span>
            <strong className="mono">{entry.keyPath}</strong>
            <em>{t("settings.codexControl.workbench.line", { line: entry.line })}</em>
          </span>
          <code className="mono">{entry.sensitive ? t("settings.codexControl.redacted") : entry.displayValue ?? entry.valueKind}</code>
          <Badge text={t("settings.codexControl.readOnly")} tone="warn" />
        </div>
      ))}
      {!props.entries.length && <p className="inlineHint">{t("settings.codexControl.workbench.noUnknown")}</p>}
      {props.entries.length > 0 && !readonlyEntries.length && <p className="inlineHint">{t("settings.codexControl.workbench.noReadOnlyUnknown")}</p>}
    </div>
  );
}

export function CodexApplyRunModal(props: {
  state: CodexApplyModalState | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const codeRef = useRef<HTMLDivElement | null>(null);
  const state = props.state;
  const active = state?.mutations[Math.min(state.activeIndex, Math.max(0, state.mutations.length - 1))];
  useEffect(() => {
    if (!state || state.activeIndex < 0) return;
    const node = codeRef.current?.querySelector<HTMLElement>("[data-active='true']");
    node?.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
  }, [state?.activeIndex, state?.phase, reduceMotion]);
  return (
    <AnimatePresence>
      {state && (
        <motion.div
          className="codexApplyOverlay"
          data-testid="codex-apply-modal"
          data-phase={state.phase}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
        >
          <motion.div
            className="codexApplyModal"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 10 }}
            transition={{ duration: 0.22, ease: [0.2, 0.85, 0.2, 1] }}
            layout
          >
            <div className="codexApplyHeader">
              <div>
                <strong>{t(`settings.codexControl.applyModal.${state.phase}`)}</strong>
                <span>{t("settings.codexControl.applyModal.detail")}</span>
              </div>
              {(state.phase === "success" || state.phase === "error") && (
                <button type="button" className="iconButton tiny" data-testid="codex-apply-close" onClick={props.onClose}>
                  <X size={16} />
                </button>
              )}
            </div>
            <div className="codexApplyBody">
              <motion.div className={`codexApplyStatus ${state.phase}`} layout>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={state.phase}
                    initial={reduceMotion ? false : { opacity: 0, scale: 0.72, rotate: state.phase === "error" ? -16 : 0 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, scale: 0.72 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                  >
                    {state.phase === "writing" && <LoaderCircle size={42} className="spin" />}
                    {state.phase === "success" && <Check size={46} />}
                    {state.phase === "error" && <X size={46} />}
                    {state.phase === "animating" && <Code2 size={42} />}
                  </motion.span>
                </AnimatePresence>
              </motion.div>
              <motion.div
                className="codexApplyCode mono"
                ref={codeRef}
                variants={{
                  open: { transition: { staggerChildren: reduceMotion ? 0 : 0.052, delayChildren: reduceMotion ? 0 : 0.08 } }
                }}
                initial="hidden"
                animate="open"
              >
                {state.activeIndex < 0 && (
                  <>
                    <motion.div className="codexApplyLine visible ok" variants={codexApplyLineVariants(reduceMotion)}>
                      <span>*</span>
                      <code>config.toml current snapshot loaded</code>
                    </motion.div>
                    <motion.div className="codexApplyLine visible warn" variants={codexApplyLineVariants(reduceMotion)}>
                      <span>*</span>
                      <code>generating matched structured patch...</code>
                    </motion.div>
                  </>
                )}
                {state.mutations.map((mutation, index) => {
                  if (index > state.activeIndex) return null;
                  return (
                    <motion.div
                      key={`${mutation.itemId}:${mutation.keyPath}`}
                      className={`codexApplyLine visible ${mutationRiskClass(mutation)}`}
                      variants={codexApplyLineVariants(reduceMotion)}
                      data-active={index === state.activeIndex}
                      layout
                    >
                      <span>{index + 1}</span>
                      <code>
                        {mutation.keyPath} = {formatTemplateValue(mutation.value)}
                        {mutation.comment ? `  # ${mutation.comment}` : ""}
                      </code>
                    </motion.div>
                  );
                })}
                {active && state.phase === "writing" && (
                  <motion.div className="codexApplyLine visible writing" variants={codexApplyLineVariants(reduceMotion)} data-active="true" layout>
                    <span>*</span>
                    <code>{t("settings.codexControl.applyModal.atomicWrite")}</code>
                  </motion.div>
                )}
                {state.phase === "success" && state.verification && (
                  <motion.div className="codexApplyLine visible ok" variants={codexApplyLineVariants(reduceMotion)} data-active="true" layout>
                    <span>*</span>
                    <code>{t("settings.codexControl.applyModal.verified", { count: state.verification.checkedKeys.length })}</code>
                  </motion.div>
                )}
                {state.effectiveWarnings?.length ? (
                  <motion.div className="codexApplyLine visible warn" variants={codexApplyLineVariants(reduceMotion)} layout>
                    <span>*</span>
                    <code>{t("settings.codexControl.newSessionEffect")}</code>
                  </motion.div>
                ) : null}
                {state.error && (
                  <motion.div className="codexApplyLine visible danger" variants={codexApplyLineVariants(reduceMotion)} data-active="true" layout>
                    <span>!</span>
                    <code>{state.error}</code>
                  </motion.div>
                )}
              </motion.div>
            </div>
            {state.resultPath && <code className="mono codexApplyPath">{state.resultPath}</code>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function codexApplyLineVariants(reduceMotion: boolean | null): Variants {
  return reduceMotion
    ? { hidden: { opacity: 1, y: 0 }, open: { opacity: 1, y: 0 } }
    : {
        hidden: { opacity: 0, y: 10 },
        open: { opacity: 1, y: 0, transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] } }
      };
}

function CodexOverviewCard(props: {
  label: string;
  value?: string | undefined;
  detail?: string | undefined;
  tone?: "ok" | "warn" | undefined;
  onReveal?: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  return (
    <button type="button" className="codexOverviewCard" onClick={props.onReveal} disabled={!props.onReveal}>
      <span>{props.label}</span>
      <strong className="mono">{props.value || t("common.status.unknown")}</strong>
      {props.detail && <em>{props.detail}</em>}
      <Badge text={props.tone === "warn" ? t("common.status.protected") : t("common.status.local")} tone={props.tone ?? "ok"} />
    </button>
  );
}

function CodexControlItemRow(props: {
  item: CodexControlCenterItem;
  value: string | number | boolean | undefined;
  disabled: boolean;
  onChange: (value: string | number | boolean | undefined) => void;
}) {
  const { t } = useTranslation();
  const value = props.value ?? "";
  return (
    <div className={`codexControlItem risk-${props.item.risk}`} data-testid="codex-control-item" data-item-id={props.item.id}>
      <div className="codexControlItemMeta">
        <strong>{localizedCodexControlItemLabel(props.item, (key) => String(t(key)))}</strong>
        <span>{localizedCodexControlItemDetail(props.item, (key) => String(t(key)))}</span>
        <code className="mono">{props.item.keyPath}</code>
        {props.item.warnings.length > 0 && (
          <em>{props.item.warnings.slice(0, 2).map((warning) => localizedCodexControlWarning(warning, (key) => String(t(key)))).join(" ")}</em>
        )}
      </div>
      <div className="codexControlItemControl">
        {props.item.valueKind === "boolean" ? (
          <SwitchControl
            checked={props.value === true}
            disabled={props.disabled}
            onChange={(next) => props.onChange(next)}
          />
        ) : props.item.options?.length ? (
          <SearchableComboBox
            className="codexModeCombo"
            testId={`codex-control-item-${props.item.id}`}
            value={String(value)}
            options={props.item.options}
            disabled={props.disabled}
            allowCustom={props.item.allowCustom === true}
            allowEmpty
            emptyLabel={t("settings.codexControl.inheritDefault")}
            onChange={(next) => props.onChange(next || undefined)}
          />
        ) : (
          <input
            className="codexModeInput mono"
            value={String(value)}
            disabled={props.disabled}
            onChange={(event) => props.onChange(event.target.value || undefined)}
          />
        )}
        <div className="settingInlineActions">
          <Badge text={t(`settings.codexControl.risk.${props.item.risk}`)} tone={props.item.risk === "high" ? "warn" : undefined} />
        </div>
      </div>
    </div>
  );
}

export function CodexTemplatePanel(props: {
  templateList: CodexConfigTemplateList | null;
  preview: CodexConfigTemplatePreview | null;
  selectedTemplateId?: string | undefined;
  selectedItemIds: string[];
  loading: boolean;
  status?: string | undefined;
  readOnlyMode: boolean;
  onRefresh: () => void;
  onSelectTemplate: (templateId: string) => void;
  onToggleItem: (itemId: string, selected: boolean) => void;
  onSaveCustom: (template: CodexConfigTemplateDraft) => void;
  onDeleteCustom: (templateId: string) => void;
  onApply: () => void;
}) {
  const { t } = useTranslation();
  const [customName, setCustomName] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const selected = props.templateList?.templates.find((template) => template.id === props.selectedTemplateId);
  const selectedSet = new Set(props.selectedItemIds);
  const changedSelected = props.preview?.items.filter((item) => item.selected && item.changed && item.editable).length ?? 0;
  const disabled = props.loading || props.readOnlyMode || !props.preview || changedSelected === 0 || !!props.preview.blockers.length;
  const selectedItems = props.preview?.items.filter((item) => selectedSet.has(item.itemId)) ?? [];
  const templateGroups = (["current", "builtin", "custom"] as const).map((origin) => ({
    origin,
    templates: props.templateList?.templates.filter((template) => template.origin === origin) ?? []
  }));
  useEffect(() => {
    setCustomName(selected ? `${localizedCodexTemplateName(selected, (key) => String(t(key)))} copy` : t("settings.codexControl.templates.customName"));
    setCustomDescription(props.preview?.templateDescription ?? "");
  }, [props.preview?.templateDescription, selected?.id, t]);
  return (
    <section className="codexTemplatePanel" data-testid="codex-template-panel">
      <div className="codexTemplateHeader">
        <div>
          <strong>{t("settings.codexControl.templates.title")}</strong>
          <span>{t("settings.codexControl.templates.detail")}</span>
          {props.preview?.configPath && <code className="mono">{compactPath(props.preview.configPath)}</code>}
        </div>
        <div className="settingInlineActions">
          <ActionButton label={t("common.action.refresh")} onClick={props.onRefresh} disabled={props.loading} />
          <ActionButton
            label={t("settings.codexControl.templates.apply")}
            testId="codex-template-apply"
            onClick={props.onApply}
            disabled={disabled}
          />
        </div>
      </div>
      <div className="codexTemplateLayout">
        <div className="codexTemplateList" aria-label={t("settings.codexControl.templates.list")}>
          {templateGroups.map((group) =>
            group.templates.length ? (
              <div key={group.origin} className="codexTemplateGroup">
                <span>{t(`settings.codexControl.templates.group.${group.origin}`)}</span>
                {group.templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className={`codexTemplateCard ${template.id === props.selectedTemplateId ? "active" : ""}`}
                    data-testid="codex-template-card"
                    data-template-id={template.id}
                    data-template-origin={template.origin}
                    onClick={() => props.onSelectTemplate(template.id)}
                  >
                    <span className="codexTemplateIcon">
                      <Layers3 size={16} />
                    </span>
                    <span>
                      <strong>{localizedCodexTemplateName(template, (key) => String(t(key)))}</strong>
                      <em>{localizedCodexTemplateDescription(template, (key) => String(t(key)))}</em>
                    </span>
                    <Badge text={t(`settings.codexControl.risk.${template.risk}`)} tone={template.risk === "high" ? "warn" : undefined} />
                  </button>
                ))}
              </div>
            ) : null
          )}
          {props.templateList && !templateGroups.find((group) => group.origin === "custom")?.templates.length && (
            <p className="inlineHint">{t("settings.codexControl.templates.customEmpty")}</p>
          )}
          {props.loading && <p className="inlineHint">{t("settings.codexControl.loading")}</p>}
        </div>
        <div className="codexTemplatePreview">
          <div className="codexTemplatePreviewBar">
            <div>
              <strong>{props.preview ? localizedCodexTemplatePreviewName(props.preview, (key) => String(t(key))) : t("settings.codexControl.templates.preview")}</strong>
              <span>
                {props.preview
                  ? localizedCodexTemplatePreviewDescription(props.preview, (key) => String(t(key)))
                  : t("settings.codexControl.templates.previewEmpty")}
              </span>
            </div>
            <div className="settingInlineActions">
              {selected && !selected.readonly && (
                <button
                  type="button"
                  className="iconButton tiny"
                  data-testid="codex-template-delete-custom"
                  title={t("settings.codexControl.templates.delete")}
                  onClick={() => props.onDeleteCustom(selected.id)}
                  disabled={props.loading || props.readOnlyMode}
                >
                  <Trash2 size={14} />
                </button>
              )}
              <button
                type="button"
                className="iconButton tiny"
                data-testid="codex-template-save-custom"
                title={t("settings.codexControl.templates.saveCustom")}
                onClick={() =>
                  props.preview &&
                  props.onSaveCustom({
                    name: customName,
                    description: customDescription,
                    items: selectedItems.map((item) => ({
                        itemId: item.itemId,
                        keyPath: item.keyPath,
                        value: item.nextValue,
                        defaultSelected: true,
                        comment: item.comment
                      }))
                  })
                }
                disabled={props.loading || props.readOnlyMode || !props.preview || !customName.trim() || selectedItems.length === 0}
              >
                <Save size={14} />
              </button>
            </div>
          </div>
          <div className="codexTemplateCustomBar">
            <input
              value={customName}
              onChange={(event) => setCustomName(event.currentTarget.value)}
              disabled={props.loading || props.readOnlyMode}
              placeholder={t("settings.codexControl.templates.customName")}
            />
            <input
              value={customDescription}
              onChange={(event) => setCustomDescription(event.currentTarget.value)}
              disabled={props.loading || props.readOnlyMode}
              placeholder={t("settings.codexControl.templates.customDescription")}
            />
          </div>
          {props.preview?.warnings.length ? (
            <div className="codexControlWarnings">
              {props.preview.warnings.slice(0, 5).map((warning) => (
                <span key={warning}>{localizedCodexControlWarning(warning, (key) => String(t(key)))}</span>
              ))}
            </div>
          ) : null}
          {props.preview?.blockers.length ? (
            <div className="codexControlWarnings">
              {props.preview.blockers.map((blocker) => (
                <span key={blocker}>{blocker}</span>
              ))}
            </div>
          ) : null}
          <div className="codexTemplateRows">
            {(props.preview?.items ?? []).map((item) => (
              <label
                key={item.itemId}
                className={`codexTemplateRow risk-${item.risk}`}
                data-testid="codex-template-row"
                data-item-id={item.itemId}
                data-selected={selectedSet.has(item.itemId)}
                data-changed={item.changed}
              >
                <input
                  type="checkbox"
                  checked={selectedSet.has(item.itemId)}
                  disabled={props.loading || props.readOnlyMode || !item.editable}
                  onChange={(event) => props.onToggleItem(item.itemId, event.currentTarget.checked)}
                />
                <span className="codexTemplateRowMain">
                  <strong>{localizedTemplateItemLabel(item.label, item.itemId, (key) => String(t(key)))}</strong>
                  <em>{localizedTemplateItemDetail(item.detail, item.itemId, (key) => String(t(key)))}</em>
                  <code className="mono">{item.keyPath}</code>
                  {item.comment && <small className="mono"># {item.comment}</small>}
                  {item.warnings.length > 0 && (
                    <small>{item.warnings.map((warning) => localizedCodexControlWarning(warning, (key) => String(t(key)))).join(" ")}</small>
                  )}
                </span>
                <span className="codexTemplateValues">
                  <ValuePair label={t("settings.codexControl.templates.current")} value={formatTemplateValue(item.currentValue)} />
                  <ValuePair label={t("settings.codexControl.templates.templateValue")} value={formatTemplateValue(item.nextValue)} />
                </span>
                <Badge
                  text={item.changed ? t("settings.codexControl.templates.changed") : t("settings.codexControl.templates.same")}
                  tone={item.changed ? "ok" : undefined}
                />
              </label>
            ))}
            {!props.preview && <p className="inlineHint">{t("settings.codexControl.templates.previewEmpty")}</p>}
          </div>
          <div className="codexModeFooter">
            <span className="inlineHint">
              {props.preview
                ? t("settings.codexControl.templates.footer", {
                    count: changedSelected,
                    keys: props.preview.changedKeys.join(", ") || t("settings.codexControl.noChanges")
                  })
                : t("settings.codexControl.templates.previewEmpty")}
            </span>
            {props.status && <span className="inlineHint">{props.status}</span>}
          </div>
        </div>
      </div>
    </section>
  );
}

function ValuePair(props: { label: string; value: string }) {
  return (
    <span>
      <em>{props.label}</em>
      <strong className="mono">{props.value}</strong>
    </span>
  );
}

export function CodexModeConfigPanel(props: {
  snapshot: CodexModeConfigSnapshot | null;
  draft: CodexModeDraft;
  loading: boolean;
  status?: string | undefined;
  readOnlyMode: boolean;
  onDraftChange: (next: CodexModeDraft) => void;
  onRefresh: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const modelOptions = props.snapshot?.recommendedModels.length
    ? props.snapshot.recommendedModels
    : fallbackCodexModels;
  const reasoningOptions = props.snapshot?.reasoningEffortValues.length
    ? props.snapshot.reasoningEffortValues
    : fallbackReasoningEfforts;
  const planReasoningOptions = props.snapshot?.planReasoningEffortValues.length
    ? props.snapshot.planReasoningEffortValues
    : fallbackPlanReasoningEfforts;
  const dirty = props.snapshot ? !codexModeDraftEqualsSnapshot(props.draft, props.snapshot) : false;
  const disabled = props.loading || !props.snapshot || props.readOnlyMode;
  const mode = (id: CodexModeId) => props.snapshot?.modes[id];
  const setDraft = (patch: Partial<CodexModeDraft>) => props.onDraftChange({ ...props.draft, ...patch });
  const defaultModel = props.draft.defaultModel || props.snapshot?.modes.default.model || "";
  const defaultReasoning = props.draft.defaultReasoningEffort || props.snapshot?.modes.default.reasoningEffort || "";
  const inheritedPlanModel = defaultModel || props.snapshot?.modes.plan.model || "";
  const inheritedReviewReasoning = defaultReasoning || props.snapshot?.modes.review.reasoningEffort || "";
  return (
    <section className="codexModePanel">
      <div className="codexModeHeader">
        <div>
          <strong>{t("settings.codexControl.modeTitle")}</strong>
          <span>{t("settings.codexControl.modeDetail")}</span>
          {props.snapshot?.configPath && <code className="mono">{props.snapshot.configPath}</code>}
        </div>
        <div className="settingInlineActions">
          <ActionButton label={t("common.action.refresh")} onClick={props.onRefresh} disabled={props.loading} />
          <ActionButton label={t("settings.codexControl.save")} onClick={props.onSave} disabled={disabled || !dirty} />
        </div>
      </div>
      {props.snapshot?.warnings.map((warning) => (
        <p className="inlineError" key={warning}>{localizedCodexControlWarning(warning, (key) => String(t(key)))}</p>
      ))}
      <div className="codexModeGrid">
        <CodexModeCard
          title={t("settings.codexControl.mode.default")}
          source={mode("default")?.source}
          evidence={mode("default")?.evidence ?? []}
        >
          <CodexModelField
            label={t("settings.codexControl.model")}
            value={props.draft.defaultModel}
            options={modelOptions}
            placeholder={props.snapshot?.modes.default.model ?? "gpt-5.5"}
            disabled={disabled}
            onChange={(value) => setDraft({ defaultModel: value })}
          />
          <CodexReasoningField
            label={t("settings.codexControl.reasoning")}
            value={props.draft.defaultReasoningEffort}
            options={reasoningOptions}
            disabled={disabled}
            allowUnset
            unsetLabel={t("settings.codexControl.unset")}
            onChange={(value) => setDraft({ defaultReasoningEffort: value })}
          />
        </CodexModeCard>
        <CodexModeCard
          title={t("settings.codexControl.mode.plan")}
          source={mode("plan")?.source}
          evidence={mode("plan")?.evidence ?? []}
        >
          <CodexModeReadonlyField
            label={t("settings.codexControl.model")}
            value={inheritedPlanModel || t("settings.codexControl.unset")}
            detail={t("settings.codexControl.planModelNote")}
          />
          <CodexReasoningField
            label={t("settings.codexControl.reasoning")}
            value={props.draft.planReasoningEffort}
            options={planReasoningOptions}
            disabled={disabled}
            allowUnset
            unsetLabel={t("settings.codexControl.inheritDefault")}
            onChange={(value) => setDraft({ planReasoningEffort: value })}
          />
        </CodexModeCard>
        <CodexModeCard
          title={t("settings.codexControl.mode.review")}
          source={mode("review")?.source}
          evidence={mode("review")?.evidence ?? []}
        >
          <CodexModelField
            label={t("settings.codexControl.model")}
            value={props.draft.reviewModel}
            options={modelOptions}
            placeholder={props.snapshot?.modes.review.model ?? (defaultModel || "gpt-5.5")}
            disabled={disabled}
            allowUnset
            unsetLabel={t("settings.codexControl.inheritDefault")}
            onChange={(value) => setDraft({ reviewModel: value })}
          />
          <CodexModeReadonlyField
            label={t("settings.codexControl.reasoning")}
            value={inheritedReviewReasoning || t("settings.codexControl.unset")}
            detail={t("settings.codexControl.reviewReasoningNote")}
          />
        </CodexModeCard>
      </div>
      <div className="codexModeFooter">
        <span className="inlineHint">{t("settings.codexControl.modeEvidence")}</span>
        {props.status && <span className="inlineHint">{props.status}</span>}
        {props.loading && <span className="inlineHint">{t("settings.codexControl.loading")}</span>}
      </div>
    </section>
  );
}

function CodexModeCard(props: {
  title: string;
  source?: string | undefined;
  evidence: Evidence[];
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const source = props.source ?? "unset";
  return (
    <div className="codexModeCard">
      <div className="codexModeCardTitle">
        <strong>{props.title}</strong>
        <Badge text={t(`settings.codexControl.source.${source}`)} tone={source === "config" ? "ok" : undefined} />
      </div>
      <div className="codexModeFields">{props.children}</div>
      <div className="codexModeEvidence">
        {props.evidence.slice(0, 2).map((evidence, index) => (
          <span key={`${evidence.source}:${evidence.field ?? ""}:${index}`} title={evidence.detail}>
            {codexModeEvidenceLabel(evidence)}
          </span>
        ))}
      </div>
    </div>
  );
}

function CodexModelField(props: {
  label: string;
  value: string;
  options: string[];
  placeholder?: string | undefined;
  disabled?: boolean | undefined;
  allowUnset?: boolean | undefined;
  unsetLabel?: string | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <label className="codexModeField">
      <span>{props.label}</span>
      <SearchableComboBox
        className="codexModeCombo"
        value={props.value}
        options={props.options}
        disabled={props.disabled}
        allowCustom
        allowEmpty={props.allowUnset}
        emptyLabel={props.allowUnset ? props.unsetLabel : props.placeholder}
        onChange={props.onChange}
      />
    </label>
  );
}

function CodexReasoningField(props: {
  label: string;
  value: string;
  options: string[];
  disabled?: boolean | undefined;
  allowUnset?: boolean | undefined;
  unsetLabel?: string | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <label className="codexModeField">
      <span>{props.label}</span>
      <SearchableComboBox
        className="codexModeCombo"
        value={props.value}
        options={props.options}
        disabled={props.disabled}
        allowCustom={false}
        allowEmpty={props.allowUnset}
        emptyLabel={props.unsetLabel}
        onChange={props.onChange}
      />
    </label>
  );
}

function CodexModeReadonlyField(props: { label: string; value: string; detail: string }) {
  return (
    <div className="codexModeReadonlyField">
      <span>{props.label}</span>
      <strong className="mono">{props.value}</strong>
      <em>{props.detail}</em>
    </div>
  );
}

function codexModeEvidenceLabel(evidence: Evidence): string {
  if (!evidence.field) return evidence.source;
  if (evidence.field === "plan_mode_reasoning_effort") return "plan reasoning";
  if (evidence.field === "model_reasoning_effort") return "default reasoning";
  if (evidence.field === "review_model") return "review model";
  return evidence.field;
}

export function CodexControlDetail(props: {
  surface?: CodexControlSurface | undefined;
  document: CodexControlDocument | null;
  draft: string;
  loading: boolean;
  saveStatus?: string | undefined;
  dirty: boolean;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  onRevealSurface?: (() => void) | undefined;
  readOnlyMode: boolean;
}) {
  const { t } = useTranslation();
  if (!props.surface) {
    return (
      <div className="codexControlDetail">
        <CodexEmptyState
          icon={<Code2 size={22} />}
          title={t("settings.codexControl.emptyTitle")}
          detail={t("settings.codexControl.emptyDetail")}
        />
      </div>
    );
  }
  const summaryEntries = Object.entries(props.surface.summary ?? {});
  const surfaceLabel = localizedCodexSurfaceLabel(props.surface, (key) => String(t(key)));
  const surfaceDetail = localizedCodexSurfaceDetail(props.surface, (key) => String(t(key)));
  return (
    <div className="codexControlDetail" data-testid="codex-control-detail" data-surface-id={props.surface.id} data-status={props.surface.status} data-editable={props.surface.editable}>
      <div className="codexControlMeta">
        <div>
          <strong>{surfaceLabel}</strong>
          <span>{surfaceDetail}</span>
          {props.surface.path && <code className="mono">{compactPath(props.surface.path)}</code>}
        </div>
        <div className="settingInlineActions">
          <Badge
            text={props.surface.editable ? t("settings.codexControl.editable") : t("settings.codexControl.readOnly")}
            tone={props.surface.status === "ok" ? "ok" : "warn"}
          />
          <ActionButton
            label={t("common.action.reveal")}
            onClick={() => props.onRevealSurface?.()}
            disabled={!props.onRevealSurface}
          />
        </div>
      </div>
      <div className="codexControlFacts">
        <FactPill label={t("settings.codexControl.exists")} value={props.surface.exists ? "yes" : "no"} />
        {props.surface.bytes !== undefined && (
          <FactPill label={t("settings.codexControl.bytes")} value={formatBytes(props.surface.bytes) ?? String(props.surface.bytes)} />
        )}
        {props.surface.updatedAt && (
          <FactPill label={t("settings.codexControl.updated")} value={formatDate(props.surface.updatedAt)} />
        )}
        {summaryEntries.map(([key, value]) => (
          <FactPill key={key} label={key} value={String(value)} />
        ))}
      </div>
      {props.surface.warnings.length > 0 && (
        <div className="codexControlWarnings">
          {props.surface.warnings.map((warning) => (
            <span key={warning}>{localizedCodexControlWarning(warning, (key) => String(t(key)))}</span>
          ))}
        </div>
      )}
      {props.surface.editable ? (
        <>
          <textarea
            className="codexControlEditor mono"
            data-testid="codex-control-editor"
            value={props.draft}
            onChange={(event) => props.onDraftChange(event.target.value)}
            spellCheck={false}
            disabled={props.loading || props.readOnlyMode || props.document?.editable === false}
            placeholder={props.loading ? t("settings.codexControl.loading") : ""}
          />
          <div className="codexEditorActions">
            <span className="inlineHint">
              {props.document?.redacted
                ? t("settings.codexControl.redacted")
                : t("settings.codexControl.backupBeforeSave")}
            </span>
            <ActionButton
              label={t("settings.codexControl.save")}
              testId="codex-control-file-save"
              onClick={props.onSave}
              disabled={props.loading || props.readOnlyMode || !props.document?.editable || !props.dirty}
            />
          </div>
        </>
      ) : (
        <div className="codexReadOnlyPanel" data-testid="codex-control-readonly-panel">
          <FileText size={18} />
          <span>{props.surface.warnings[0] ? localizedCodexControlWarning(props.surface.warnings[0], (key) => String(t(key))) : t("settings.codexControl.readOnlyDetail")}</span>
        </div>
      )}
      {props.saveStatus && <p className="inlineHint">{props.saveStatus}</p>}
      <div className="codexEvidenceList">
        {props.surface.evidence.map((evidence, index) => (
          <div key={`${evidence.source}:${index}`}>
            <strong>{evidence.source}</strong>
            <span>{evidence.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FactPill(props: { label: string; value: string }) {
  return (
    <span className="factPill">
      <em>{props.label}</em>
      <strong className="mono">{props.value}</strong>
    </span>
  );
}

function CodexEmptyState(props: { icon: ReactNode; title: string; detail: string }) {
  return (
    <div className="emptyState">
      <div>{props.icon}</div>
      <h2>{props.title}</h2>
      <p>{props.detail}</p>
    </div>
  );
}

export function localizedCodexControlWarning(warning: string, translate: (key: string) => string): string {
  const key = codexControlWarningKey(warning);
  return key ? translate(key) : warning;
}

export function codexWorkbenchDraftFromSnapshot(snapshot: CodexConfigWorkbenchSnapshot): CodexControlDraftMap {
  const draft: CodexControlDraftMap = {};
  for (const item of snapshot.items) draft[item.id] = undefined;
  return draft;
}

export function codexCombinedDraftFromSnapshots(
  center: CodexControlCenterSnapshot,
  workbench: CodexConfigWorkbenchSnapshot
): CodexControlDraftMap {
  return {
    ...codexWorkbenchDraftFromSnapshot(workbench),
    ...codexControlDraftFromCenter(center)
  };
}

export function mcpAddDraftPatch(serverName: string, command: string): CodexControlDraftMap {
  return {
    [`config.mcp_servers.${serverName}.command`]: command,
    [`config.mcp_servers.${serverName}.enabled`]: true
  };
}

export function codexWorkbenchMutationsFromDraft(
  draft: CodexControlDraftMap,
  snapshot: CodexConfigWorkbenchSnapshot
): CodexControlMutation[] {
  const out: CodexControlMutation[] = [];
  for (const item of snapshot.items) {
    if (!(item.id in draft) || draft[item.id] === undefined) continue;
    const value = draft[item.id];
    if (workbenchValueEquals(value, item.currentValue)) continue;
    out.push({
      itemId: item.id,
      keyPath: item.keyPath,
      value: value as CodexControlMutation["value"],
      comment: `${formatTemplateValue(item.currentValue)} -> ${formatTemplateValue(value as CodexControlMutation["value"])}`
    });
  }
  return out;
}

function workbenchValueEquals(
  left: string | number | boolean | string[] | undefined,
  right: string | number | boolean | string[] | undefined
): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
  }
  return left === right;
}

function scalarDraftValue(value: CodexControlDraftMap[string]): string | number | boolean | undefined {
  return Array.isArray(value) ? undefined : value;
}

function workbenchSectionCount(section: "current" | "mcp" | "templates" | "unknown", snapshot: CodexConfigWorkbenchSnapshot | null): string {
  if (!snapshot) return "0";
  if (section === "templates") return String(snapshot.templateList.templates.filter((template) => template.origin !== "current").length);
  if (section === "unknown") return String(snapshot.unknownEntries.length);
  if (section === "mcp") return String(snapshot.mcpServers.length);
  return String(snapshot.items.filter((item) => item.group === section).length);
}

function defaultWorkbenchValue(item: CodexConfigWorkbenchItem): string | number | boolean | string[] {
  if (item.valueKind === "boolean") return true;
  if (item.valueKind === "number") return 10;
  if (item.valueKind === "stringArray") return [];
  return item.options?.[0] ?? "";
}

function mutationRisk(mutation: CodexControlMutation, items?: CodexConfigWorkbenchItem[]): CodexControlRisk {
  const item = items?.find((entry) => entry.id === mutation.itemId);
  if (item) return item.risk;
  return mutationRiskClass(mutation) === "danger" ? "high" : "medium";
}

function mutationRiskClass(mutation: CodexControlMutation): "ok" | "warn" | "danger" {
  if (
    (mutation.keyPath === "approval_policy" && mutation.value === "never") ||
    (mutation.keyPath === "sandbox_mode" && mutation.value === "danger-full-access") ||
    mutation.keyPath.endsWith(".command") ||
    mutation.keyPath.endsWith(".url")
  ) {
    return "danger";
  }
  if (
    mutation.itemId.startsWith("config.unknown.") ||
    mutation.itemId.startsWith("config.custom.") ||
    mutation.keyPath.includes("mcp_servers") ||
    mutation.keyPath.includes("web_search") ||
    mutation.keyPath.includes("approval")
  ) {
    return "warn";
  }
  return "ok";
}

function localizedWorkbenchItemLabel(item: CodexConfigWorkbenchItem, translate: (key: string) => string): string {
  if (item.id.startsWith("config.mcp_servers.")) return item.label;
  const key = templateItemTextKey(item.id, "label");
  return key ? translate(key) : item.label;
}

function localizedWorkbenchItemDetail(item: CodexConfigWorkbenchItem, translate: (key: string) => string): string {
  if (item.id.startsWith("config.mcp_servers.")) return item.detail;
  const key = templateItemTextKey(item.id, "detail");
  return key ? translate(key) : item.detail;
}

function localizedCodexControlItemLabel(item: CodexControlCenterItem, translate: (key: string) => string): string {
  if (item.displayLabel) return item.displayLabel;
  const key = codexControlItemTextKey(item, "label");
  return key ? translate(key) : item.label;
}

function localizedCodexControlItemDetail(item: CodexControlCenterItem, translate: (key: string) => string): string {
  if (item.displayDetail) return item.displayDetail;
  const key = codexControlItemTextKey(item, "detail");
  return key ? translate(key) : item.detail;
}

export function localizedCodexSurfaceLabel(surface: CodexControlSurface, translate: (key: string) => string): string {
  if (surface.kind === "skill") return surface.label;
  const key = codexSurfaceTextKey(surface, "label");
  return key ? translate(key) : surface.label;
}

export function localizedCodexSurfaceDetail(surface: CodexControlSurface, translate: (key: string) => string): string {
  const key = codexSurfaceTextKey(surface, "detail");
  return key ? translate(key) : surface.detail;
}

function localizedCodexTemplateName(template: CodexConfigTemplate, translate: (key: string) => string): string {
  if (template.origin === "current") return translate("settings.codexControl.templates.currentTemplate.name");
  return template.origin === "builtin" ? translate(`settings.codexControl.templates.builtin.${template.id.slice("builtin.".length)}.name`) : template.name;
}

function localizedCodexTemplateDescription(template: CodexConfigTemplate, translate: (key: string) => string): string {
  if (template.origin === "current") return translate("settings.codexControl.templates.currentTemplate.description");
  return template.origin === "builtin"
    ? translate(`settings.codexControl.templates.builtin.${template.id.slice("builtin.".length)}.description`)
    : template.description;
}

function localizedCodexTemplatePreviewName(preview: CodexConfigTemplatePreview, translate: (key: string) => string): string {
  if (preview.templateId?.startsWith("current.")) return translate("settings.codexControl.templates.currentTemplate.name");
  return preview.templateId?.startsWith("builtin.")
    ? translate(`settings.codexControl.templates.builtin.${preview.templateId.slice("builtin.".length)}.name`)
    : preview.templateName;
}

function localizedCodexTemplatePreviewDescription(preview: CodexConfigTemplatePreview, translate: (key: string) => string): string {
  if (preview.templateId?.startsWith("current.")) return translate("settings.codexControl.templates.currentTemplate.description");
  return preview.templateId?.startsWith("builtin.")
    ? translate(`settings.codexControl.templates.builtin.${preview.templateId.slice("builtin.".length)}.description`)
    : preview.templateDescription;
}

function localizedTemplateItemLabel(label: string, itemId: string, translate: (key: string) => string): string {
  const key = templateItemTextKey(itemId, "label");
  return key ? translate(key) : label;
}

function localizedTemplateItemDetail(detail: string, itemId: string, translate: (key: string) => string): string {
  const key = templateItemTextKey(itemId, "detail");
  return key ? translate(key) : detail;
}

function templateItemTextKey(itemId: string, field: "label" | "detail"): string | undefined {
  const configKey = itemId.startsWith("config.") ? itemId.slice("config.".length).replace(/\./g, "_") : undefined;
  return configKey ? `settings.codexControl.items.${configKey}.${field}` : undefined;
}

function codexControlItemTextKey(item: CodexControlCenterItem, field: "label" | "detail"): string | undefined {
  const configKey = item.id.startsWith("config.") ? item.id.slice("config.".length).replace(/\./g, "_") : undefined;
  if (configKey) return `settings.codexControl.items.${configKey}.${field}`;
  if (item.id.startsWith("surface.")) {
    const surfaceId = item.id.slice("surface.".length);
    const key = codexSurfaceIdTextKey(surfaceId, field);
    if (key) return key;
  }
  return undefined;
}

function codexSurfaceTextKey(surface: CodexControlSurface, field: "label" | "detail"): string | undefined {
  return codexSurfaceIdTextKey(surface.id, field);
}

function codexSurfaceIdTextKey(id: string, field: "label" | "detail"): string | undefined {
  const exact = new Set([
    "config.global",
    "agents.global",
    "mcp.summary",
    "archive.summary",
    "memory.summary",
    "database.state",
    "database.goals",
    "database.memories",
    "database.logs",
    "database.dev",
    "browser.state",
    "browser.output",
    "computer-use.state",
    "mcp-node.runtime",
    "node-repl.runtime",
    "tmp.arg0",
    "vendor-imports.cache",
    "pets.state",
    "plugins.summary"
  ]);
  if (exact.has(id)) return `settings.codexControl.surfaceText.${id.replace(/[-.]/g, "_")}.${field}`;
  if (id.startsWith("rules:")) return `settings.codexControl.surfaceText.rules.${field}`;
  if (id.startsWith("skill:")) return `settings.codexControl.surfaceText.skill.${field}`;
  if (id.startsWith("skill-readonly:")) return `settings.codexControl.surfaceText.skillReadOnly.${field}`;
  return undefined;
}

function codexControlWarningKey(warning: string): string | undefined {
  if (/auth\.json is credential material/i.test(warning)) return "settings.codexControl.warning.authMetadataOnly";
  if (/Raw config editing is blocked so high-risk keys cannot bypass structured confirmation/i.test(warning)) {
    return "settings.codexControl.warning.rawConfigBlocked";
  }
  if (/Sensitive key names were detected\. Raw config editing is blocked/i.test(warning)) {
    return "settings.codexControl.warning.sensitiveKeysBlocked";
  }
  if (/System or plugin-provided skills are read-only/i.test(warning)) return "settings.codexControl.warning.systemSkillsReadOnly";
  if (/Use Codex plugin workflows for install\/remove/i.test(warning)) return "settings.codexControl.warning.pluginWorkflowOnly";
  if (/Sensitive config keys detected; raw editing is blocked/i.test(warning)) return "settings.codexControl.warning.sensitiveConfigBlocked";
  if (/High-risk setting; execution requires explicit confirmation/i.test(warning)) return "settings.codexControl.warning.highRiskConfirm";
  if (/Could not read archived thread count/i.test(warning)) return "settings.codexControl.warning.archivedCountUnreadable";
  if (/Could not open this SQLite database read-only/i.test(warning)) return "settings.codexControl.warning.sqliteMetadataUnreadable";
  if (/currently uses a complex TOML value/i.test(warning)) return "settings.codexControl.warning.complexTomlReplace";
  return undefined;
}

export function firstEditableSurface(snapshot: CodexControlSnapshot): CodexControlSurface | undefined {
  return snapshot.surfaces.find((surface) => surface.editable) ?? snapshot.surfaces[0];
}

export function codexModeDraftFromSnapshot(snapshot: CodexModeConfigSnapshot): CodexModeDraft {
  return {
    defaultModel: snapshot.modes.default.model ?? "",
    defaultReasoningEffort: snapshot.modes.default.reasoningEffort ?? "",
    planReasoningEffort: snapshot.modes.plan.source === "config" ? snapshot.modes.plan.reasoningEffort ?? "" : "",
    reviewModel: snapshot.modes.review.source === "config" ? snapshot.modes.review.model ?? "" : ""
  };
}

export function codexModePatchFromDraft(draft: CodexModeDraft, snapshot: CodexModeConfigSnapshot): CodexModeConfigPatch {
  const current = codexModeDraftFromSnapshot(snapshot);
  const patch: CodexModeConfigPatch = {};
  const defaultModel = draft.defaultModel.trim();
  const defaultReasoningEffort = draft.defaultReasoningEffort.trim();
  const planReasoningEffort = draft.planReasoningEffort.trim();
  const reviewModel = draft.reviewModel.trim();
  if (defaultModel !== current.defaultModel) patch.defaultModel = defaultModel || null;
  if (defaultReasoningEffort !== current.defaultReasoningEffort) {
    patch.defaultReasoningEffort = defaultReasoningEffort || null;
  }
  if (planReasoningEffort !== current.planReasoningEffort) patch.planReasoningEffort = planReasoningEffort || null;
  if (reviewModel !== current.reviewModel) patch.reviewModel = reviewModel || null;
  return patch;
}

function codexModeDraftEqualsSnapshot(draft: CodexModeDraft, snapshot: CodexModeConfigSnapshot): boolean {
  const current = codexModeDraftFromSnapshot(snapshot);
  return (
    draft.defaultModel.trim() === current.defaultModel &&
    draft.defaultReasoningEffort.trim() === current.defaultReasoningEffort &&
    draft.planReasoningEffort.trim() === current.planReasoningEffort &&
    draft.reviewModel.trim() === current.reviewModel
  );
}

export function codexControlDraftFromCenter(snapshot: CodexControlCenterSnapshot): CodexControlDraftMap {
  return Object.fromEntries(snapshot.items.filter((item) => item.keyPath).map((item) => [item.id, item.value])) as CodexControlDraftMap;
}

export function codexControlMutationsFromDraft(
  draft: CodexControlDraftMap,
  snapshot: CodexControlCenterSnapshot
): CodexControlMutationRequest["mutations"] {
  const mutations: CodexControlMutationRequest["mutations"] = [];
  for (const item of snapshot.items) {
    if (!item.keyPath || !item.editable) continue;
    const next = draft[item.id];
    if (Array.isArray(next)) continue;
    const normalizedNext = next === "" || next === undefined ? null : next;
    const current = item.value === undefined ? null : item.value;
    if (normalizedNext === current) continue;
    mutations.push({ itemId: item.id, keyPath: item.keyPath, value: normalizedNext });
  }
  return mutations;
}

export function formatTemplateValue(value: string | number | boolean | string[] | null | undefined): string {
  if (value === undefined) return "unset";
  if (value === null) return "remove";
  if (Array.isArray(value)) return `[${value.join(", ")}]`;
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}
