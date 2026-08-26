import type { ReactNode } from "react";

const SERIES = ["var(--color-primary)", "var(--color-secondary)", "var(--color-success)", "var(--color-warning)"];

export function Sparkline({
  values,
  width = 88,
  height = 28,
  color = "var(--color-primary)",
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const d = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / span) * (height - 4) - 2;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg className="sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={d} stroke={color} />
    </svg>
  );
}

export function LineChart({
  series,
  height = 180,
}: {
  series: { label: string; color?: string; values: { label: string; value: number }[] }[];
  height?: number;
}) {
  const labels = series[0]?.values.map((row) => row.label) ?? [];
  const all = series.flatMap((row) => row.values.map((item) => item.value));
  const max = Math.max(...all, 1);
  const width = 640;
  const pad = 28;
  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label="Line chart">
        {[0.25, 0.5, 0.75, 1].map((frac) => (
          <line
            key={frac}
            x1={pad}
            x2={width - 8}
            y1={8 + (height - 32) * (1 - frac)}
            y2={8 + (height - 32) * (1 - frac)}
            stroke="var(--color-border)"
            strokeWidth="1"
          />
        ))}
        {series.map((row, seriesIndex) => {
          const color = row.color ?? SERIES[seriesIndex % SERIES.length];
          const points = row.values.map((item, index) => {
            const x = pad + (index / Math.max(row.values.length - 1, 1)) * (width - pad - 8);
            const y = 8 + (1 - item.value / max) * (height - 32);
            return { x, y, ...item };
          });
          const d = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
          return (
            <g key={row.label}>
              <path d={d} fill="none" stroke={color} strokeWidth="2.25" />
              {points.map((point) => (
                <circle key={`${row.label}-${point.x}`} cx={point.x} cy={point.y} r="3" fill={color} />
              ))}
            </g>
          );
        })}
        {labels.map((label, index) => {
          if (index % Math.ceil(labels.length / 7) !== 0) return null;
          const x = pad + (index / Math.max(labels.length - 1, 1)) * (width - pad - 8);
          return (
            <text key={label + index} x={x} y={height - 4} fontSize="10" fill="var(--color-text-secondary)" textAnchor="middle">
              {label}
            </text>
          );
        })}
      </svg>
      <div className="chart-legend">
        {series.map((row, index) => (
          <span key={row.label}>
            <i style={{ background: row.color ?? SERIES[index % SERIES.length] }} />
            {row.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function BarChart({
  items,
  height = 180,
}: {
  items: { label: string; value: number; color?: string }[];
  height?: number;
}) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <div>
      <svg viewBox={`0 0 640 ${height}`} width="100%" height={height} role="img" aria-label="Bar chart">
        {items.map((item, index) => {
          const barWidth = 640 / (items.length * 1.6);
          const x = 24 + index * (640 / items.length);
          const barHeight = (item.value / max) * (height - 36);
          const y = height - 24 - barHeight;
          return (
            <g key={item.label}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx="3"
                fill={item.color ?? SERIES[index % SERIES.length]}
              />
              <text x={x + barWidth / 2} y={height - 8} fontSize="10" fill="var(--color-text-secondary)" textAnchor="middle">
                {item.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function DonutChart({
  items,
  totalLabel = "Total",
}: {
  items: { label: string; value: number; color?: string }[];
  totalLabel?: string;
}) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 160 160" width="160" height="160" role="img" aria-label="Donut chart">
        <circle cx="80" cy="80" r={radius} fill="none" stroke="var(--color-border)" strokeWidth="16" />
        {total > 0
          ? items.map((item, index) => {
              const color = item.color ?? SERIES[index % SERIES.length];
              const length = (item.value / total) * circumference;
              const circle = (
                <circle
                  key={item.label}
                  cx="80"
                  cy="80"
                  r={radius}
                  fill="none"
                  stroke={color}
                  strokeWidth="16"
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="butt"
                  transform="rotate(-90 80 80)"
                />
              );
              offset += length;
              return circle;
            })
          : null}
        <text x="80" y="76" textAnchor="middle" fontSize="18" fontWeight="600" fill="var(--color-text-primary)">
          {total.toLocaleString()}
        </text>
        <text x="80" y="94" textAnchor="middle" fontSize="10" fill="var(--color-text-secondary)">
          {totalLabel}
        </text>
      </svg>
      <div className="chart-legend donut-legend">
        {items.map((item, index) => {
          const pct = total ? ((item.value / total) * 100).toFixed(1) : "0.0";
          return (
            <span key={item.label}>
              <i style={{ background: item.color ?? SERIES[index % SERIES.length] }} />
              {item.label} {item.value.toLocaleString()} ({pct}%)
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function ChartCard({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}
