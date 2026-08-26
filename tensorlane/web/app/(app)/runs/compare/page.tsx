"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/PageHeader";
import { ChartCard, LineChart } from "@/components/ui/Charts";
import { ErrorState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatEpoch } from "@/lib/format";
import { useTrackingContext } from "@/lib/useTrackingContext";
import {
  getRun,
  metricMap,
  paramMap,
  runId,
  runName,
  runStatusLabel,
  runStatusTone,
  type Run,
} from "@/lib/tracking";

function CompareInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const ctx = useTrackingContext();
  const ids = (searchParams.get("ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 10);
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(ids.length >= 2);

  useEffect(() => {
    if (!ctx || ids.length < 2) {
      setLoading(false);
      return;
    }
    const tracking = ctx;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const results = await Promise.all(ids.map((id) => getRun(tracking, id)));
      if (cancelled) return;
      const failed = results.find((result) => !result.ok);
      if (failed && !failed.ok) {
        setError(failed.message);
        setLoading(false);
        return;
      }
      setRuns(
        results.map((result) => (result.ok ? result.data.run : null)).filter((row): row is Run => Boolean(row)),
      );
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [ctx, ids.join(",")]);

  const paramKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const run of runs) {
      for (const key of Object.keys(paramMap(run.data?.params))) keys.add(key);
    }
    return [...keys].sort();
  }, [runs]);

  const metricKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const run of runs) {
      for (const key of Object.keys(metricMap(run.data?.metrics))) keys.add(key);
    }
    return [...keys].sort();
  }, [runs]);

  if (ids.length < 2) {
    return (
      <div className="page">
        <PageHeader title="Compare runs" lede="Select 2–10 runs from the Runs page." />
        <Link className="btn" href="/runs">
          Back to runs
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <ErrorState title="Unable to compare runs" body={error} />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page">
        <PageHeader title="Compare runs" lede="Loading selected runs…" />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader title="Compare runs" lede={`${runs.length} runs selected.`}>
        <button type="button" className="btn secondary" onClick={() => router.push("/runs")}>
          Back
        </button>
      </PageHeader>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Field</th>
              {runs.map((run) => (
                <th key={runId(run)}>
                  <Link href={`/runs/${runId(run)}`}>{runName(run)}</Link>
                  <div>
                    <StatusBadge label={runStatusLabel(run.info?.status)} tone={runStatusTone(run.info?.status)} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Started</td>
              {runs.map((run) => (
                <td key={runId(run)}>{formatEpoch(run.info?.start_time)}</td>
              ))}
            </tr>
            <tr>
              <td colSpan={runs.length + 1}>
                <strong>Parameters</strong>
              </td>
            </tr>
            {paramKeys.map((key) => {
              const values = runs.map((run) => paramMap(run.data?.params)[key] ?? "—");
              const differs = new Set(values).size > 1;
              return (
                <tr key={`p-${key}`} data-selected={differs ? "true" : "false"}>
                  <td>{key}</td>
                  {runs.map((run) => (
                    <td key={runId(run)} className="mono">
                      {paramMap(run.data?.params)[key] ?? "—"}
                    </td>
                  ))}
                </tr>
              );
            })}
            <tr>
              <td colSpan={runs.length + 1}>
                <strong>Metrics</strong>
              </td>
            </tr>
            {metricKeys.map((key) => {
              const values = runs.map((run) => metricMap(run.data?.metrics)[key]);
              const differs = new Set(values.map(String)).size > 1;
              return (
                <tr key={`m-${key}`} data-selected={differs ? "true" : "false"}>
                  <td>{key}</td>
                  {runs.map((run) => (
                    <td key={runId(run)}>{metricMap(run.data?.metrics)[key] ?? "—"}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {metricKeys[0] ? (
        <div style={{ marginTop: 16 }}>
          <ChartCard title="Metric overlay (latest values)">
            <LineChart
              series={runs.map((run) => ({
                label: runName(run),
                values: metricKeys.map((key) => ({
                  label: key,
                  value: metricMap(run.data?.metrics)[key] ?? 0,
                })),
              }))}
            />
          </ChartCard>
        </div>
      ) : null}
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="page">Loading comparison…</div>}>
      <CompareInner />
    </Suspense>
  );
}
