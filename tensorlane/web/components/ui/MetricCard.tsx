import type { ReactNode } from "react";

import { Sparkline } from "@/components/ui/Charts";
import { Icon } from "@/components/ui/Icons";

export function MetricCard({
  label,
  value,
  delta,
  hint,
  icon,
  iconTone = "primary",
  series,
  seriesColor,
}: {
  label: string;
  value: ReactNode;
  delta?: { value: string; direction: "up" | "down" | "flat" };
  hint?: string;
  icon?: string;
  iconTone?: "primary" | "success" | "info" | "danger";
  series?: number[];
  seriesColor?: string;
}) {
  return (
    <div className="card metric-card">
      <div className="metric-card-top">
        <p className="kicker" style={{ marginBottom: 0 }}>
          {label}
        </p>
        {icon ? (
          <span className="icon-tile" data-tone={iconTone}>
            <Icon name={icon} />
          </span>
        ) : null}
      </div>
      <div className="metric" style={{ marginTop: 10 }}>
        {value}
      </div>
      <div className="metric-card-foot">
        <div>
          {delta ? <div className={`metric-delta ${delta.direction}`}>{delta.value}</div> : null}
          {hint ? (
            <p className="lede" style={{ margin: "4px 0 0", fontSize: 12 }}>
              {hint}
            </p>
          ) : null}
        </div>
        {series && series.length > 1 ? <Sparkline values={series} color={seriesColor} /> : null}
      </div>
    </div>
  );
}
