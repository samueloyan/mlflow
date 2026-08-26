"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ActivityFeed } from "@/components/ui/ActivityFeed";
import { ChartCard, DonutChart, LineChart } from "@/components/ui/Charts";
import { CreateExperimentModal } from "@/components/tracking/CreateExperimentModal";
import { QuickStart } from "@/components/QuickStart";
import { MetricCard } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { UsageMeter } from "@/components/ui/UsageMeter";
import { CardSkeleton, ChartSkeleton, TableSkeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/EmptyState";
import { CopyButton } from "@/components/CopyButton";
import { Icon } from "@/components/ui/Icons";
import { api, type Approval, type Usage } from "@/lib/api";
import { formatCount, formatDurationBetween, formatEpoch, greeting, periodDelta } from "@/lib/format";
import { canWrite } from "@/lib/permissions";
import { useShell } from "@/lib/shell";
import { useTrackingContext } from "@/lib/useTrackingContext";
import {
  bucketByDay,
  metricMap,
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
  const { me, organization, workspace, role } = useShell();
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
  const firstName = (me.name || me.email || "there").split(/\s+/)[0];

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
    const trackingCtx = ctx;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const experimentsResult = await searchExperiments(trackingCtx);
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
        searchRuns(trackingCtx, ids, { maxResults: 200 }),
        searchTraces(trackingCtx, ids, { maxResults: 100 }),
        searchRegisteredModels(trackingCtx),
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

  const experimentName = useMemo(() => {
    return Object.fromEntries(
      experiments.map((row) => [row.experiment_id ?? "", row.name ?? row.experiment_id ?? ""]),
    );
  }, [experiments]);

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

  const recentRuns = runs.slice(0, 5);
  const tracesMetric = usage?.metrics.monthly_traces;
  const write = canWrite(role);
  const traceSeries = useMemo(
    () =>
      bucketByDay(
        traces.map((trace) => {
          if (trace.timestamp_ms) return Number(trace.timestamp_ms);
          return trace.request_time ? Date.parse(trace.request_time) : 0;
        }),
      ),
    [traces],
  );

  if (!organization) {
    return (
      <div className="page">
        <h1>Overview</h1>
        <p className="lede">Create an organization to begin.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>
            {greeting()}, {firstName}
          </h1>
          <p className="lede">
            Here&apos;s what&apos;s happening in {organization.name}
            {workspace ? ` / ${workspace.name}` : ""}.
          </p>
        </div>
      </div>

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
                iconTone="primary"
                value={formatCount(runs.length)}
                delta={periodDelta(runSeries)}
                series={runSeries.map((row) => row.value)}
                seriesColor="var(--color-primary)"
              />
            </div>
            <div className="span-3">
              <MetricCard
                label="Active Experiments"
                icon="experiments"
                iconTone="success"
                value={formatCount(experiments.filter((row) => (row.lifecycle_stage ?? "active") === "active").length)}
                hint="Active in this workspace"
              />
            </div>
            <div className="span-3">
              <MetricCard
                label="Models Registered"
                icon="models"
                iconTone="info"
                value={formatCount(models)}
                hint="Model registry"
              />
            </div>
            <div className="span-3">
              <MetricCard
                label="Traces Ingested"
                icon="traces"
                iconTone="danger"
                value={formatCount(tracesMetric?.current ?? traces.length)}
                delta={periodDelta(traceSeries)}
                series={traceSeries.map((row) => row.value)}
                seriesColor="var(--color-danger)"
              />
            </div>
          </>
        )}

        <div className="span-8">
          {loading ? (
            <ChartSkeleton />
          ) : (
            <ChartCard title="Runs Over Time">
              <LineChart series={[{ label: "Runs", color: "var(--color-primary)", values: runSeries }]} />
            </ChartCard>
          )}
        </div>
        <div className="span-4">
          {loading ? (
            <ChartSkeleton />
          ) : (
            <ChartCard title="Runs by Status">
              <DonutChart
                totalLabel="Total"
                items={[
                  { label: "Completed", value: statusCounts.Completed, color: "var(--color-primary)" },
                  { label: "Failed", value: statusCounts.Failed, color: "var(--color-danger)" },
                  { label: "Running", value: statusCounts.Running, color: "var(--color-secondary)" },
                  { label: "Killed", value: statusCounts.Killed, color: "var(--color-sidebar-muted)" },
                ]}
              />
            </ChartCard>
          )}
        </div>

        <div className="span-8">
          <div className="card">
            <div className="page-header" style={{ marginBottom: 12 }}>
              <h2>Recent Runs</h2>
              <Link href="/runs">View all runs</Link>
            </div>
            {loading ? (
              <TableSkeleton rows={5} cols={6} />
            ) : recentRuns.length === 0 ? (
              <p className="lede">No runs in this workspace yet. Log one with the MLflow SDK.</p>
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>Run Name</th>
                    <th>Experiment</th>
                    <th>Status</th>
                    <th>User</th>
                    <th>Started</th>
                    <th>Duration</th>
                    <th>Metrics</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRuns.map((run) => {
                    const metrics = Object.entries(metricMap(run.data?.metrics))
                      .slice(0, 2)
                      .map(([key, value]) => `${key} ${value}`)
                      .join(" · ");
                    return (
                      <tr
                        key={runId(run)}
                        data-clickable="true"
                        onClick={() => router.push(`/runs/${runId(run)}`)}
                      >
                        <td>
                          <Link className="table-link" href={`/runs/${runId(run)}`}>
                            {runName(run)}
                          </Link>
                        </td>
                        <td>
                          {run.info?.experiment_id ? (
                            <Link className="table-link" href={`/experiments/${run.info.experiment_id}`}>
                              {experimentName[run.info.experiment_id] || run.info.experiment_id}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          <StatusBadge label={runStatusLabel(run.info?.status)} tone={runStatusTone(run.info?.status)} />
                        </td>
                        <td>{run.info?.user_id ?? "—"}</td>
                        <td>{formatEpoch(run.info?.start_time)}</td>
                        <td>{formatDurationBetween(run.info?.start_time, run.info?.end_time)}</td>
                        <td>{metrics || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="span-4 rail">
          <div className="card">
            <h2>Recent Activity</h2>
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
                      at: Number(run.info?.end_time || run.info?.start_time) || null,
                    }))
              }
            />
          </div>
          <div className="card">
            <h2>Usage</h2>
            {usage ? (
              <div className="stack" style={{ marginTop: 12 }}>
                {usage.metrics.monthly_traces ? (
                  <UsageMeter
                    label="Traces"
                    current={usage.metrics.monthly_traces.current}
                    limit={usage.metrics.monthly_traces.limit}
                    tone="primary"
                    warning={usage.metrics.monthly_traces.warning}
                    overLimit={usage.metrics.monthly_traces.over_limit}
                  />
                ) : null}
                {usage.metrics.storage_bytes ? (
                  <UsageMeter
                    label="Storage"
                    current={usage.metrics.storage_bytes.current}
                    limit={usage.metrics.storage_bytes.limit}
                    tone="info"
                    warning={usage.metrics.storage_bytes.warning}
                    overLimit={usage.metrics.storage_bytes.over_limit}
                  />
                ) : null}
                {usage.metrics.models ? (
                  <UsageMeter
                    label="Included Models"
                    current={usage.metrics.models.current}
                    limit={usage.metrics.models.limit}
                    tone="success"
                    warning={usage.metrics.models.warning}
                    overLimit={usage.metrics.models.over_limit}
                  />
                ) : null}
                {usage.metrics.members ? (
                  <UsageMeter
                    label="Members"
                    current={usage.metrics.members.current}
                    limit={usage.metrics.members.limit}
                    tone="warning"
                    warning={usage.metrics.members.warning}
                    overLimit={usage.metrics.members.over_limit}
                  />
                ) : null}
              </div>
            ) : (
              <p className="lede">Usage meters appear once the control plane answers.</p>
            )}
            <Link href="/usage" className="table-link" style={{ display: "inline-block", marginTop: 12 }}>
              Open usage
            </Link>
          </div>
          <div className="card">
            <h2>Quick Actions</h2>
            <div className="quick-actions">
              <button type="button" className="quick-action" disabled={!write} onClick={() => setCreating(true)}>
                <Icon name="experiments" />
                Create Experiment
              </button>
              <Link className="quick-action" href="/models">
                <Icon name="models" />
                Log a Model
              </Link>
              <Link className="quick-action" href="/evaluations">
                <Icon name="evaluations" />
                New Evaluation
              </Link>
              <Link className="quick-action" href="/traces">
                <Icon name="traces" />
                Ingest Traces
              </Link>
            </div>
            <p className="kicker" style={{ marginTop: 16 }}>
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
