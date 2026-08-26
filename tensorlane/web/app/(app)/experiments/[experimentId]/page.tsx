"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/PageHeader";
import { BarChart, ChartCard, LineChart } from "@/components/ui/Charts";
import { ErrorState } from "@/components/ui/EmptyState";
import { MetricCard } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Tabs } from "@/components/ui/Tabs";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { formatCount, formatEpoch, formatPercent } from "@/lib/format";
import { useTrackingContext } from "@/lib/useTrackingContext";
import {
  bucketByDay,
  getExperiment,
  metricMap,
  runId,
  runName,
  runStatusLabel,
  runStatusTone,
  searchLoggedModels,
  searchRuns,
  searchTraces,
  tagMap,
  type Experiment,
  type Run,
  type TraceInfo,
} from "@/lib/tracking";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "runs", label: "Runs" },
  { id: "models", label: "Models" },
  { id: "traces", label: "Traces" },
  { id: "evaluations", label: "Evaluations" },
  { id: "artifacts", label: "Artifacts" },
  { id: "settings", label: "Settings" },
];

function ExperimentDetailsInner() {
  const params = useParams<{ experimentId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const ctx = useTrackingContext();
  const experimentId = params.experimentId;
  const tab = searchParams.get("tab") ?? "overview";
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [traces, setTraces] = useState<TraceInfo[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!ctx || !experimentId) return;
    const tracking = ctx;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [exp, runResult, traceResult, modelResult] = await Promise.all([
        getExperiment(tracking, experimentId),
        searchRuns(tracking, [experimentId], { maxResults: 200 }),
        searchTraces(tracking, [experimentId], { maxResults: 50 }),
        searchLoggedModels(tracking, [experimentId]),
      ]);
      if (cancelled) return;
      if (!exp.ok || !exp.data.experiment) {
        setError(exp.ok ? "Experiment not found." : exp.message);
        setLoading(false);
        return;
      }
      setExperiment(exp.data.experiment);
      setRuns(runResult.ok ? (runResult.data.runs ?? []) : []);
      setTraces(traceResult.ok ? (traceResult.data.traces ?? []) : []);
      setModels(
        (modelResult.ok ? (modelResult.data.models ?? []) : [])
          .map((row) => row.info?.name)
          .filter((name): name is string => Boolean(name)),
      );
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [ctx, experimentId, reload]);

  const finished = runs.filter((run) => (run.info?.status ?? "").toUpperCase() === "FINISHED");
  const successRate = runs.length ? (finished.length / runs.length) * 100 : 0;
  const best = useMemo(() => {
    let metric = "—";
    let value = Number.NEGATIVE_INFINITY;
    for (const run of runs) {
      const metrics = metricMap(run.data?.metrics);
      for (const [key, amount] of Object.entries(metrics)) {
        if (amount > value) {
          value = amount;
          metric = `${key} ${amount}`;
        }
      }
    }
    return metric;
  }, [runs]);

  function setTab(next: string) {
    router.replace(`/experiments/${experimentId}?tab=${next}`, { scroll: false });
  }

  if (error) {
    return (
      <div className="page">
        <ErrorState title="Unable to load experiment" body={error} onRetry={() => setReload((value) => value + 1)} />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        kicker="Experiment"
        title={experiment?.name ?? "Experiment"}
        lede={experimentId}
      >
        <Link className="btn secondary" href={`/runs?experiment=${experimentId}`}>
          Open runs
        </Link>
        <Link className="btn secondary" href="/tracking">
          Workbench
        </Link>
      </PageHeader>
      <Tabs items={TABS} value={tab} onChange={setTab} />

      {tab === "overview" ? (
        <>
          <div className="grid">
            <div className="span-3">
              <MetricCard label="Run count" value={formatCount(runs.length)} />
            </div>
            <div className="span-3">
              <MetricCard label="Success rate" value={formatPercent(successRate, 0)} />
            </div>
            <div className="span-3">
              <MetricCard label="Best metric" value={<span style={{ fontSize: 16 }}>{best}</span>} />
            </div>
            <div className="span-3">
              <MetricCard label="Models produced" value={formatCount(models.length)} />
            </div>
            <div className="span-3">
              <MetricCard label="Trace volume" value={formatCount(traces.length)} />
            </div>
            <div className="span-3">
              <MetricCard
                label="Last activity"
                value={<span style={{ fontSize: 16 }}>{formatEpoch(experiment?.last_update_time)}</span>}
              />
            </div>
            <div className="span-8">
              <ChartCard title="Run performance over time">
                <LineChart
                  series={[{ label: "Runs", values: bucketByDay(runs.map((run) => Number(run.info?.start_time) || 0)) }]}
                />
              </ChartCard>
            </div>
            <div className="span-4">
              <ChartCard title="Status">
                <BarChart
                  items={[
                    {
                      label: "Completed",
                      value: runs.filter((run) => runStatusLabel(run.info?.status) === "Completed").length,
                      color: "var(--color-success)",
                    },
                    {
                      label: "Failed",
                      value: runs.filter((run) => runStatusLabel(run.info?.status) === "Failed").length,
                      color: "var(--color-danger)",
                    },
                    {
                      label: "Running",
                      value: runs.filter((run) => runStatusLabel(run.info?.status) === "Running").length,
                      color: "var(--color-warning)",
                    },
                  ]}
                />
              </ChartCard>
            </div>
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <h2>Recent runs</h2>
            {loading ? (
              <TableSkeleton />
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>Run</th>
                    <th>Status</th>
                    <th>Started</th>
                    <th>User</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.slice(0, 10).map((run) => (
                    <tr key={runId(run)} data-clickable="true" onClick={() => router.push(`/runs/${runId(run)}`)}>
                      <td>{runName(run)}</td>
                      <td>
                        <StatusBadge label={runStatusLabel(run.info?.status)} tone={runStatusTone(run.info?.status)} />
                      </td>
                      <td>{formatEpoch(run.info?.start_time)}</td>
                      <td>{run.info?.user_id ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : null}

      {tab === "runs" ? (
        <div className="card">
          <table className="data">
            <thead>
              <tr>
                <th>Run</th>
                <th>Status</th>
                <th>Started</th>
                <th>Metrics</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={runId(run)} data-clickable="true" onClick={() => router.push(`/runs/${runId(run)}`)}>
                  <td>{runName(run)}</td>
                  <td>
                    <StatusBadge label={runStatusLabel(run.info?.status)} tone={runStatusTone(run.info?.status)} />
                  </td>
                  <td>{formatEpoch(run.info?.start_time)}</td>
                  <td>
                    {Object.entries(metricMap(run.data?.metrics))
                      .slice(0, 3)
                      .map(([key, value]) => `${key}=${value}`)
                      .join(" · ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "models" ? (
        <div className="card">
          {models.length === 0 ? (
            <p className="lede">No logged models on this experiment yet.</p>
          ) : (
            <ul className="plain-list">
              {models.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          )}
          <Link href="/models">Open model registry</Link>
        </div>
      ) : null}

      {tab === "traces" ? (
        <div className="card">
          {traces.length === 0 ? (
            <p className="lede">No traces attached to this experiment.</p>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Trace</th>
                  <th>Status</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {traces.map((trace) => {
                  const id = trace.trace_id || trace.request_id || "";
                  return (
                    <tr key={id} data-clickable="true" onClick={() => router.push(`/traces/${id}`)}>
                      <td className="mono">{id}</td>
                      <td>{trace.state || trace.status}</td>
                      <td>{trace.execution_duration ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      ) : null}

      {tab === "evaluations" ? (
        <div className="card">
          <p className="lede">
            Evaluation datasets stay in MLflow. Open the workbench or the Evaluations page to compare scorers.
          </p>
          <Link className="btn secondary" href="/evaluations">
            Evaluations
          </Link>
        </div>
      ) : null}

      {tab === "artifacts" ? (
        <div className="card">
          <p className="lede">Artifact browsers remain in the workbench so upstream download flows stay intact.</p>
          <Link className="btn secondary" href="/tracking">
            Open workbench
          </Link>
        </div>
      ) : null}

      {tab === "settings" ? (
        <div className="card">
          <dl className="kv">
            <dt>Experiment ID</dt>
            <dd className="mono">{experimentId}</dd>
            <dt>Artifact location</dt>
            <dd className="mono">{experiment?.artifact_location ?? "—"}</dd>
            <dt>Created</dt>
            <dd>{formatEpoch(experiment?.creation_time)}</dd>
            <dt>Tags</dt>
            <dd>
              {Object.entries(tagMap(experiment?.tags))
                .map(([key, value]) => `${key}=${value}`)
                .join(", ") || "—"}
            </dd>
          </dl>
        </div>
      ) : null}
    </div>
  );
}

export default function ExperimentDetailsPage() {
  return (
    <Suspense fallback={<div className="page">Loading experiment…</div>}>
      <ExperimentDetailsInner />
    </Suspense>
  );
}
