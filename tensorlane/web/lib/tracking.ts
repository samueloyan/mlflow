import { mlflowCall, type MlflowResult } from "@/lib/mlflow";

export type Experiment = {
  experiment_id?: string;
  name?: string;
  lifecycle_stage?: string;
  artifact_location?: string;
  creation_time?: number | string;
  last_update_time?: number | string;
  tags?: { key?: string; value?: string }[];
};

export type Metric = { key?: string; value?: number | string; timestamp?: number | string; step?: number };
export type Param = { key?: string; value?: string };
export type Tag = { key?: string; value?: string };

export type RunInfo = {
  run_id?: string;
  run_uuid?: string;
  run_name?: string;
  experiment_id?: string;
  user_id?: string;
  status?: string;
  start_time?: number | string;
  end_time?: number | string;
  artifact_uri?: string;
  lifecycle_stage?: string;
};

export type Run = {
  info?: RunInfo;
  data?: { metrics?: Metric[]; params?: Param[]; tags?: Tag[] };
};

export type RegisteredModel = {
  name?: string;
  creation_timestamp?: number;
  last_updated_timestamp?: number;
  user_id?: string;
  latest_versions?: { name?: string; version?: string; current_stage?: string; aliases?: string[] }[];
  aliases?: { alias?: string; version?: string }[];
};

export type TraceInfo = {
  trace_id?: string;
  request_id?: string;
  name?: string;
  status?: string;
  state?: string;
  timestamp_ms?: number;
  request_time?: string;
  execution_duration?: string;
  execution_time_ms?: number;
  request_preview?: string;
  response_preview?: string;
  tags?: Record<string, string> | { key?: string; value?: string }[];
  trace_metadata?: Record<string, string>;
  trace_location?: { mlflow_experiment?: { experiment_id?: string } };
};

export type TraceSpan = {
  trace_id?: string;
  span_id?: string;
  parent_span_id?: string | null;
  name?: string;
  start_time_unix_nano?: string | number;
  end_time_unix_nano?: string | number;
  start_time?: number;
  end_time?: number;
  status?: { code?: string; message?: string } | string;
  attributes?: Record<string, unknown>;
  events?: { name?: string; attributes?: Record<string, unknown> }[];
};

export type TrackingContext = {
  organizationId: string;
  workspaceId: string;
};

function ctxInit(ctx: TrackingContext, init?: RequestInit): RequestInit & TrackingContext {
  return { ...init, organizationId: ctx.organizationId, workspaceId: ctx.workspaceId };
}

export function tagMap(tags: Tag[] | Record<string, string> | undefined): Record<string, string> {
  if (!tags) return {};
  if (Array.isArray(tags)) {
    return Object.fromEntries(tags.filter((tag) => tag.key).map((tag) => [tag.key ?? "", tag.value ?? ""]));
  }
  return tags;
}

export function metricMap(metrics: Metric[] | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const metric of metrics ?? []) {
    if (!metric.key) continue;
    const value = Number(metric.value);
    if (!Number.isNaN(value)) out[metric.key] = value;
  }
  return out;
}

export function paramMap(params: Param[] | undefined): Record<string, string> {
  return Object.fromEntries((params ?? []).filter((row) => row.key).map((row) => [row.key ?? "", row.value ?? ""]));
}

export function runId(run: Run | undefined): string {
  return run?.info?.run_id || run?.info?.run_uuid || "";
}

export function runName(run: Run | undefined): string {
  const tags = tagMap(run?.data?.tags);
  return run?.info?.run_name || tags["mlflow.runName"] || runId(run) || "run";
}

export function runStatusLabel(status: string | undefined): string {
  const value = (status ?? "").toUpperCase();
  if (value === "FINISHED") return "Completed";
  if (value === "FAILED") return "Failed";
  if (value === "RUNNING") return "Running";
  if (value === "KILLED") return "Killed";
  if (value === "SCHEDULED") return "Scheduled";
  return status || "Unknown";
}

