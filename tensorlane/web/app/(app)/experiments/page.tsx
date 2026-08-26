"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { SavedViews } from "@/components/SavedViews";
import { CreateExperimentModal } from "@/components/tracking/CreateExperimentModal";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatEpoch } from "@/lib/format";
import { canWrite } from "@/lib/permissions";
import { useShell } from "@/lib/shell";
import { useTrackingContext } from "@/lib/useTrackingContext";
import {
  searchExperiments,
  searchRuns,
  tagMap,
  type Experiment,
  type Run,
} from "@/lib/tracking";

type ExperimentRow = Experiment & {
  runCount: number;
  lastRun: number;
  owner: string;
  tagsLabel: string;
};

function ExperimentsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ctx = useTrackingContext();
  const { role } = useShell();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [rows, setRows] = useState<ExperimentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(searchParams.get("new") === "1");

  async function load() {
    if (!ctx) return;
    setLoading(true);
    setError(null);
    const experimentsResult = await searchExperiments(ctx);
    if (!experimentsResult.ok) {
      setError(experimentsResult.message);
      setLoading(false);
      return;
    }
    const experiments = experimentsResult.data.experiments ?? [];
    const ids = experiments.map((row) => row.experiment_id).filter((id): id is string => Boolean(id));
    const runsResult = await searchRuns(ctx, ids, { maxResults: 200 });
    const runs = runsResult.ok ? (runsResult.data.runs ?? []) : [];
    const byExperiment = new Map<string, Run[]>();
    for (const run of runs) {
      const experimentId = run.info?.experiment_id ?? "";
      const list = byExperiment.get(experimentId) ?? [];
      list.push(run);
      byExperiment.set(experimentId, list);
    }
    setRows(
      experiments.map((experiment) => {
        const related = byExperiment.get(experiment.experiment_id ?? "") ?? [];
        const last = related.reduce((max, run) => Math.max(max, Number(run.info?.start_time) || 0), 0);
        const owner =
          related[0]?.info?.user_id ||
          tagMap(experiment.tags).owner ||
          tagMap(related[0]?.data?.tags)["mlflow.user"] ||
          "—";
        return {
          ...experiment,
          runCount: related.length,
          lastRun: last,
          owner,
          tagsLabel: Object.entries(tagMap(experiment.tags))
            .slice(0, 3)
            .map(([key, value]) => `${key}:${value}`)
            .join(", "),
        };
      }),
    );
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [ctx]);

  useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (current === query) return;
    const params = new URLSearchParams(searchParams.toString());
    if (query) params.set("q", query);
    else params.delete("q");
    const qs = params.toString();
    router.replace(qs ? `/experiments?${qs}` : "/experiments", { scroll: false });
  }, [query, router, searchParams]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => `${row.name ?? ""} ${row.owner} ${row.tagsLabel}`.toLowerCase().includes(needle));
  }, [query, rows]);

  return (
    <div className="page">
      <PageHeader
        kicker="Build"
        title="Experiments"
        lede="Organize and track your machine learning experiments."
      >
        {canWrite(role) ? (
          <button type="button" className="btn" onClick={() => setCreating(true)}>
            + New Experiment
          </button>
        ) : null}
        <Link className="btn secondary" href="/tracking">
          Workbench
        </Link>
      </PageHeader>
      <div className="grid">
        <div className="span-9">
          <div className="card">
            <DataTable
              columns={[
                { id: "name", header: "Name", sortValue: (row) => row.name ?? "", cell: (row) => row.name ?? "—" },
                {
                  id: "description",
                  header: "Description",
                  cell: (row) => tagMap(row.tags)["mlflow.note.content"] || "—",
                },
                {
                  id: "created",
                  header: "Created",
                  sortValue: (row) => Number(row.creation_time) || 0,
                  cell: (row) => formatEpoch(row.creation_time),
                },
                {
                  id: "last",
                  header: "Last Run",
                  sortValue: (row) => row.lastRun,
                  cell: (row) => formatEpoch(row.lastRun || undefined),
                },
                { id: "runs", header: "Runs", sortValue: (row) => row.runCount, cell: (row) => row.runCount },
                { id: "owner", header: "Owner", sortValue: (row) => row.owner, cell: (row) => row.owner },
                {
                  id: "stage",
                  header: "Stage",
                  cell: (row) => (
                    <StatusBadge
                      label={row.lifecycle_stage ?? "active"}
                      tone={(row.lifecycle_stage ?? "active") === "active" ? "success" : "neutral"}
                    />
                  ),
                },
                { id: "tags", header: "Tags", cell: (row) => row.tagsLabel || "—" },
              ]}
              rows={filtered}
              rowKey={(row) => row.experiment_id ?? row.name ?? "exp"}
              loading={loading}
              error={error}
              onRetry={() => void load()}
              searchable
              search={query}
              onSearch={setQuery}
              searchPlaceholder="Search experiments"
              emptyTitle="No experiments yet"
              emptyBody="Experiments help you organize and compare your ML runs."
              emptyAction={
                canWrite(role) ? (
                  <button type="button" className="btn" onClick={() => setCreating(true)}>
                    Create Experiment
                  </button>
                ) : undefined
              }
              onRowClick={(row) => row.experiment_id && router.push(`/experiments/${row.experiment_id}`)}
            />
          </div>
        </div>
        <SavedViews surface="experiments" query={{ q: query }} onApply={(next) => setQuery(String(next.q ?? ""))} />
      </div>
      {creating && ctx ? (
        <CreateExperimentModal
          ctx={ctx}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            if (id) router.push(`/experiments/${id}`);
            else void load();
          }}
        />
      ) : null}
    </div>
  );
}

export default function ExperimentsPage() {
  return (
    <Suspense fallback={<div className="page">Loading experiments…</div>}>
      <ExperimentsInner />
    </Suspense>
  );
}
