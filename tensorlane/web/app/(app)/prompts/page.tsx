"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { EmptyState, PageHeader } from "@/components/PageHeader";
import { SavedViews } from "@/components/SavedViews";
import { mlflowJson } from "@/lib/mlflow";
import { useShell } from "@/lib/shell";

type Model = { name?: string; last_updated_timestamp?: number };

export default function PromptsPage() {
  const { organization, workspace } = useShell();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Model[] | null>(null);

  useEffect(() => {
    if (!organization || !workspace) return;
    void mlflowJson<{ registered_models?: Model[] }>(
      "/ajax-api/2.0/mlflow/registered-models/search",
      {
        method: "GET",
        organizationId: organization.id,
        workspaceId: workspace.id,
      },
    ).then((payload) => setRows(payload?.registered_models ?? []));
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
        title="Prompts"
        lede="Prompt versions are registered models in the MLflow registry. Aliases and lineage stay where the SDK already writes them."
      >
        <Link className="btn" href="/tracking">
          Registry
        </Link>
      </PageHeader>
      <div className="grid">
        <div className="card span-8">
          <label className="field">
            <span>Filter</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Prompt name"
            />
          </label>
          {rows === null ? (
            <p className="lede">Loading prompts…</p>
          ) : filtered.length === 0 ? (
            <EmptyState
              title="No prompt versions registered"
              body="Use mlflow.genai.register_prompt or the registry UI. Tensorlane lists what the workspace already stores."
            />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.name}>
                    <td>{row.name}</td>
                    <td>
                      {row.last_updated_timestamp
                        ? new Date(row.last_updated_timestamp).toLocaleString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <SavedViews
          surface="prompts"
          query={{ q: query }}
          onApply={(next) => setQuery(String(next.q ?? ""))}
        />
      </div>
    </div>
  );
}