export function runStatusTone(status: string | undefined): "success" | "danger" | "warning" | "info" | "neutral" {
  const value = (status ?? "").toUpperCase();
  if (value === "FINISHED" || value === "OK" || value === "COMPLETED") return "success";
  if (value === "FAILED" || value === "ERROR" || value === "KILLED") return "danger";
  if (value === "RUNNING") return "info";
  if (value === "SCHEDULED" || value === "IN_PROGRESS") return "warning";
  return "neutral";
}

export function traceStatus(trace: TraceInfo): string {
  return trace.state || trace.status || "UNKNOWN";
}

export async function searchExperiments(
  ctx: TrackingContext,
  maxResults = 200,
): Promise<MlflowResult<{ experiments?: Experiment[]; next_page_token?: string }>> {
  return mlflowCall("/ajax-api/2.0/mlflow/experiments/search", {
    ...ctxInit(ctx),
    method: "POST",
    body: JSON.stringify({ max_results: maxResults, order_by: ["last_update_time DESC"] }),
  });
}

export async function getExperiment(
  ctx: TrackingContext,
  experimentId: string,
): Promise<MlflowResult<{ experiment?: Experiment }>> {
  return mlflowCall(`/ajax-api/2.0/mlflow/experiments/get?experiment_id=${encodeURIComponent(experimentId)}`, {
    ...ctxInit(ctx),
    method: "GET",
  });
}

