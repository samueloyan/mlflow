"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { SavedViews } from "@/components/SavedViews";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDate, formatMs, shortId } from "@/lib/format";
import { useTrackingContext } from "@/lib/useTrackingContext";
import { useSyncedSearchParams } from "@/lib/useSyncedSearchParams";
import {
  parseDurationMs,
  searchExperiments,
  searchTraces,
  tagMap,
  traceStatus,
  type TraceInfo,
} from "@/lib/tracking";

function TracesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ctx = useTrackingContext();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [status, setStatus] = useState(searchParams.get("status") ?? "all");
  const [application, setApplication] = useState(searchParams.get("application") ?? "all");
  const [model, setModel] = useState(searchParams.get("model") ?? "all");
  const [rows, setRows] = useState<TraceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useSyncedSearchParams({ q: query, status, application, model });

  async function load() {
    if (!ctx) return;
    setLoading(true);
    setError(null);
    const experiments = await searchExperiments(ctx);
    if (!experiments.ok) {
      setError(experiments.message);
      setLoading(false);
      return;
    }
    const ids = (experiments.data.experiments ?? [])
      .map((row) => row.experiment_id)
      .filter((id): id is string => Boolean(id));
    const traces = await searchTraces(ctx, ids, { maxResults: 100 });
    if (!traces.ok) {
      setError(traces.message);
      setLoading(false);
      return;
    }
    setRows(traces.data.traces ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [ctx]);

  const applications = useMemo(() => {
    const values = new Set<string>();
    for (const row of rows) {
      const value = row.trace_metadata?.["mlflow.source.name"] || tagMap(row.tags).application;
      if (value) values.add(value);
    }
    return [...values].sort();
  }, [rows]);

  const models = useMemo(() => {
    const values = new Set<string>();
    for (const row of rows) {
      const value = row.trace_metadata?.["mlflow.trace.model"] || tagMap(row.tags).model;
      if (value) values.add(value);
    }
    return [...values].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      const state = traceStatus(row).toUpperCase();
      if (status === "ok" && state !== "OK" && state !== "SUCCESS") return false;
      if (status === "error" && state !== "ERROR" && state !== "FAILED") return false;
      const tags = tagMap(row.tags);
      const app = row.trace_metadata?.["mlflow.source.name"] || tags.application || "";
      const modelName = row.trace_metadata?.["mlflow.trace.model"] || tags.model || "";
      if (application !== "all" && app !== application) return false;
      if (model !== "all" && modelName !== model) return false;
      const needle = query.trim().toLowerCase();
      if (!needle) return true;
      const hay = `${row.trace_id ?? ""} ${row.request_id ?? ""} ${row.name ?? ""} ${JSON.stringify(tags)} ${JSON.stringify(row.trace_metadata ?? {})}`;
      return hay.toLowerCase().includes(needle);
    });
  }, [application, model, query, rows, status]);

  return (
    <div className="page">
      <PageHeader kicker="AI" title="Traces" lede="Observe and debug your AI applications." />
      <div className="grid">
        <div className="span-9">
          <div className="card">
            <DataTable
              columns={[
                {
                  id: "id",
                  header: "Trace ID",
                  cell: (row) => <span className="mono">{shortId(row.trace_id || row.request_id, 14)}</span>,
                },
                { id: "name", header: "Name", cell: (row) => row.name || tagMap(row.tags)["mlflow.traceName"] || "trace" },
                {
                  id: "application",
                  header: "Application",
                  cell: (row) => row.trace_metadata?.["mlflow.source.name"] || tagMap(row.tags).application || "—",
                },
                {
                  id: "model",
                  header: "Model",
                  cell: (row) => row.trace_metadata?.["mlflow.trace.model"] || tagMap(row.tags).model || "—",
                },
                {
                  id: "duration",
                  header: "Duration",
                  cell: (row) => row.execution_duration || formatMs(parseDurationMs(row.execution_time_ms ?? undefined) ?? undefined),
                },
                {
                  id: "tokens",
                  header: "Tokens",
                  cell: (row) =>
                    row.trace_metadata?.["mlflow.trace.tokenUsage"] ||
                    tagMap(row.tags)["mlflow.trace.tokenUsage"] ||
                    "—",
                },
                {
                  id: "cost",
                  header: "Cost",
                  cell: (row) => tagMap(row.tags).cost || row.trace_metadata?.cost || "—",
                },
                {
                  id: "status",
                  header: "Status",
                  cell: (row) => {
                    const label = traceStatus(row);
                    const tone = label === "OK" || label === "SUCCESS" ? "success" : label === "ERROR" ? "danger" : "neutral";
                    return <StatusBadge label={label} tone={tone} />;
                  },
                },
                {
                  id: "time",
                  header: "Time",
                  cell: (row) =>
                    row.request_time
                      ? formatDate(row.request_time)
                      : row.timestamp_ms
                        ? formatDate(new Date(Number(row.timestamp_ms)).toISOString())
                        : "—",
                },
              ]}
              rows={filtered}
              rowKey={(row) => row.trace_id || row.request_id || "trace"}
              loading={loading}
              error={error}
              onRetry={() => void load()}
              searchable
              search={query}
              onSearch={setQuery}
              searchPlaceholder="Search name or trace id"
              filters={
                <>
                  <select className="quiet" value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Status">
                    <option value="all">All statuses</option>
                    <option value="ok">OK</option>
                    <option value="error">Error</option>
                  </select>
                  <select
                    className="quiet"
                    value={application}
                    onChange={(event) => setApplication(event.target.value)}
                    aria-label="Application"
                  >
                    <option value="all">All applications</option>
                    {applications.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                  <select className="quiet" value={model} onChange={(event) => setModel(event.target.value)} aria-label="Model">
                    <option value="all">All models</option>
                    {models.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </>
              }
              emptyTitle="No traces yet"
              emptyBody="Instrument with mlflow.trace or an OpenTelemetry exporter pointed at this host."
              onRowClick={(row) => {
                const id = row.trace_id || row.request_id;
                if (id) router.push(`/traces/${id}`);
              }}
            />
          </div>
        </div>
        <SavedViews
          surface="traces"
          query={{ q: query, status, application, model }}
          onApply={(next) => {
            setQuery(String(next.q ?? ""));
            setStatus(String(next.status ?? "all"));
            setApplication(String(next.application ?? "all"));
            setModel(String(next.model ?? "all"));
          }}
        />
      </div>
    </div>
  );
}

export default function TracesPage() {
  return (
    <Suspense fallback={<div className="page">Loading traces…</div>}>
      <TracesInner />
    </Suspense>
  );
}
