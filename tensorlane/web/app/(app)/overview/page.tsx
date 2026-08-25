"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { api, type Usage } from "@/lib/api";
import { useShell } from "@/lib/shell";

export default function OverviewPage() {
  const { organization, workspace, workspaces } = useShell();
  const [usage, setUsage] = useState<Usage | null>(null);
  const tracking = process.env.NEXT_PUBLIC_TRACKING_URI || "https://api.tensorlane.ai";

  useEffect(() => {
    if (!organization) return;
    void api<Usage>(`/api/v1/usage?organization_id=${organization.id}`).then(setUsage);
  }, [organization]);

  if (!organization) {
    return (
      <div className="page">
        <p>Create an organization to begin.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <p className="kicker">Organization</p>
      <h1>{organization.name}</h1>
      <p className="lede">
        Track experiments, traces, and models with the MLflow SDK against a single host. Tensorlane
        binds every request to this organization before it reaches the data plane.
      </p>
      <div className="grid">
        <div className="card span-4">
          <p className="kicker">Plan</p>
          <div className="metric">{organization.plan}</div>
        </div>
        <div className="card span-4">
          <p className="kicker">Workspaces</p>
          <div className="metric">{workspaces.length}</div>
        </div>
        <div className="card span-4">
          <p className="kicker">Active workspace</p>
          <div className="metric" style={{ fontSize: 22 }}>
            {workspace?.name ?? "—"}
          </div>
        </div>
        <div className="card span-8">
          <p className="kicker">Tracking URI</p>
          <pre className="secret">{tracking}</pre>
          <p className="lede" style={{ marginTop: 12 }}>
            `mlflow.set_tracking_uri("{tracking}")` with `MLFLOW_TRACKING_TOKEN` set to a live key.
          </p>
          <Link className="btn" href="/tracking">
            Open workbench
          </Link>
        </div>
        <div className="card span-4">
          <p className="kicker">Seats</p>
          <div className="metric">
            {usage?.metrics.members?.current ?? "—"}
            <span style={{ fontSize: 14, color: "var(--muted)" }}>
              {" "}
              / {usage?.metrics.members?.limit ?? "—"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
