"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { SavedViews } from "@/components/SavedViews";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDurationBetween, formatEpoch } from "@/lib/format";
import { useTrackingContext } from "@/lib/useTrackingContext";
import { useSyncedSearchParams } from "@/lib/useSyncedSearchParams";
import {
  metricMap,
  runId,
  runName,
  runStatusLabel,
  runStatusTone,
  searchExperiments,
  searchRuns,
  tagMap,
  type Experiment,
  type Run,
} from "@/lib/tracking";

function RunsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ctx = useTrackingContext();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [status, setStatus] = useState(searchParams.get("status") ?? "all");
  const [experimentFilter, setExperimentFilter] = useState(searchParams.get("experiment") ?? "all");
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useSyncedSearchParams({ q: query, status, experiment: experimentFilter });

  async function load() {
    if (!ctx) return;
    setLoading(true);
    setError(null);
    const experimentsResult = await searchExperiments(ctx);
    if (!experimentsResult.ok) {
      setError(experimentsResult.message);
      setLoading(false);
      return;
    }
    const experimentRows = experimentsResult.data.experiments ?? [];
    setExperiments(experimentRows);
    const ids =
      experimentFilter !== "all"
        ? [experimentFilter]
        : experimentRows.map((row) => row.experiment_id).filter((id): id is string => Boolean(id));
    const runsResult = await searchRuns(ctx, ids, { maxResults: 200 });
    if (!runsResult.ok) {
      setError(runsResult.message);
      setLoading(false);
      return;
    }
    setRuns(runsResult.data.runs ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [ctx, experimentFilter]);

  const experimentName = useMemo(() => {
    return Object.fromEntries(experiments.map((row) => [row.experiment_id ?? "", row.name ?? row.experiment_id ?? ""]));
  }, [experiments]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return runs.filter((run) => {
      if (status !== "all" && (run.info?.status ?? "").toUpperCase() !== status.toUpperCase()) return false;
      if (!needle) return true;
      const hay = `${runName(run)} ${run.info?.user_id ?? ""} ${runId(run)} ${Object.values(tagMap(run.data?.tags)).join(" ")}`;
      return hay.toLowerCase().includes(needle);
    });
  }, [query, runs, status]);

  return (
    <div className="page">
      <PageHeader kicker="Build" title="Runs" lede="Browse and compare experiment runs.">
        <button
          type="button"
          className="btn"
          disabled={selected.length < 2 || selected.length > 10}
          onClick={() => router.push(`/runs/compare?ids=${selected.join(",")}`)}
        >
          Compare
        </button>
      </PageHeader>
      <div className="grid">
        <div className="span-9">
          <div className="card">
            <DataTable
              columns={[
                { id: "name", header: "Run Name", sortValue: (row) => runName(row), cell: (row) => runName(row) },
                {
                  id: "experiment",
                  header: "Experiment",
                  cell: (row) => experimentName[row.info?.experiment_id ?? ""] || row.info?.experiment_id,
                },
                {
                  id: "status",
                  header: "Status",
                  cell: (row) => (
                    <StatusBadge label={runStatusLabel(row.info?.status)} tone={runStatusTone(row.info?.status)} />
                  ),
                },
                { id: "user", header: "User", cell: (row) => row.info?.user_id ?? "—" },
                {
                  id: "started",
                  header: "Started",
                  sortValue: (row) => Number(row.info?.start_time) || 0,
                  cell: (row) => formatEpoch(row.info?.start_time),
                },
                {
                  id: "duration",
                  header: "Duration",
                  cell: (row) => formatDurationBetween(row.info?.start_time, row.info?.end_time),
                },
                {
                  id: "metrics",
                  header: "Metrics",
                  cell: (row) =>
                    Object.entries(metricMap(row.data?.metrics))
                      .slice(0, 3)
                      .map(([key, value]) => `${key} ${value}`)
                      .join(" · ") || "—",
                },
                {
                  id: "model",
                  header: "Model",
                  cell: (row) => tagMap(row.data?.tags)["mlflow.log-model.history"] ? "logged" : paramMapSafe(row, "model"),
                },
                {
                  id: "tags",
                  header: "Tags",
                  cell: (row) =>
                    Object.entries(tagMap(row.data?.tags))
                      .filter(([key]) => !key.startsWith("mlflow."))
                      .slice(0, 3)
                      .map(([key, value]) => `${key}:${value}`)
                      .join(", ") || "—",
                },
              ]}
              rows={filtered}
              rowKey={runId}
              loading={loading}
              error={error}
              onRetry={() => void load()}
              searchable
              search={query}
              onSearch={setQuery}
              searchPlaceholder="Search runs"
              filters={
                <>
                  <select className="quiet" value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Status">
                    <option value="all">All statuses</option>
                    <option value="FINISHED">Completed</option>
                    <option value="FAILED">Failed</option>
                    <option value="RUNNING">Running</option>
                    <option value="KILLED">Killed</option>
                  </select>
                  <select
                    className="quiet"
                    value={experimentFilter}
                    onChange={(event) => setExperimentFilter(event.target.value)}
                    aria-label="Experiment"
                  >
                    <option value="all">All experiments</option>
                    {experiments.map((row) => (
                      <option key={row.experiment_id} value={row.experiment_id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </>
              }
              selectable
              selected={selected}
              onSelectedChange={setSelected}
              bulkActions={
                <button
                  type="button"
                  className="btn"
                  onClick={() => router.push(`/runs/compare?ids=${selected.join(",")}`)}
                >
                  Compare {selected.length} runs
                </button>
              }
              emptyTitle="No runs yet"
              emptyBody="Log a run with the Python SDK against this tracking host."
              onRowClick={(row) => router.push(`/runs/${runId(row)}`)}
            />
          </div>
        </div>
        <SavedViews
          surface="runs"
          query={{ q: query, status, experiment: experimentFilter }}
          onApply={(next) => {
            setQuery(String(next.q ?? ""));
            setStatus(String(next.status ?? "all"));
            setExperimentFilter(String(next.experiment ?? "all"));
          }}
        />
      </div>
    </div>
  );
}

function paramMapSafe(run: Run, key: string): string {
  const params = run.data?.params ?? [];
  return params.find((param) => param.key === key)?.value ?? "—";
}

export default function RunsPage() {
  return (
    <Suspense fallback={<div className="page">Loading runs…</div>}>
      <RunsInner />
    </Suspense>
  );
}
