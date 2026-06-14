import { useTranslation } from "react-i18next";

export function AgentPill(props: { agent: string }) {
  const { t } = useTranslation();
  const key =
    props.agent === "codex" || props.agent === "claude"
      ? `common.agent.${props.agent}`
      : "common.agent.unknown";
  return <span className={`agentPill ${props.agent}`}>{t(key)}</span>;
}

export function Badge(props: { text: string; tone?: "ok" | "warn" | "heuristic" | undefined }) {
  return <span className={`badge ${props.tone ?? ""}`}>{props.text}</span>;
}

export function ConfidenceBadge(props: { value: string }) {
  const { t } = useTranslation();
  const tone = props.value === "exact" ? "ok" : props.value === "heuristic" ? "heuristic" : undefined;
  const key =
    props.value === "exact" ||
    props.value === "indexed" ||
    props.value === "heuristic" ||
    props.value === "unknown"
      ? `common.confidence.${props.value}`
      : undefined;
  return <Badge text={key ? t(key) : props.value} tone={tone} />;
}
