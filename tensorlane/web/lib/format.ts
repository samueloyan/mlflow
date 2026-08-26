export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function formatUsd(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return "—";
  return value.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function formatCount(value: number | undefined | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  return value.toLocaleString();
}

export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 2 : 1)}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = Math.round(seconds % 60);
  if (minutes < 60) return `${minutes}m ${rem}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function formatEpoch(ms: number | string | null | undefined): string {
  if (ms === null || ms === undefined || ms === "") return "—";
  const value = typeof ms === "string" ? Number(ms) : ms;
  if (Number.isNaN(value) || value <= 0) return "—";
  return formatDate(new Date(value).toISOString());
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export function formatDurationBetween(
  startMs: number | string | null | undefined,
  endMs: number | string | null | undefined,
): string {
  const start = Number(startMs);
  const end = Number(endMs);
  if (!start || Number.isNaN(start)) return "—";
  if (!end || Number.isNaN(end) || end < start) return "Running";
  return formatMs(end - start);
}

export function shortId(value: string | null | undefined, size = 10): string {
  if (!value) return "—";
  if (value.length <= size + 1) return value;
  return `${value.slice(0, size)}…`;
}

export function periodDelta(series: { value: number }[]): {
  value: string;
  direction: "up" | "down" | "flat";
} {
  if (series.length < 2) {
    return { value: "0% vs prior period", direction: "flat" };
  }
  const mid = Math.ceil(series.length / 2);
  const previous = series.slice(0, mid).reduce((sum, row) => sum + row.value, 0);
  const current = series.slice(mid).reduce((sum, row) => sum + row.value, 0);
  if (previous === 0 && current === 0) {
    return { value: "0% vs prior period", direction: "flat" };
  }
  if (previous === 0) {
    return { value: "+100% vs prior period", direction: "up" };
  }
  const pct = ((current - previous) / previous) * 100;
  const direction = pct > 0.5 ? "up" : pct < -0.5 ? "down" : "flat";
  const sign = pct > 0 ? "+" : "";
  return { value: `${sign}${Math.round(pct)}% vs prior period`, direction };
}

export async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}
