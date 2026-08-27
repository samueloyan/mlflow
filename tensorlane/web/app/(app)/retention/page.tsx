"use client";

import { useEffect, useState } from "react";

import { PageHeader } from "@/components/PageHeader";
import { api, type Organization } from "@/lib/api";
import { useShell } from "@/lib/shell";

export default function RetentionPage() {
  const { organization, role, refresh } = useShell();
  const [traces, setTraces] = useState(organization?.retention_traces_days ?? 90);
  const [runs, setRuns] = useState(organization?.retention_runs_days ?? 365);
  const [artifacts, setArtifacts] = useState(organization?.retention_artifacts_days ?? 365);
  const [message, setMessage] = useState<string | null>(null);
  const canManage = role === "owner" || role === "admin";

  useEffect(() => {
    if (!organization) return;
    setTraces(organization.retention_traces_days);
    setRuns(organization.retention_runs_days);
    setArtifacts(organization.retention_artifacts_days);
  }, [organization]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!organization) return;
    setMessage(null);
    try {
      await api<Organization>(`/api/v1/organizations/${organization.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          retention_traces_days: traces,
          retention_runs_days: runs,
          retention_artifacts_days: artifacts,
        }),
      });
      refresh();
      setMessage("Retention policy saved. A scan job was queued.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save retention.");
    }
  }

  return (
    <div className="page">
      <PageHeader
        kicker="Manage"
        title="Retention"
        lede="Policy lives on the organization. The worker purges expired runs, traces, and local artifacts on each scan."
      />
      {message ? <div className="banner warn">{message}</div> : null}
      <form className="card span-6" style={{ maxWidth: 520 }} onSubmit={(event) => void save(event)}>
        <label className="field">
          <span>Traces (days)</span>
          <input
            type="number"
            min={1}
            max={3650}
            value={traces}
            onChange={(event) => setTraces(Number(event.target.value))}
          />
        </label>
        <label className="field">
          <span>Runs (days)</span>
          <input
            type="number"
            min={1}
            max={3650}
            value={runs}
            onChange={(event) => setRuns(Number(event.target.value))}
          />
        </label>
        <label className="field">
          <span>Artifacts (days)</span>
          <input
            type="number"
            min={1}
            max={3650}
            value={artifacts}
            onChange={(event) => setArtifacts(Number(event.target.value))}
          />
        </label>
        <button className="btn" type="submit" disabled={!canManage}>
          Save policy
        </button>
      </form>
    </div>
  );
}
