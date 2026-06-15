import { Code2, FileText } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type {
  CodexControlCenterItem,
  CodexControlCenterSection,
  CodexControlCenterSnapshot,
  CodexControlDocument,
  CodexControlMutationRequest,
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

export type CodexControlTab = CodexControlCenterSection | "files";
export type CodexModeDraft = {
  defaultModel: string;
  defaultReasoningEffort: string;
  planReasoningEffort: string;
  reviewModel: string;
};
export type CodexControlDraftMap = Record<string, string | number | boolean | undefined>;

const fallbackCodexModels = ["gpt-5.5", "gpt-5.4-mini", "gpt-5.3-codex-spark"];
const fallbackReasoningEfforts = ["minimal", "low", "medium", "high", "xhigh"];
const fallbackPlanReasoningEfforts = ["none", ...fallbackReasoningEfforts];

export function CodexControlCenterPanel(props: {
  snapshot: CodexControlCenterSnapshot | null;
  surfaces?: CodexControlSurface[] | undefined;
  draft: CodexControlDraftMap;
  tab: CodexControlTab;
  loading: boolean;
  status?: string | undefined;
  readOnlyMode: boolean;
  onTabChange: (tab: CodexControlTab) => void;
  onDraftChange: (draft: CodexControlDraftMap) => void;
  onRefresh: () => void;
  onSave: () => void;
  onRevealPath: (targetPath?: string) => void;
  onSelectSurface: (surface: CodexControlSurface) => void;
}) {
  const { t } = useTranslation();
  const tabs: CodexControlTab[] = ["overview", "models", "safety", "runtime", "mcp", "skills", "storage", "files"];
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
        <MiniSegmentedControl
          value={props.tab}
          values={tabs}
          label={(tab) => t(`settings.codexControl.tabs.${tab}`)}
          testId="codex-control-tabs"
          onChange={props.onTabChange}
        />
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
              value={props.draft[item.id]}
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
            allowCustom={false}
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
    const normalizedNext = next === "" || next === undefined ? null : next;
    const current = item.value === undefined ? null : item.value;
    if (normalizedNext === current) continue;
    mutations.push({ itemId: item.id, keyPath: item.keyPath, value: normalizedNext });
  }
  return mutations;
}
