"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Tabs } from "@/components/ui/Tabs";
import { trackingUiHref } from "@/lib/brand";
import { formatEpoch } from "@/lib/format";
import { useTrackingContext } from "@/lib/useTrackingContext";
import {
  MODEL_REGISTRY_FILTER,
  loggedModelStatus,
  searchExperiments,
  searchLoggedModels,
  searchRegisteredModels,
  type LoggedModel,
  type RegisteredModel,
} from "@/lib/tracking";
import { useSyncedSearchParams } from "@/lib/useSyncedSearchParams";

function ModelsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ctx = useTrackingContext();
  const [tab, setTab] = useState(searchParams.get("tab") === "logged" ? "logged" : "registered");
  const [registered, setRegistered] = useState<RegisteredModel[]>([]);
  const [logged, setLogged] = useState<LoggedModel[]>([]);
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useSyncedSearchParams({ q: query, tab });

  async function load() {
    if (!ctx) return;
    setLoading(true);
    setError(null);
    const [models, experiments] = await Promise.all([
      searchRegisteredModels(ctx, { filter: MODEL_REGISTRY_FILTER }),
      searchExperiments(ctx),
    ]);
    if (!models.ok) {
      setError(models.message);
      setLoading(false);
      return;
    }
    setRegistered(models.data.registered_models ?? []);
    if (!experiments.ok) {
      setError(experiments.message);
      setLoading(false);
      return;
    }
    const ids = (experiments.data.experiments ?? [])
      .map((row) => row.experiment_id)
      .filter((id): id is string => Boolean(id));
    const loggedResult = await searchLoggedModels(ctx, ids);
    if (!loggedResult.ok) {
      setError(loggedResult.message);
      setLoading(false);
      return;
    }
    setLogged(loggedResult.data.models ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [ctx]);

  const registeredRows = registered.filter((row) => (row.name ?? "").toLowerCase().includes(query.toLowerCase()));
  const loggedRows = logged.filter((row) => (row.info?.name ?? "").toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="page">
      <PageHeader kicker="Build" title="Models" lede="Registered versions and models logged from runs in this workspace." />
      <Tabs
        items={[
          { id: "registered", label: "Registered" },
          { id: "logged", label: "Logged" },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="card">
        {tab === "registered" ? (
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
                    stage === "Production"
                      ? "success"
                      : stage === "Staging"
                        ? "info"
                        : stage === "Archived"
                          ? "neutral"
                          : "warning";
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
            rows={registeredRows}
            rowKey={(row) => row.name ?? "model"}
            loading={loading}
            error={error}
            onRetry={() => void load()}
            searchable
            search={query}
            onSearch={setQuery}
            searchPlaceholder="Search models"
            emptyTitle="No registered models"
            emptyBody="Register a model from a run with the Python SDK. Aliases and stages stay in this workspace registry."
            onRowClick={(row) => row.name && router.push(trackingUiHref(`/models/${encodeURIComponent(row.name)}`))}
          />
        ) : (
          <DataTable
            columns={[
              { id: "name", header: "Model", cell: (row) => row.info?.name ?? "—" },
              { id: "id", header: "Model ID", cell: (row) => <span className="mono">{row.info?.model_id ?? "—"}</span> },
              { id: "type", header: "Type", cell: (row) => row.info?.model_type ?? "—" },
              {
                id: "status",
                header: "Status",
                cell: (row) => {
                  const status = loggedModelStatus(row.info?.status);
                  const tone = status === "Ready" ? "success" : status === "Failed" ? "danger" : "neutral";
                  return <StatusBadge label={status} tone={tone} />;
                },
              },
              { id: "experiment", header: "Experiment", cell: (row) => row.info?.experiment_id ?? "—" },
              {
                id: "run",
                header: "Source run",
                cell: (row) => <span className="mono">{row.info?.source_run_id ?? "—"}</span>,
              },
              {
                id: "created",
                header: "Created",
                cell: (row) => formatEpoch(row.info?.creation_timestamp_ms),
              },
            ]}
            rows={loggedRows}
            rowKey={(row) => row.info?.model_id ?? row.info?.name ?? "logged"}
            loading={loading}
            error={error}
            onRetry={() => void load()}
            searchable
            search={query}
            onSearch={setQuery}
            searchPlaceholder="Search logged models"
            emptyTitle="No logged models"
            emptyBody="Log a model from a run. Tensorlane lists models attached to experiments in this workspace."
            onRowClick={(row) => {
              const experimentId = row.info?.experiment_id;
              const modelId = row.info?.model_id;
              if (experimentId && modelId) {
                router.push(trackingUiHref(`/experiments/${experimentId}/models/${modelId}`));
              } else if (row.info?.source_run_id) {
                router.push(`/runs/${row.info.source_run_id}`);
              }
            }}
          />
        )}
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
