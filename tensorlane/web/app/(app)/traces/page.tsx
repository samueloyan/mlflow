"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { EmptyState, PageHeader } from "@/components/PageHeader";
import { SavedViews } from "@/components/SavedViews";
import { mlflowJson } from "@/lib/mlflow";
import { useShell } from "@/lib/shell";

type Trace = { request_id?: string; trace_id?: string; name?: string; status?: string; timestamp_ms?: number };

export default function TracesPage() {
  const { organization, workspace } = useShell();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [rows, setRows] = useState<Trace[] | null>(null);

  useEffect(() => {
    if (!organization || !workspace) return;
    void mlflowJson<{ traces?: Trace[] }>("/ajax-api/3.0/mlflow/traces/search", {
      method: "POST",
      organizationId: organization.id,
      workspaceId: workspace.id,
      body: JSON.stringify({ max_results: 100 }),
    }).then((payload) => setRows(payload?.traces ?? []));
  }, [organization, workspace]);

  const filtered = useMemo(() => {
    const list = rows ?? [];
    return list.filter((row) => {
      const hay = `${row.name ?? ""} ${row.trace_id ?? ""} ${row.request_id ?? ""}`.toLowerCase();
      if (query && !hay.includes(query.toLowerCase())) return false;
      if (status !== "all" && (row.status ?? "").toLowerCase() !== status) return false;
      return true;
    });
  }, [query, rows, status]);

  return (
    <div className="page">
      <PageHeader
        kicker="AI"
        title="Traces"
        lede="Inspect LLM and agent traces without leaving Tensorlane chrome. Filters stay on this side; spans live in MLflow."
      >
        <Link className="btn" href="/tracking">
          Trace explorer
        </Link>
      </PageHeader>
      <div className="grid">
        <div className="card span-8">
          <div className="grid" style={{ gridTemplateColumns: "1fr 180px", gap: 12 }}>
            <label className="field">
              <span>Search</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name or trace id"
              />
            </label>
            <label className="field">
              <span>Status</span>
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="all">All</option>
                <option value="ok">OK</option>
                <option value="error">Error</option>
              </select>
            </label>
          </div>
          {rows === null ? (
            <p className="lede">Loading traces…</p>
          ) : filtered.length === 0 ? (
            <EmptyState
              title="No traces yet"
              body="Instrument with mlflow.trace or an OpenTelemetry exporter pointed at this host. Search and saved views will apply as soon as spans arrive."
            />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Trace</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.trace_id ?? row.request_id}>
                    <td>{row.name ?? "trace"}</td>
                    <td>{row.trace_id ?? row.request_id}</td>
                    <td>{row.status ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <SavedViews
          surface="traces"
          query={{ q: query, status }}
          onApply={(next) => {
            setQuery(String(next.q ?? ""));
            setStatus(String(next.status ?? "all"));
          }}
        />
      </div>
    </div>
  );
}
