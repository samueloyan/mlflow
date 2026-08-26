export function Avatar({
  name,
  size = 28,
}: {
  name: string;
  size?: number;
}) {
  const label = name.trim() || "?";
  const parts = label.split(/\s+/);
  const letters =
    parts.length === 1
      ? label.slice(0, 2).toUpperCase()
      : `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase();
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size < 28 ? 10 : 12 }} aria-hidden="true">
      {letters}
    </span>
  );
}
