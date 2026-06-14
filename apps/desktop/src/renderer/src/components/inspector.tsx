import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Evidence } from "@agentscope/shared";
import { AgentPill } from "./common.js";
import { displayPath, looksLikeLocalPath } from "../utils/display.js";

export function InspectorHeader(props: { title: string; subtitle: string; agent: string }) {
  return (
    <div className="inspectorHeader">
      <AgentPill agent={props.agent} />
      <h2>{props.title}</h2>
      <p>{props.subtitle}</p>
    </div>
  );
}

export function FieldGroup(props: { title: string; children: ReactNode }) {
  return (
    <section className="fieldGroup">
      <h3>{props.title}</h3>
      <div>{props.children}</div>
    </section>
  );
}

export function Field(props: { label: string; value: ReactNode; mono?: boolean; long?: boolean }) {
  if (props.value === undefined || props.value === null || props.value === "") return null;
  const value = typeof props.value === "string" && looksLikeLocalPath(props.value) ? displayPath(props.value) ?? props.value : props.value;
  return (
    <div className={`field ${props.long ? "longField" : ""}`}>
      <span>{props.label}</span>
      <strong className={props.mono ? "mono" : ""}>{value}</strong>
    </div>
  );
}

export function EvidenceList(props: { evidence: Evidence[] }) {
  const { t } = useTranslation();
  return (
    <FieldGroup title={t("inspector.evidence")}>
      {props.evidence.length ? (
        props.evidence.map((item, index) => (
          <div className="evidenceItem" key={`${item.source}:${item.path}:${item.field}:${index}`}>
            <strong>{item.source}</strong>
            <p>{item.detail}</p>
            {item.path && <span className="mono">{displayPath(item.path)}</span>}
            {item.field && <em>{item.field}</em>}
          </div>
        ))
      ) : (
        <p className="muted">{t("inspector.noEvidence")}</p>
      )}
    </FieldGroup>
  );
}
