import type { ReactNode } from "react";

export function PaneHeader(props: { title: string; subtitle: string; action?: ReactNode | undefined }) {
  return (
    <div className="paneHeader">
      <div>
        <h2>{props.title}</h2>
        <p>{props.subtitle}</p>
      </div>
      {props.action && <div className="paneHeaderAction">{props.action}</div>}
    </div>
  );
}
