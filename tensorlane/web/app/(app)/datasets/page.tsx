"use client";

import { useEffect, useState } from "react";

import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/ui/DataTable";
import { mlflowCall } from "@/lib/mlflow";
import { useTrackingContext } from "@/lib/useTrackingContext";
import { searchExperiments } from "@/lib/tracking";

type Dataset = { name?: string; digest?: string; experiment_id?: string };

export default function DatasetsPage() {
  const ctx = useTrackingContext();
  const [rows, setRows] = useState<Dataset[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!ctx) return;
    setLoading(true);
    setError(null);
    const experiments = await searchExperiments(ctx);
    if (!experiments.ok) {
      setError(experiments.message);
      setLoading(false);
      return;
    }
    const ids = (experiments.data.experiments ?? [])
      .map((row) => row.experiment_id)
      .filter((id): id is string => Boolean(id));
    const result = await mlflowCall<{ dataset_summaries?: Dataset[]; datasets?: Dataset[] }>(
      "/ajax-api/2.0/mlflow/experiments/search-datasets",
      {
        method: "POST",
        organizationId: ctx.organizationId,
        workspaceId: ctx.workspaceId,
        body: JSON.stringify({ experiment_ids: ids }),
      },
    );
    if (!result.ok) {
      setError(result.message);
      setLoading(false);
      return;
    }
    setRows(result.data.dataset_summaries ?? result.data.datasets ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [ctx]);

  const filtered = rows.filter((row) => (row.name ?? "").toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="page">
      <PageHeader kicker="Build" title="Datasets" lede="Manage datasets used for experiments and evaluations." />
      <div className="card">
        <DataTable
          columns={[
            { id: "name", header: "Dataset", cell: (row) => row.name ?? "—" },
            { id: "digest", header: "Version", cell: (row) => row.digest ?? "—" },
            { id: "experiment", header: "Experiment", cell: (row) => row.experiment_id ?? "—" },
          ]}
          rows={filtered}
          rowKey={(row) => `${row.name}-${row.digest}`}
          loading={loading}
          error={error}
          onRetry={() => void load()}
          searchable
          search={query}
          onSearch={setQuery}
          emptyTitle="No datasets yet"
          emptyBody="Log datasets from runs or evaluations. Tensorlane lists what the workspace already stores."
        />
      </div>
    </div>
  );
}