export async function createExperiment(
  ctx: TrackingContext,
  name: string,
): Promise<MlflowResult<{ experiment_id?: string }>> {
  return mlflowCall("/ajax-api/2.0/mlflow/experiments/create", {
    ...ctxInit(ctx),
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function searchRuns(
  ctx: TrackingContext,
  experimentIds: string[],
  options?: { filter?: string; maxResults?: number; orderBy?: string[] },
): Promise<MlflowResult<{ runs?: Run[]; next_page_token?: string }>> {
  if (experimentIds.length === 0) {
    return { ok: true, data: { runs: [] } };
  }
  return mlflowCall("/ajax-api/2.0/mlflow/runs/search", {
    ...ctxInit(ctx),
    method: "POST",
    body: JSON.stringify({
      experiment_ids: experimentIds,
      filter: options?.filter ?? "",
      max_results: options?.maxResults ?? 100,
      order_by: options?.orderBy ?? ["attributes.start_time DESC"],
    }),
  });
}

export async function getRun(ctx: TrackingContext, id: string): Promise<MlflowResult<{ run?: Run }>> {
  return mlflowCall(`/ajax-api/2.0/mlflow/runs/get?run_id=${encodeURIComponent(id)}`, {
    ...ctxInit(ctx),
    method: "GET",
  });
}

export async function getMetricHistory(
  ctx: TrackingContext,
  runIdValue: string,
  metricKey: string,
): Promise<MlflowResult<{ metrics?: Metric[] }>> {
  const params = new URLSearchParams({ run_id: runIdValue, metric_key: metricKey });
  return mlflowCall(`/ajax-api/2.0/mlflow/metrics/get-history?${params}`, {
    ...ctxInit(ctx),
    method: "GET",
  });
}

export async function listArtifacts(
  ctx: TrackingContext,
  runIdValue: string,
  path = "",
): Promise<MlflowResult<{ files?: { path?: string; is_dir?: boolean; file_size?: number }[] }>> {
  const params = new URLSearchParams({ run_id: runIdValue });
  if (path) params.set("path", path);
  return mlflowCall(`/ajax-api/2.0/mlflow/artifacts/list?${params}`, {
    ...ctxInit(ctx),
    method: "GET",
  });
}

export async function searchRegisteredModels(
  ctx: TrackingContext,
): Promise<MlflowResult<{ registered_models?: RegisteredModel[] }>> {
  return mlflowCall("/ajax-api/2.0/mlflow/registered-models/search?max_results=100", {
    ...ctxInit(ctx),
    method: "GET",
  });
}

export async function searchLoggedModels(
  ctx: TrackingContext,
  experimentIds?: string[],
): Promise<MlflowResult<{ models?: { info?: { name?: string; experiment_id?: string; source_run_id?: string } }[] }>> {
  return mlflowCall("/ajax-api/2.0/mlflow/logged-models/search", {
    ...ctxInit(ctx),
    method: "POST",
    body: JSON.stringify({ experiment_ids: experimentIds, max_results: 50 }),
  });
}

export function experimentLocations(experimentIds: string[]): { mlflow_experiment: { experiment_id: string } }[] {
  return experimentIds.map((experiment_id) => ({ mlflow_experiment: { experiment_id } }));
}

export async function searchTraces(
  ctx: TrackingContext,
  experimentIds: string[],
  options?: { filter?: string; maxResults?: number },
): Promise<MlflowResult<{ traces?: TraceInfo[]; next_page_token?: string }>> {
  if (experimentIds.length === 0) {
    return { ok: true, data: { traces: [] } };
  }
  return mlflowCall("/ajax-api/3.0/mlflow/traces/search", {
    ...ctxInit(ctx),
    method: "POST",
    body: JSON.stringify({
      locations: experimentLocations(experimentIds),
      filter: options?.filter ?? "",
      max_results: options?.maxResults ?? 100,
      order_by: ["timestamp_ms DESC"],
    }),
  });
}

export async function getTrace(
  ctx: TrackingContext,
  traceId: string,
): Promise<MlflowResult<{ trace?: { trace_info?: TraceInfo; spans?: TraceSpan[] } }>> {
  const params = new URLSearchParams({ trace_id: traceId, allow_partial: "true" });
  return mlflowCall(`/ajax-api/3.0/mlflow/traces/get?${params}`, {
    ...ctxInit(ctx),
    method: "GET",
  });
}

export async function getTraceArtifact(
  ctx: TrackingContext,
  requestId: string,
): Promise<MlflowResult<{ spans?: TraceSpan[] }>> {
  return mlflowCall(`/ajax-api/2.0/mlflow/get-trace-artifact?request_id=${encodeURIComponent(requestId)}`, {
    ...ctxInit(ctx),
    method: "GET",
  });
}

export function parseDurationMs(value: string | number | undefined): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") return value;
  const match = /^([\d.]+)\s*(ms|s|m|h)?$/i.exec(value.trim());
  if (!match) {
    const asNumber = Number(value);
    return Number.isNaN(asNumber) ? null : asNumber;
  }
  const amount = Number(match[1]);
  const unit = (match[2] ?? "ms").toLowerCase();
  if (unit === "s") return amount * 1000;
  if (unit === "m") return amount * 60_000;
  if (unit === "h") return amount * 3_600_000;
  return amount;
}

export function spanDurationMs(span: TraceSpan): number {
  if (span.start_time_unix_nano && span.end_time_unix_nano) {
    const start = Number(span.start_time_unix_nano);
    const end = Number(span.end_time_unix_nano);
    if (!Number.isNaN(start) && !Number.isNaN(end) && end >= start) {
      return (end - start) / 1_000_000;
    }
  }
  if (span.start_time && span.end_time && span.end_time >= span.start_time) {
    return span.end_time - span.start_time;
  }
  return 0;
}

export function spanType(span: TraceSpan): string {
  const attributes = span.attributes ?? {};
  const value = attributes["mlflow.spanType"] ?? attributes["span_type"];
  return typeof value === "string" ? value : "SPAN";
}

export function spanIO(span: TraceSpan): { input: unknown; output: unknown } {
  const attributes = span.attributes ?? {};
  return {
    input: attributes["mlflow.spanInputs"] ?? attributes.inputs,
    output: attributes["mlflow.spanOutputs"] ?? attributes.outputs,
  };
}

export function bucketByDay(timestamps: number[], days = 14): { label: string; value: number }[] {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const counts = new Map<string, number>();
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date(now);
    day.setDate(now.getDate() - i);
    counts.set(day.toISOString().slice(0, 10), 0);
  }
  for (const ts of timestamps) {
    if (!ts) continue;
    const key = new Date(ts).toISOString().slice(0, 10);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([key, value]) => ({ label: key.slice(5), value }));
}
