"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { PageHeader } from "@/components/PageHeader";
import { CopyButton } from "@/components/CopyButton";
import { api, type Approval, type Usage } from "@/lib/api";
import { formatCount } from "@/lib/format";
import { useShell } from "@/lib/shell";

export default function OverviewPage() {
  const { organization, workspace, workspaces, role } = useShell();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const tracking = process.env.NEXT_PUBLIC_TRACKING_URI || "https://api.tensorlane.ai";

  useEffect(() => {
    if (!organization) return;
    void api<Usage>(`/api/v1/usage?organization_id=${organization.id}`).then(setUsage);
    if (organization.features?.approvals) {
      void api<Approval[]>(`/api/v1/organizations/${organization.id}/approvals`)
        .then((rows) => setApprovals(rows.filter((row) => row.status === "pending")))
        .catch(() => setApprovals([]));
    } else {
      setApprovals([]);
    }
  }, [organization]);

  if (!organization) {
    return (
      <div className="page">
        <p>Create an organization to begin.</p>
      </div>
    );
  }

  const traces = usage?.metrics.monthly_traces;
  const seats = usage?.metrics.members;

  return (
    <div className="page">
      <PageHeader
        kicker="Home"
        title={organization.name}
        lede="Track experiments, traces, and models with the MLflow SDK against a single host. Tensorlane binds every request to this organization before it reaches the data plane."
      />
      <div className="grid">
        <div className="card span-4">
          <p className="kicker">Plan</p>
          <div className="metric">{organization.plan}</div>
          <p className="lede" style={{ marginBottom: 0 }}>
            Isolation {organization.isolation_mode} · ACL {organization.workspace_acl.replace("_", "-")}
          </p>
        </div>
        <div className="card span-4">
          <p className="kicker">Workspaces</p>
          <div className="metric">{workspaces.length}</div>
        </div>
        <div className="card span-4">
          <p className="kicker">Your role</p>
          <div className="metric" style={{ fontSize: 22 }}>
            {role ?? "—"}
          </div>
        </div>
        <div className="card span-8">
          <p className="kicker">Tracking URI</p>
          <pre className="secret">{tracking}</pre>
          <p className="lede" style={{ marginTop: 12 }}>
            `mlflow.set_tracking_uri("{tracking}")` with `MLFLOW_TRACKING_TOKEN` set to a live key.
            Active workspace: {workspace?.name ?? "—"}.
          </p>
          <div className="page-actions">
            <CopyButton value={tracking} label="Copy tracking URI" />
            <Link className="btn" href="/tracking">
              Open workbench
            </Link>
            <Link className="btn secondary" href="/keys">
              Create a key
            </Link>
          </div>
        </div>
        <div className="card span-4">
          <p className="kicker">Seats</p>
          <div className="metric">
            {formatCount(seats?.current)}
            <span style={{ fontSize: 14, color: "var(--muted)" }}> / {formatCount(seats?.limit)}</span>
          </div>
              {seats ? (
            <div className={`meter ${seats.over_limit ? "danger" : seats.warning ? "warn" : ""}`}>
              <i style={{ width: `${Math.min(100, seats.limit ? (seats.current / seats.limit) * 100 : 0)}%` }} />
            </div>
          ) : null}
          {traces ? (
            <p className="lede" style={{ marginTop: 12, marginBottom: 0 }}>
              {traces.current.toLocaleString()} traces this period
            </p>
          ) : null}
        </div>
        {approvals.length ? (
          <div className="card span-12">
            <p className="kicker">Waiting on review</p>
            <ul className="plain-list">
              {approvals.slice(0, 5).map((row) => (
                <li key={row.id}>
                  {row.kind} · {row.resource_ref}
                </li>
              ))}
            </ul>
            <Link href="/approvals">Open approvals</Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
