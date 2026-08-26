import type { ReactNode } from "react";

const SERIES = ["var(--color-primary)", "var(--color-secondary)", "var(--color-success)", "var(--color-warning)"];

export function Sparkline({ values, width = 88, height = 28 }: { values: number[]; width?: number; height?: number }) {
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
      <path d={d} />
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
          const d = row.values
            .map((item, index) => {
              const x = pad + (index / Math.max(row.values.length - 1, 1)) * (width - pad - 8);
              const y = 8 + (1 - item.value / max) * (height - 32);
              return `${index === 0 ? "M" : "L"}${x} ${y}`;
            })
            .join(" ");
          return <path key={row.label} d={d} fill="none" stroke={color} strokeWidth="2" />;
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
