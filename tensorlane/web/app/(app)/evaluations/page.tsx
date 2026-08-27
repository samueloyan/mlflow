"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { EmptyState, PageHeader } from "@/components/PageHeader";
import { ErrorState } from "@/components/ui/EmptyState";
import { SavedViews } from "@/components/SavedViews";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { trackingUiHref } from "@/lib/brand";
import { formatEpoch } from "@/lib/format";
import { canWrite } from "@/lib/permissions";
import { useShell } from "@/lib/shell";
import { useTrackingContext } from "@/lib/useTrackingContext";
import { deleteScorer, listScorers, scorerName, searchExperiments, type Scorer } from "@/lib/tracking";

export default function EvaluationsPage() {
  const { role } = useShell();
  const ctx = useTrackingContext();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Scorer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const writable = canWrite(role);

  async function load() {
    if (!ctx) return;
    setLoading(true);
    setError(null);
    const result = await listScorers(ctx);
    if (result.ok) {
      setRows(result.data.scorers ?? []);
      setLoading(false);
      return;
    }
    const experiments = await searchExperiments(ctx);
    if (!experiments.ok) {
      setError(result.message);
      setLoading(false);
      return;
    }
    const collected: Scorer[] = [];
    let listed = false;
    for (const experiment of experiments.data.experiments ?? []) {
      const id = experiment.experiment_id;
      if (!id) continue;
      const perExperiment = await listScorers(ctx, id);
      if (!perExperiment.ok) continue;
      listed = true;
      collected.push(...(perExperiment.data.scorers ?? []));
    }
    if (!listed) setError(result.message);
    setRows(collected);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [ctx]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => scorerName(row).toLowerCase().includes(needle));
  }, [query, rows]);

  async function remove(row: Scorer) {
    if (!ctx) return;
    const experimentId = row.experiment_id == null ? "" : String(row.experiment_id);
    const name = scorerName(row);
    if (!experimentId || !name) return;
    if (!window.confirm(`Delete judge ${name}?`)) return;
    const result = await deleteScorer(ctx, experimentId, name);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    await load();
  }

  return (
    <div className="page">
      <PageHeader
        kicker="AI"
        title="Evaluations"
        lede="Judges and scorers registered against experiments in this workspace. Run evaluations from the SDK; results land on the experiment."
      >
        <Link className="btn secondary" href="/datasets">
          Datasets
        </Link>
      </PageHeader>
      <div className="grid">
        <div className="card span-8">
          <label className="field">
            <span>Search</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Judge name" />
          </label>
          {error ? (
            <ErrorState title="Unable to load judges" body={error} onRetry={() => void load()} />
          ) : loading ? (
            <p className="lede">Loading judges…</p>
          ) : filtered.length === 0 ? (
            <EmptyState
              title="No judges yet"
              body="Register a judge from the Tensorlane SDK against this tracking URI. Tensorlane lists every judge in the workspace."
            />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Judge</th>
                  <th>Experiment</th>
                  <th>Version</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const name = scorerName(row);
                  const experimentId = row.experiment_id == null ? "" : String(row.experiment_id);
                  return (
                    <tr key={`${experimentId}-${name}-${row.scorer_version ?? 0}`}>
                      <td>{name}</td>
                      <td>
                        {experimentId ? (
                          <Link href={`/experiments/${experimentId}?tab=evaluations`}>{experimentId}</Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <StatusBadge label={`v${row.scorer_version ?? 1}`} tone="info" />
                      </td>
                      <td>{formatEpoch(row.creation_time)}</td>
                      <td>
                        {writable && experimentId ? (
                          <button type="button" className="btn ghost" onClick={() => void remove(row)}>
                            Delete
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <SavedViews surface="evaluations" query={{ q: query }} onApply={(next) => setQuery(String(next.q ?? ""))} />
      </div>
      <p className="lede" style={{ marginTop: 16 }}>
        <Link href={trackingUiHref()}>Open evaluation compare in tracking UI</Link>
      </p>
    </div>
  );
}
