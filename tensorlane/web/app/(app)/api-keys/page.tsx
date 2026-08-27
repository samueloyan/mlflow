"use client";

import { useEffect, useState } from "react";

import { EmptyState, PageHeader } from "@/components/PageHeader";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { ErrorState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { api, type ApiKey, type CreatedApiKey } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { canManageKeys } from "@/lib/permissions";
import { usePublicTrackingUri } from "@/lib/usePublicTrackingUri";
import { useShell } from "@/lib/shell";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

export default function ApiKeysPage() {
  const { organization, workspaces, workspace, role } = useShell();
  const toast = useToast();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState("ci");
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [secret, setSecret] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const tracking = usePublicTrackingUri();
  const canCreate = canManageKeys(role);

  async function refresh() {
    if (!organization) return;
    setLoading(true);
    try {
      setKeys(await api<ApiKey[]>(`/api/v1/api-keys?organization_id=${organization.id}`));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load API keys.");
    } finally {
      setLoading(false);
    }
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
      setCreating(false);
      toast.push("API key created. Copy it now.", "success");
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not create key.");
    }
  }

  async function revoke(id: string) {
    if (!window.confirm("Revoke this API key? Running jobs using it will fail.")) return;
    await api(`/api/v1/api-keys/${id}`, { method: "DELETE" });
    toast.push("API key revoked.", "success");
    await refresh();
  }

  return (
    <div className="page">
      <PageHeader
        kicker="Govern"
        title="API Keys"
        lede="Create and manage credentials used to access Tensorlane. Secrets are shown once."
      >
        {canCreate ? (
          <button type="button" className="btn" onClick={() => setCreating(true)}>
            + Create API Key
          </button>
        ) : null}
      </PageHeader>
      {secret ? (
        <div className="banner warn">
          Copy this key now. It cannot be recovered.
          <CodeBlock value={secret} label="Copy secret" />
          <p className="lede">
            {`export MLFLOW_TRACKING_URI=${tracking}`}
            <br />
            {`export MLFLOW_TRACKING_TOKEN=tl_live_xxxxx`}
          </p>
        </div>
      ) : null}
      {message ? <div className="banner danger">{message}</div> : null}
      {loadError ? (
        <ErrorState title="Unable to load API keys" body={loadError} onRetry={() => void refresh()} />
      ) : loading ? (
        <p className="lede">Loading API keys…</p>
      ) : keys.length === 0 ? (
        <EmptyState
          title="No API keys yet"
          body="Create a workspace-scoped key for the SDK. Secrets are shown once."
        />
      ) : (
      <div className="card">
        <table className="data">
          <thead>
            <tr>
              <th>Name</th>
              <th>Prefix</th>
              <th>Workspace</th>
              <th>Created</th>
              <th>Last used</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => (
              <tr key={key.id}>
                <td>{key.name}</td>
                <td className="mono">{key.key_prefix}</td>
                <td>{workspaces.find((row) => row.id === key.workspace_id)?.name ?? "organization"}</td>
                <td>{formatDate(key.created_at)}</td>
                <td>{formatDate(key.last_used_at)}</td>
                <td>
                  <StatusBadge label={key.revoked_at ? "Revoked" : "Active"} tone={key.revoked_at ? "neutral" : "success"} />
                </td>
                <td>
                  {!key.revoked_at && canCreate ? (
                    <button type="button" className="btn danger" onClick={() => void revoke(key.id)}>
                      Revoke
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      {creating ? (
        <Modal
          title="Create API key"
          onClose={() => setCreating(false)}
          footer={
            <>
              <button type="button" className="btn secondary" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button type="submit" form="create-key" className="btn">
                Create
              </button>
            </>
          }
        >
          <form id="create-key" onSubmit={(event) => void create(event)}>
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
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
