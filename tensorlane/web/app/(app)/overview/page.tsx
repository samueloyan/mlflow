"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ActivityFeed } from "@/components/ui/ActivityFeed";
import { BarChart, ChartCard, LineChart } from "@/components/ui/Charts";
import { CreateExperimentModal } from "@/components/tracking/CreateExperimentModal";
import { QuickStart } from "@/components/QuickStart";
import { MetricCard } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { CardSkeleton, ChartSkeleton, TableSkeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { CopyButton } from "@/components/CopyButton";
import { api, type Approval, type Usage } from "@/lib/api";
import { formatCount, periodDelta } from "@/lib/format";
import { canWrite } from "@/lib/permissions";
import { useShell } from "@/lib/shell";
import { useTrackingContext } from "@/lib/useTrackingContext";
import {
  bucketByDay,
  runId,
  runName,
  runStatusLabel,
  runStatusTone,
  searchExperiments,
  searchRegisteredModels,
  searchRuns,
  searchTraces,
  type Experiment,
  type Run,
  type TraceInfo,
} from "@/lib/tracking";

export default function OverviewPage() {
  const router = useRouter();
  const { organization, workspace, workspaces, role } = useShell();
  const ctx = useTrackingContext();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [traces, setTraces] = useState<TraceInfo[]>([]);
  const [models, setModels] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [reload, setReload] = useState(0);
  const tracking = process.env.NEXT_PUBLIC_TRACKING_URI || "https://api.tensorlane.ai";

  useEffect(() => {
    if (!organization) return;
    void api<Usage>(`/api/v1/usage?organization_id=${organization.id}`).then(setUsage).catch(() => setUsage(null));
    if (organization.features?.approvals) {
      void api<Approval[]>(`/api/v1/organizations/${organization.id}/approvals`)
        .then((rows) => setApprovals(rows.filter((row) => row.status === "pending")))
        .catch(() => setApprovals([]));
    } else {
      setApprovals([]);
    }
  }, [organization]);

  useEffect(() => {
    if (!ctx) return;
    const tracking = ctx;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const experimentsResult = await searchExperiments(tracking);
      if (!experimentsResult.ok) {
        if (!cancelled) {
          setError(experimentsResult.message);
          setLoading(false);
        }
        return;
      }
      const experimentRows = experimentsResult.data.experiments ?? [];
      const ids = experimentRows.map((row) => row.experiment_id).filter((id): id is string => Boolean(id));
      const [runResult, traceResult, modelResult] = await Promise.all([
        searchRuns(tracking, ids, { maxResults: 200 }),
        searchTraces(tracking, ids, { maxResults: 100 }),
        searchRegisteredModels(tracking),
      ]);
      if (cancelled) return;
      if (!runResult.ok) {
        setError(runResult.message);
        setLoading(false);
        return;
      }
      setExperiments(experimentRows);
      setRuns(runResult.data.runs ?? []);
      setTraces(traceResult.ok ? (traceResult.data.traces ?? []) : []);
      setModels(modelResult.ok ? (modelResult.data.registered_models ?? []).length : 0);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [ctx, reload]);

  const statusCounts = useMemo(() => {
    const counts = { Completed: 0, Failed: 0, Running: 0, Killed: 0 };
    for (const run of runs) {
      const label = runStatusLabel(run.info?.status);
      if (label in counts) counts[label as keyof typeof counts] += 1;
    }
    return counts;
  }, [runs]);

  const runSeries = useMemo(
    () => bucketByDay(runs.map((run) => Number(run.info?.start_time) || 0)),
    [runs],
  );

  const recentRuns = runs.slice(0, 8);
  const tracesMetric = usage?.metrics.monthly_traces;
  const write = canWrite(role);

  if (!organization) {
    return (
      <div className="page">
        <PageHeader title="Overview" lede="Create an organization to begin." />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        kicker="Overview"
        title="Overview"
        lede="What is running, what changed, and what needs attention in this workspace."
      >
        {write ? (
          <button type="button" className="btn" onClick={() => setCreating(true)}>
            Create Experiment
          </button>
        ) : null}
        <Link className="btn secondary" href="/runs">
          Browse runs
        </Link>
      </PageHeader>

      {error ? (
        <ErrorState title="Unable to load workspace telemetry" body={error} onRetry={() => setReload((value) => value + 1)} />
      ) : null}

      <div className="grid">
        <QuickStart hasRun={runs.length > 0} />
        {loading ? (
          <>
            <div className="span-3">
              <CardSkeleton />
            </div>
            <div className="span-3">
              <CardSkeleton />
            </div>
            <div className="span-3">
              <CardSkeleton />
            </div>
            <div className="span-3">
              <CardSkeleton />
            </div>
          </>
        ) : (
          <>
            <div className="span-3">
              <MetricCard
                label="Total Runs"
                icon="runs"
                value={formatCount(runs.length)}
                delta={periodDelta(runSeries)}
                hint="Last 200 in this workspace"
                series={runSeries.map((row) => row.value)}
              />
            </div>
            <div className="span-3">
              <MetricCard
                label="Active Experiments"
                icon="experiments"
                value={formatCount(experiments.filter((row) => (row.lifecycle_stage ?? "active") === "active").length)}
                hint={`${workspaces.length} workspaces`}
              />
            </div>
            <div className="span-3">
              <MetricCard label="Models Registered" icon="models" value={formatCount(models)} hint="Model registry" />
            </div>
            <div className="span-3">
              <MetricCard
                label="Traces Ingested"
                icon="traces"
                value={formatCount(tracesMetric?.current ?? traces.length)}
                delta={periodDelta(
                  bucketByDay(
                    traces.map((trace) => {
                      if (trace.timestamp_ms) return Number(trace.timestamp_ms);
                      return trace.request_time ? Date.parse(trace.request_time) : 0;
                    }),
                  ),
                )}
                hint={tracesMetric ? `Plan ${formatCount(tracesMetric.limit)}` : "This workspace"}
                series={bucketByDay(
                  traces.map((trace) => {
                    if (trace.timestamp_ms) return Number(trace.timestamp_ms);
                    return trace.request_time ? Date.parse(trace.request_time) : 0;
                  }),
                ).map((row) => row.value)}
              />
            </div>
          </>
        )}

        <div className="span-8">
          {loading ? (
            <ChartSkeleton />
          ) : (
            <ChartCard title="Runs over time">
              <LineChart series={[{ label: "Runs", values: runSeries }]} />
            </ChartCard>
          )}
        </div>
        <div className="span-4">
          {loading ? (
            <ChartSkeleton />
          ) : (
            <ChartCard title="Runs by status">
              <BarChart
                items={[
                  { label: "Completed", value: statusCounts.Completed, color: "var(--color-success)" },
                  { label: "Failed", value: statusCounts.Failed, color: "var(--color-danger)" },
                  { label: "Running", value: statusCounts.Running, color: "var(--color-warning)" },
                  { label: "Killed", value: statusCounts.Killed, color: "var(--color-sidebar-muted)" },
                ]}
              />
            </ChartCard>
          )}
        </div>

        <div className="span-8">
          <div className="card">
            <div className="page-header" style={{ marginBottom: 12 }}>
              <h2>Recent runs</h2>
              <Link href="/runs">View all</Link>
            </div>
            {loading ? (
              <TableSkeleton rows={5} cols={5} />
            ) : recentRuns.length === 0 ? (
              <p className="lede">No runs in this workspace yet. Log one with the MLflow SDK.</p>
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>Run</th>
                    <th>Status</th>
                    <th>User</th>
                    <th>Experiment</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRuns.map((run) => (
                    <tr
                      key={runId(run)}
                      data-clickable="true"
                      onClick={() => router.push(`/runs/${runId(run)}`)}
                    >
                      <td>{runName(run)}</td>
                      <td>
                        <StatusBadge label={runStatusLabel(run.info?.status)} tone={runStatusTone(run.info?.status)} />
                      </td>
                      <td>{run.info?.user_id ?? "—"}</td>
                      <td>{run.info?.experiment_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="span-4">
          <div className="card">
            <h2>Recent activity</h2>
            <ActivityFeed
              items={
                approvals.length
                  ? approvals.slice(0, 5).map((row) => ({
                      id: row.id,
                      title: row.kind,
                      detail: row.resource_ref,
                      at: row.created_at,
                    }))
                  : recentRuns.slice(0, 5).map((run) => ({
                      id: runId(run),
                      title: runName(run),
                      detail: runStatusLabel(run.info?.status),
                    }))
              }
            />
          </div>
        </div>

        <div className="span-8">
          <div className="card">
            <h2>Usage</h2>
            <p className="lede">Current billing period · {organization.plan}</p>
            {usage ? (
              <div className="grid" style={{ marginTop: 12 }}>
                {["monthly_traces", "members", "models"].map((key) => {
                  const row = usage.metrics[key];
                  if (!row) return null;
                  const ratio = row.limit > 0 ? Math.min(100, (row.current / row.limit) * 100) : 0;
                  return (
                    <div className="span-4" key={key}>
                      <p className="kicker">{key.replaceAll("_", " ")}</p>
                      <div>
                        {row.current.toLocaleString()} / {row.limit.toLocaleString()}
                      </div>
                      <div className={`meter ${row.over_limit ? "danger" : row.warning ? "warn" : ""}`}>
                        <i style={{ width: `${ratio}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="lede">Usage meters appear once the control plane answers.</p>
            )}
          </div>
        </div>

        <div className="span-4">
          <div className="card">
            <h2>Quick actions</h2>
            <div className="stack" style={{ marginTop: 12 }}>
              <button type="button" className="btn" disabled={!write} onClick={() => setCreating(true)}>
                Create Experiment
              </button>
              <Link className="btn secondary" href="/models">
                Log Model
              </Link>
              <Link className="btn secondary" href="/evaluations">
                New Evaluation
              </Link>
              <Link className="btn secondary" href="/traces">
                Ingest Traces
              </Link>
            </div>
            <p className="kicker" style={{ marginTop: 20 }}>
              Tracking URI
            </p>
            <p className="mono" style={{ fontSize: 12 }}>
              {tracking}
            </p>
            <CopyButton value={tracking} label="Copy tracking URI" />
          </div>
        </div>
      </div>

      {creating && ctx ? (
        <CreateExperimentModal
          ctx={ctx}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            if (id) router.push(`/experiments/${id}`);
            else router.push("/experiments");
          }}
        />
      ) : null}
    </div>
  );
}
