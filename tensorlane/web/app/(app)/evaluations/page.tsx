"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { EmptyState, PageHeader } from "@/components/PageHeader";
import { SavedViews } from "@/components/SavedViews";
import { useTrackingContext } from "@/lib/useTrackingContext";
import { searchLoggedModels } from "@/lib/tracking";

type Row = { name: string; experimentId?: string; runId?: string };

export default function EvaluationsPage() {
  const ctx = useTrackingContext();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ctx) return;
    void searchLoggedModels(ctx).then((result) => {
      if (!result.ok) {
        setError(result.message);
        setRows([]);
        return;
      }
      setRows(
        (result.data.models ?? []).map((row) => ({
          name: row.info?.name ?? "model",
          experimentId: row.info?.experiment_id,
          runId: row.info?.source_run_id,
        })),
      );
    });
  }, [ctx]);

  const filtered = useMemo(() => {
    const list = rows ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((row) => row.name.toLowerCase().includes(needle));
  }, [query, rows]);

  return (
    <div className="page">
      <PageHeader
        kicker="AI"
        title="Evaluations"
        lede="Create and run evaluations on your models and AI applications."
      >
        <Link className="btn secondary" href="/tracking">
          Evaluation UI
        </Link>
      </PageHeader>
      <div className="grid">
        <div className="card span-8">
          <label className="field">
            <span>Search</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name" />
          </label>
          {rows === null ? (
            <p className="lede">Loading evaluations…</p>
          ) : error ? (
            <p className="lede">{error}</p>
          ) : filtered.length === 0 ? (
            <EmptyState
              title="No evaluations yet"
              body="Run mlflow.genai.evaluate against this tracking URI. Side-by-side comparisons open in the workbench until native compare lands."
            />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Target</th>
                  <th>Source run</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={`${row.name}-${row.runId}`}>
                    <td>{row.name}</td>
                    <td>{row.experimentId ?? "—"}</td>
                    <td className="mono">{row.runId ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <SavedViews surface="evaluations" query={{ q: query }} onApply={(next) => setQuery(String(next.q ?? ""))} />
      </div>
    </div>
  );
}
