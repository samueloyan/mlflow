"use client";

import { useEffect, useState } from "react";

import { api, type ApiKey, type CreatedApiKey } from "@/lib/api";
import { useShell } from "@/lib/shell";

export default function KeysPage() {
  const { organization, workspaces, workspace } = useShell();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState("ci");
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [secret, setSecret] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const tracking = process.env.NEXT_PUBLIC_TRACKING_URI || "https://api.tensorlane.ai";

  async function refresh() {
    if (!organization) return;
    setKeys(await api<ApiKey[]>(`/api/v1/api-keys?organization_id=${organization.id}`));
  }

  useEffect(() => {
    void refresh();
  }, [organization]);

  useEffect(() => {
    if (workspace) setWorkspaceId(workspace.id);
  }, [workspace]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!organization) return;
    setMessage(null);
    try {
      const created = await api<CreatedApiKey>("/api/v1/api-keys", {
        method: "POST",
        body: JSON.stringify({
          name,
          organization_id: organization.id,
          workspace_id: workspaceId || null,
          live: true,
        }),
      });
      setSecret(created.secret);
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not create key.");
    }
  }

  async function revoke(id: string) {
    await api(`/api/v1/api-keys/${id}`, { method: "DELETE" });
    await refresh();
  }

  return (
    <div className="page">
      <p className="kicker">Machines</p>
      <h1>API keys</h1>
      <p className="lede">
        Secrets are shown once. Tensorlane stores only an HMAC. Use `MLFLOW_TRACKING_TOKEN` with the
        unmodified MLflow SDK.
      </p>
      {secret ? (
        <div className="banner warn">
          Copy this key now. It cannot be recovered.
          <pre className="secret" style={{ marginTop: 12 }}>
            {secret}
          </pre>
          <button
            type="button"
            className="btn secondary"
            style={{ marginTop: 12 }}
            onClick={() => void navigator.clipboard.writeText(secret)}
          >
            Copy secret
          </button>
        </div>
      ) : null}
      {message ? <div className="banner danger">{message}</div> : null}
      <div className="grid">
        <div className="card span-8">
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Prefix</th>
                <th>Workspace</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id}>
                  <td>{key.name}</td>
                  <td>{key.key_prefix}</td>
                  <td>{key.workspace_id ? "scoped" : "organization"}</td>
                  <td>
                    {key.revoked_at ? (
                      "revoked"
                    ) : (
                      <button type="button" className="btn danger" onClick={() => void revoke(key.id)}>
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form className="card span-4" onSubmit={(event) => void create(event)}>
          <p className="kicker">New key</p>
          <label className="field">
            <span>Name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label className="field">
            <span>Workspace</span>
            <select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>
              {workspaces.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <button className="btn" type="submit">
            Create live key
          </button>
          <p className="lede" style={{ marginTop: 16 }}>
            Tracking host: {tracking}
          </p>
        </form>
      </div>
    </div>
  );
}
