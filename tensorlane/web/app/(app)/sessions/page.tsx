"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/ui/DataTable";
import { ErrorState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/format";
import { useSyncedSearchParams } from "@/lib/useSyncedSearchParams";
import { useTrackingContext } from "@/lib/useTrackingContext";
import { searchExperiments, searchTraces, traceSessionId } from "@/lib/tracking";

type SessionRow = {
  id: string;
  traces: number;
  lastAt: number | null;
  lastName: string;
  experimentId: string;
};

function SessionsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ctx = useTrackingContext();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useSyncedSearchParams({ q: query });

  async function load() {
    if (!ctx) return;
    setLoading(true);
    const experiments = await searchExperiments(ctx);
    if (!experiments.ok) {
      setError(experiments.message);
      setLoading(false);
      return;
    }
    const ids = (experiments.data.experiments ?? [])
      .map((row) => row.experiment_id)
      .filter((id): id is string => Boolean(id));
    const traces = await searchTraces(ctx, ids, { maxResults: 200 });
    if (!traces.ok) {
      setError(traces.message);
      setLoading(false);
      return;
    }
    const grouped = new Map<string, SessionRow>();
    for (const trace of traces.data.traces ?? []) {
      const session = traceSessionId(trace);
      if (!session) continue;
      const at = Number(trace.timestamp_ms) || 0;
      const current = grouped.get(session);
      if (!current) {
        grouped.set(session, {
          id: session,
          traces: 1,
          lastAt: at || null,
          lastName: trace.name || "trace",
          experimentId: trace.trace_location?.mlflow_experiment?.experiment_id ?? "",
        });
        continue;
      }
      current.traces += 1;
      if (at && (!current.lastAt || at > current.lastAt)) {
        current.lastAt = at;
        current.lastName = trace.name || current.lastName;
      }
    }
    setError(null);
    setRows([...grouped.values()].sort((a, b) => (b.lastAt ?? 0) - (a.lastAt ?? 0)));
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [ctx]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => `${row.id} ${row.lastName}`.toLowerCase().includes(needle));
  }, [query, rows]);

  return (
    <div className="page">
      <PageHeader
        kicker="AI"
        title="Sessions"
        lede="Chat sessions grouped from traces that carry a session id. Open a session to see every turn."
      />
      <div className="card">
        {error ? (
          <ErrorState title="Unable to load sessions" body={error} onRetry={() => void load()} />
        ) : (
          <DataTable
            columns={[
              { id: "id", header: "Session", cell: (row) => <span className="mono">{row.id}</span> },
              { id: "traces", header: "Turns", cell: (row) => row.traces },
              { id: "last", header: "Last turn", cell: (row) => row.lastName },
              {
                id: "experiment",
                header: "Experiment",
                cell: (row) => row.experimentId || "—",
              },
              {
                id: "time",
                header: "Last activity",
                cell: (row) => (row.lastAt ? formatDate(new Date(row.lastAt).toISOString()) : "—"),
              },
            ]}
            rows={filtered}
            rowKey={(row) => row.id}
            loading={loading}
            searchable
            search={query}
            onSearch={setQuery}
            searchPlaceholder="Session id"
            emptyTitle="No chat sessions yet"
            emptyBody="Instrument traces with a session id. Tensorlane groups turns that share that id."
            onRowClick={(row) => router.push(`/traces?q=${encodeURIComponent(row.id)}`)}
          />
        )}
      </div>
    </div>
  );
}

export default function SessionsPage() {
  return (
    <Suspense fallback={<div className="page">Loading sessions…</div>}>
      <SessionsInner />
    </Suspense>
  );
}
