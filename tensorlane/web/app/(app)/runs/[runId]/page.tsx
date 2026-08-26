"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/PageHeader";
import { ChartCard, LineChart } from "@/components/ui/Charts";
import { ErrorState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Tabs } from "@/components/ui/Tabs";
import { formatDurationBetween, formatEpoch } from "@/lib/format";
import { useTrackingContext } from "@/lib/useTrackingContext";
import {
  getMetricHistory,
  getRun,
  listArtifacts,
  metricMap,
  paramMap,
  runName,
  runStatusLabel,
  runStatusTone,
  searchTraces,
  tagMap,
  type Metric,
  type Run,
  type TraceInfo,
} from "@/lib/tracking";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "parameters", label: "Parameters" },
  { id: "metrics", label: "Metrics" },
  { id: "artifacts", label: "Artifacts" },
  { id: "models", label: "Models" },
  { id: "traces", label: "Traces" },
  { id: "evaluations", label: "Evaluations" },
  { id: "system", label: "System" },
  { id: "logs", label: "Logs" },
];

function RunDetailsInner() {
  const params = useParams<{ runId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const ctx = useTrackingContext();
  const runId = params.runId;
  const tab = searchParams.get("tab") ?? "overview";
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, Metric[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [files, setFiles] = useState<{ path?: string; is_dir?: boolean; file_size?: number }[]>([]);
  const [traces, setTraces] = useState<TraceInfo[]>([]);

  useEffect(() => {
    if (!ctx || !runId) return;
    const tracking = ctx;
    let cancelled = false;
    async function load() {
      const result = await getRun(tracking, runId);
      if (cancelled) return;
      if (!result.ok || !result.data.run) {
        setError(result.ok ? "Run not found." : result.message);
        return;
      }
      setRun(result.data.run);
      const experimentId = result.data.run.info?.experiment_id;
      if (experimentId) {
        const tracesResult = await searchTraces(tracking, [experimentId], { maxResults: 50 });
        if (tracesResult.ok) {
          setTraces(
            (tracesResult.data.traces ?? []).filter((trace) => {
              const tags = tagMap(trace.tags);
              return tags["mlflow.runId"] === runId || tags["run_id"] === runId;
            }),
          );
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [ctx, runId]);

  const metrics = metricMap(run?.data?.metrics);
  const paramsMap = paramMap(run?.data?.params);
  const tags = tagMap(run?.data?.tags);

  async function expandMetric(key: string) {
    if (!ctx || !runId) return;
    setExpanded(key);
    if (history[key] || !ctx) return;
    const result = await getMetricHistory(ctx, runId, key);
    if (result.ok) {
      setHistory((current) => ({ ...current, [key]: result.data.metrics ?? [] }));
    }
  }

  useEffect(() => {
    if (!ctx || !runId || tab !== "artifacts") return;
    void listArtifacts(ctx, runId).then((result) => {
      if (result.ok) setFiles(result.data.files ?? []);
    });
  }, [ctx, runId, tab]);

  const series = useMemo(() => {
    if (!expanded || !history[expanded]) return [];
    return [
      {
        label: expanded,
        values: (history[expanded] ?? []).map((point, index) => ({
          label: String(point.step ?? index),
          value: Number(point.value) || 0,
        })),
      },
    ];
  }, [expanded, history]);

  if (error) {
    return (
      <div className="page">
        <ErrorState title="Unable to load run" body={error} />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader kicker="Run" title={runName(run ?? undefined)} lede={runId}>
        <StatusBadge label={runStatusLabel(run?.info?.status)} tone={runStatusTone(run?.info?.status)} />
        {run?.info?.experiment_id ? (
          <Link className="btn secondary" href={`/experiments/${run.info.experiment_id}`}>
            Experiment
          </Link>
        ) : null}
      </PageHeader>
      <Tabs items={TABS} value={tab} onChange={(next) => router.replace(`/runs/${runId}?tab=${next}`, { scroll: false })} />

      {tab === "overview" ? (
        <div className="grid">
          <div className="card span-8">
            <dl className="kv">
              <dt>Experiment</dt>
              <dd>{run?.info?.experiment_id}</dd>
              <dt>Status</dt>
              <dd>{runStatusLabel(run?.info?.status)}</dd>
              <dt>User</dt>
              <dd>{run?.info?.user_id ?? "—"}</dd>
              <dt>Started</dt>
              <dd>{formatEpoch(run?.info?.start_time)}</dd>
              <dt>Duration</dt>
              <dd>{formatDurationBetween(run?.info?.start_time, run?.info?.end_time)}</dd>
              <dt>Source</dt>
              <dd>{tags["mlflow.source.name"] ?? "—"}</dd>
              <dt>Run type</dt>
              <dd>{tags["mlflow.runType"] ?? tags["mlflow.runName"] ?? "training"}</dd>
            </dl>
          </div>
          <div className="card span-4">
            <h2>Tags</h2>
            <dl className="kv">
              {["team", "dataset", "owner", "priority", "environment"].map((key) => (
                <div key={key} style={{ display: "contents" }}>
                  <dt>{key}</dt>
                  <dd>{tags[key] ?? "—"}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="card span-12">
            <h2>Metrics</h2>
            <div className="grid">
              {Object.entries(metrics).length === 0 ? (
                <p className="lede">No metrics logged on this run.</p>
              ) : (
                Object.entries(metrics)
                  .slice(0, 8)
                  .map(([key, value]) => (
                    <div className="span-3" key={key}>
                      <button type="button" className="card" style={{ width: "100%" }} onClick={() => void expandMetric(key)}>
                        <p className="kicker">{key}</p>
                        <div className="metric" style={{ fontSize: 22 }}>
                          {value}
                        </div>
                      </button>
                    </div>
                  ))
              )}
            </div>
            {expanded && series[0] && series[0].values.length > 1 ? (
              <ChartCard title={expanded}>
                <LineChart series={series} />
              </ChartCard>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === "parameters" ? (
        <div className="card">
          <table className="data">
            <thead>
              <tr>
                <th>Parameter</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(paramsMap).map(([key, value]) => (
                <tr key={key}>
                  <td>{key}</td>
                  <td className="mono">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "metrics" ? (
        <div className="card">
          <table className="data">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Latest</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(metrics).map(([key, value]) => (
                <tr key={key}>
                  <td>{key}</td>
                  <td>{value}</td>
                  <td>
                    <button type="button" className="btn secondary" onClick={() => void expandMetric(key)}>
                      Expand
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {expanded && series[0] ? (
            <ChartCard title={expanded}>
              {series[0].values.length > 1 ? <LineChart series={series} /> : <p className="lede">Only a single point was logged.</p>}
            </ChartCard>
          ) : null}
        </div>
      ) : null}

      {tab === "artifacts" ? (
        <div className="card">
          {files.length === 0 ? (
            <p className="lede">No artifacts listed. Download still uses the MLflow workbench.</p>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Path</th>
                  <th>Type</th>
                  <th>Size</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file) => (
                  <tr key={file.path}>
                    <td className="mono">{file.path}</td>
                    <td>{file.is_dir ? "directory" : "file"}</td>
                    <td>{file.file_size ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Link className="btn secondary" href="/tracking">
            Open in workbench
          </Link>
        </div>
      ) : null}

      {tab === "models" ? (
        <div className="card">
          <p className="lede">{tags["mlflow.log-model.history"] ? "This run logged a model." : "No model artifact recorded on this run."}</p>
          <Link href="/models">Registry</Link>
        </div>
      ) : null}

      {tab === "traces" ? (
        <div className="card">
          {traces.length === 0 ? (
            <p className="lede">No traces tagged with this run id.</p>
          ) : (
            <ul className="plain-list">
              {traces.map((trace) => {
                const id = trace.trace_id || trace.request_id || "";
                return (
                  <li key={id}>
                    <Link href={`/traces/${id}`}>{id}</Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      {tab === "evaluations" ? (
        <div className="card">
          <p className="lede">Evaluation results for this run open in Evaluations / workbench.</p>
          <Link href="/evaluations">Evaluations</Link>
        </div>
      ) : null}

      {tab === "system" ? (
        <div className="card">
          <dl className="kv">
            <dt>Artifact URI</dt>
            <dd className="mono">{run?.info?.artifact_uri ?? "—"}</dd>
            <dt>Lifecycle</dt>
            <dd>{run?.info?.lifecycle_stage ?? "—"}</dd>
            <dt>Source type</dt>
            <dd>{tags["mlflow.source.type"] ?? "—"}</dd>
          </dl>
        </div>
      ) : null}

      {tab === "logs" ? (
        <div className="card">
          <p className="lede">
            Tensorlane does not copy run stdout into the control plane. Use the workbench log viewer or your job runner.
          </p>
          <Link className="btn secondary" href="/tracking">
            Workbench
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export default function RunDetailsPage() {
  return (
    <Suspense fallback={<div className="page">Loading run…</div>}>
      <RunDetailsInner />
    </Suspense>
  );
}
