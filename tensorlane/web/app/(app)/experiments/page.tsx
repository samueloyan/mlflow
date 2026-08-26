"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { EmptyState, PageHeader } from "@/components/PageHeader";
import { SavedViews } from "@/components/SavedViews";
import { mlflowJson } from "@/lib/mlflow";
import { useShell } from "@/lib/shell";

type Experiment = { experiment_id?: string; name?: string; lifecycle_stage?: string };

export default function ExperimentsPage() {
  const { organization, workspace } = useShell();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Experiment[] | null>(null);

  useEffect(() => {
    if (!organization || !workspace) return;
    void mlflowJson<{ experiments?: Experiment[] }>("/ajax-api/2.0/mlflow/experiments/search", {
      method: "POST",
      organizationId: organization.id,
      workspaceId: workspace.id,
      body: JSON.stringify({ max_results: 100 }),
    }).then((payload) => setRows(payload?.experiments ?? []));
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
        kicker="Build"
        title="Experiments"
        lede="Search and compare experiment metadata from the MLflow data plane. Tensorlane never copies runs into the control plane."
      >
        <Link className="btn" href="/tracking">
          Open in workbench
        </Link>
      </PageHeader>
      <div className="grid">
        <div className="card span-8">
          <label className="field">
            <span>Filter</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name contains…"
            />
          </label>
          {rows === null ? (
            <p className="lede">Loading experiments…</p>
          ) : filtered.length === 0 ? (
            <EmptyState
              title="No experiments in this workspace"
              body="Log a run with the MLflow SDK against this host, or open the workbench if the data plane is still starting."
              action={
                <Link className="btn secondary" href="/tracking">
                  Workbench
                </Link>
              }
            />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Id</th>
                  <th>Stage</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.experiment_id ?? row.name}>
                    <td>{row.name}</td>
                    <td>{row.experiment_id}</td>
                    <td>{row.lifecycle_stage ?? "active"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <SavedViews
          surface="experiments"
          query={{ q: query }}
          onApply={(next) => setQuery(String(next.q ?? ""))}
        />
      </div>
    </div>
  );
}
