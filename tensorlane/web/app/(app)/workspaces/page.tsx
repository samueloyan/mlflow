"use client";

import { useState } from "react";

import { PageHeader } from "@/components/PageHeader";
import { api, type Workspace } from "@/lib/api";
import { canAdmin } from "@/lib/permissions";
import { useShell } from "@/lib/shell";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

export default function WorkspacesPage() {
  const { organization, workspaces, role, refresh, setWorkspaceId } = useShell();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!organization) return;
    try {
      await api<Workspace>("/api/v1/workspaces", {
        method: "POST",
        body: JSON.stringify({ name, organization_id: organization.id }),
      });
      toast.push("Workspace created.", "success");
      setCreating(false);
      setName("");
      refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not create workspace.");
    }
  }

  return (
    <div className="page">
      <PageHeader kicker="Govern" title="Workspaces" lede="Organize projects and control access.">
        {canAdmin(role) ? (
          <button type="button" className="btn" onClick={() => setCreating(true)}>
            + New Workspace
          </button>
        ) : null}
      </PageHeader>
      {message ? <div className="banner danger">{message}</div> : null}
      <div className="grid">
        {workspaces.map((workspace) => (
          <button
            type="button"
            key={workspace.id}
            className="card span-4"
            style={{ textAlign: "left" }}
            onClick={() => setWorkspaceId(workspace.id)}
          >
            <h2>{workspace.name}</h2>
            <p className="lede" style={{ marginBottom: 0 }}>
              Slug {workspace.slug} · MLflow {workspace.mlflow_workspace_name}
            </p>
          </button>
        ))}
      </div>
      {creating ? (
        <Modal
          title="Create workspace"
          onClose={() => setCreating(false)}
          footer={
            <>
              <button type="button" className="btn secondary" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button type="submit" form="create-ws" className="btn">
                Create
              </button>
            </>
          }
        >
          <form id="create-ws" onSubmit={(event) => void create(event)}>
            <label className="field">
              <span>Name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
