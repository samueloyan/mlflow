export function UsageMeter({
  label,
  current,
  limit,
  tone = "primary",
  warning,
  overLimit,
}: {
  label: string;
  current: number;
  limit: number;
  tone?: "primary" | "info" | "success" | "warning";
  warning?: boolean;
  overLimit?: boolean;
}) {
  const ratio = limit > 0 ? Math.min(100, (current / limit) * 100) : 0;
  return (
    <div className="usage-row">
      <div className="usage-row-head">
        <span>{label}</span>
        <span>
          {current.toLocaleString()} / {limit.toLocaleString()}
        </span>
      </div>
      <div className={`meter ${overLimit ? "danger" : warning ? "warn" : ""}`} data-tone={tone}>
        <i style={{ width: `${ratio}%` }} />
      </div>
    </div>
  );
}
