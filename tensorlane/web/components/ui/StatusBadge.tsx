export function StatusBadge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "success" | "danger" | "warning" | "info" | "neutral";
}) {
  return (
    <span className="status-badge" data-tone={tone}>
      {label}
    </span>
  );
}
