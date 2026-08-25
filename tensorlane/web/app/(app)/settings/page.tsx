"use client";

import { useState } from "react";

import { api, type Workspace } from "@/lib/api";
import { useShell } from "@/lib/shell";

export default function SettingsPage() {
  const { organization, workspaces } = useShell();
  const [name, setName] = useState("Staging");
  const [message, setMessage] = useState<string | null>(null);

  async function createWorkspace(event: React.FormEvent) {
    event.preventDefault();
    if (!organization) return;
    setMessage(null);
    try {
      await api<Workspace>("/api/v1/workspaces", {
        method: "POST",
        body: JSON.stringify({ name, organization_id: organization.id }),
      });
      window.location.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not create workspace.");
    }
  }

  return (
    <div className="page">
      <p className="kicker">Organization</p>
      <h1>Settings</h1>
      <p className="lede">
        Workspaces map 1:1 onto MLflow workspaces. Artifact prefixes are
        `org/&lt;org_id&gt;/workspace/&lt;workspace_id&gt;`.
      </p>
      {message ? <div className="banner danger">{message}</div> : null}
      <div className="grid">
        <div className="card span-8">
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>MLflow workspace</th>
                <th>Artifact root</th>
              </tr>
            </thead>
            <tbody>
              {workspaces.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{row.mlflow_workspace_name}</td>
                  <td>{row.artifact_root}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form className="card span-4" onSubmit={(event) => void createWorkspace(event)}>
          <p className="kicker">New workspace</p>
          <label className="field">
            <span>Name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <button className="btn" type="submit">
            Create workspace
          </button>
        </form>
      </div>
    </div>
  );
}
