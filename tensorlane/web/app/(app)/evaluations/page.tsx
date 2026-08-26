"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { EmptyState, PageHeader } from "@/components/PageHeader";
import { SavedViews } from "@/components/SavedViews";
import { mlflowJson } from "@/lib/mlflow";
import { useShell } from "@/lib/shell";

type Dataset = { name?: string; digest?: string; experiment_id?: string };

export default function EvaluationsPage() {
  const { organization, workspace } = useShell();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Dataset[] | null>(null);

  useEffect(() => {
    if (!organization || !workspace) return;
    void mlflowJson<{ evaluation_datasets?: Dataset[]; datasets?: Dataset[] }>(
      "/ajax-api/2.0/mlflow/logged-model/search",
      {
        method: "POST",
        organizationId: organization.id,
        workspaceId: workspace.id,
        body: JSON.stringify({ max_results: 50 }),
      },
    ).then((payload) => setRows(payload?.evaluation_datasets ?? payload?.datasets ?? []));
  }, [organization, workspace]);

  const filtered = useMemo(() => {
    const list = rows ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((row) => (row.name ?? "").toLowerCase().includes(needle));
  }, [query, rows]);

  return (
    <div className="page">
      <PageHeader
        kicker="AI"
        title="Evaluations"
        lede="Compare scorers and datasets that already live in MLflow. Advanced evaluation features follow the Growth and Enterprise plans."
      >
        <Link className="btn" href="/tracking">
          Evaluation UI
        </Link>
      </PageHeader>
      <div className="grid">
        <div className="card span-8">
          <label className="field">
            <span>Filter</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Dataset or run name"
            />
          </label>
          {rows === null ? (
            <p className="lede">Loading evaluations…</p>
          ) : filtered.length === 0 ? (
            <EmptyState
              title="No evaluation datasets yet"
              body="Run mlflow.genai.evaluate against this tracking URI. Side-by-side comparisons open in the workbench until native compare lands."
            />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Digest</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={`${row.name}-${row.digest}`}>
                    <td>{row.name}</td>
                    <td>{row.digest ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <SavedViews
          surface="evaluations"
          query={{ q: query }}
          onApply={(next) => setQuery(String(next.q ?? ""))}
        />
      </div>
    </div>
  );
}
