"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { EmptyState, PageHeader } from "@/components/PageHeader";
import { ErrorState } from "@/components/ui/EmptyState";
import { SavedViews } from "@/components/SavedViews";
import { formatEpoch } from "@/lib/format";
import { useTrackingContext } from "@/lib/useTrackingContext";
import { searchPrompts, type RegisteredModel } from "@/lib/tracking";

export default function PromptsPage() {
  const router = useRouter();
  const ctx = useTrackingContext();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<RegisteredModel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!ctx) return;
    setLoading(true);
    setError(null);
    const result = await searchPrompts(ctx);
    if (!result.ok) {
      setError(result.message);
      setLoading(false);
      return;
    }
    setRows(result.data.registered_models ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [ctx]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => (row.name ?? "").toLowerCase().includes(needle));
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
          {error ? (
            <ErrorState title="Unable to load prompts" body={error} onRetry={() => void load()} />
          ) : loading ? (
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
                  <th>Version</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.name}
                    style={{ cursor: row.name ? "pointer" : undefined }}
                    onClick={() =>
                      row.name &&
                      router.push(`/tracking?hash=/models/${encodeURIComponent(row.name)}`)
                    }
                  >
                    <td>{row.name}</td>
                    <td>{row.latest_versions?.[0]?.version ?? "—"}</td>
                    <td>{formatEpoch(row.last_updated_timestamp)}</td>
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
