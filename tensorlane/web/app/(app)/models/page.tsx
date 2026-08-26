"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatEpoch } from "@/lib/format";
import { useTrackingContext } from "@/lib/useTrackingContext";
import { searchRegisteredModels, type RegisteredModel } from "@/lib/tracking";
import { useSyncedSearchParams } from "@/lib/useSyncedSearchParams";

function ModelsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ctx = useTrackingContext();
  const [rows, setRows] = useState<RegisteredModel[]>([]);
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useSyncedSearchParams({ q: query });

  async function load() {
    if (!ctx) return;
    setLoading(true);
    const result = await searchRegisteredModels(ctx);
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

  const filtered = rows.filter((row) => (row.name ?? "").toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="page">
      <PageHeader
        kicker="Build"
        title="Models"
        lede="Manage registered models and versions."
      />
      <div className="card">
        <DataTable
          columns={[
            { id: "name", header: "Model", sortValue: (row) => row.name ?? "", cell: (row) => row.name ?? "—" },
            {
              id: "version",
              header: "Latest Version",
              cell: (row) => row.latest_versions?.[0]?.version ?? "—",
            },
            {
              id: "alias",
              header: "Alias",
              cell: (row) => row.aliases?.[0]?.alias ?? "—",
            },
            {
              id: "stage",
              header: "Stage",
              cell: (row) => {
                const stage = row.latest_versions?.[0]?.current_stage ?? "None";
                const tone =
                  stage === "Production" ? "success" : stage === "Staging" ? "info" : stage === "Archived" ? "neutral" : "warning";
                return <StatusBadge label={stage} tone={tone} />;
              },
            },
            {
              id: "created",
              header: "Created",
              cell: (row) => formatEpoch(row.creation_timestamp),
            },
            {
              id: "updated",
              header: "Updated",
              cell: (row) => formatEpoch(row.last_updated_timestamp),
            },
            { id: "owner", header: "Owner", cell: (row) => row.user_id ?? "—" },
          ]}
          rows={filtered}
          rowKey={(row) => row.name ?? "model"}
          loading={loading}
          error={error}
          onRetry={() => void load()}
          searchable
          search={query}
          onSearch={setQuery}
          searchPlaceholder="Search models"
          emptyTitle="No registered models"
          emptyBody="Register a model from a run with the MLflow SDK. Aliases and stages stay in the registry."
          onRowClick={(row) => row.name && router.push(`/tracking`)}
        />
      </div>
    </div>
  );
}

export default function ModelsPage() {
  return (
    <Suspense fallback={<div className="page">Loading models…</div>}>
      <ModelsInner />
    </Suspense>
  );
}
