import type { ReactNode } from "react";

import { Sparkline } from "@/components/ui/Charts";
import { Icon } from "@/components/ui/Icons";

export function MetricCard({
  label,
  value,
  delta,
  hint,
  icon,
  series,
}: {
  label: string;
  value: ReactNode;
  delta?: { value: string; direction: "up" | "down" | "flat" };
  hint?: string;
  icon?: string;
  series?: number[];
}) {
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <p className="kicker" style={{ marginBottom: 0 }}>
          {label}
        </p>
        {icon ? (
          <span style={{ color: "var(--color-primary)" }}>
            <Icon name={icon} />
          </span>
        ) : null}
      </div>
      <div className="metric" style={{ marginTop: 10 }}>
        {value}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 8, marginTop: 8 }}>
        <div>
          {delta ? <div className={`metric-delta ${delta.direction}`}>{delta.value}</div> : null}
          {hint ? (
            <p className="lede" style={{ margin: "4px 0 0", fontSize: 12 }}>
              {hint}
            </p>
          ) : null}
        </div>
        {series && series.length > 1 ? <Sparkline values={series} /> : null}
      </div>
    </div>
  );
}
