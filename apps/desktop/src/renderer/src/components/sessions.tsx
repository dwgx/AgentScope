import { useTranslation } from "react-i18next";
import type { QuarantinedSession } from "@agentscope/shared";

export function StatusPill(props: { status: QuarantinedSession["restoreStatus"] }) {
  const { t } = useTranslation();
  const tone = props.status === "restorable" ? "ok" : props.status === "restored" ? "info" : "warn";
  return <span className={`statusPill ${tone}`}>{t(`views.sessions.recycle.status.${props.status}`)}</span>;
}
