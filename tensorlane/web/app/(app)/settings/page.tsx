"use client";

import { useEffect, useState } from "react";

import { PageHeader } from "@/components/PageHeader";
import { api, type Member, type Organization, type Workspace } from "@/lib/api";
import { displayArtifactUri } from "@/lib/format";
import { useShell } from "@/lib/shell";

export default function SettingsPage() {
  const { organization, workspaces, role, refresh } = useShell();
  const [name, setName] = useState("Staging");
  const [acl, setAcl] = useState(organization?.workspace_acl ?? "org_wide");
  const [isolation, setIsolation] = useState(organization?.isolation_mode ?? "shared");
  const [message, setMessage] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [grantWorkspace, setGrantWorkspace] = useState("");
  const [grantUser, setGrantUser] = useState("");
  const [grants, setGrants] = useState<{ user_id: string; role: string }[]>([]);
  const canAdmin = role === "owner" || role === "admin";
  const canOwner = role === "owner";

  useEffect(() => {
    if (!organization) return;
    setAcl(organization.workspace_acl);
    setIsolation(organization.isolation_mode);
    void api<Member[]>(`/api/v1/organizations/${organization.id}/members`).then(setMembers);
  }, [organization]);

  useEffect(() => {
    if (!organization || !grantWorkspace) {
      setGrants([]);
      return;
    }
    void api<{ user_id: string; role: string }[]>(
      `/api/v1/organizations/${organization.id}/workspaces/${grantWorkspace}/members`,
    ).then(setGrants);
  }, [grantWorkspace, organization]);

  async function createWorkspace(event: React.FormEvent) {
    event.preventDefault();
    if (!organization) return;
    setMessage(null);
    try {
      await api<Workspace>("/api/v1/workspaces", {
        method: "POST",
        body: JSON.stringify({ name, organization_id: organization.id }),
      });
      refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not create workspace.");
    }
  }

  async function saveOrg(event: React.FormEvent) {
    event.preventDefault();
    if (!organization) return;
    setMessage(null);
    try {
      await api<Organization>(`/api/v1/organizations/${organization.id}`, {
        method: "PATCH",
        body: JSON.stringify({ workspace_acl: acl, isolation_mode: isolation }),
      });
      refresh();
      setMessage("Organization updated.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not update organization.");
    }
  }

  async function addGrant(event: React.FormEvent) {
    event.preventDefault();
    if (!organization || !grantWorkspace || !grantUser) return;
    await api(`/api/v1/organizations/${organization.id}/workspaces/${grantWorkspace}/members`, {
      method: "POST",
      body: JSON.stringify({ user_id: grantUser, role: "developer" }),
    });
    const next = await api<{ user_id: string; role: string }[]>(
      `/api/v1/organizations/${organization.id}/workspaces/${grantWorkspace}/members`,
    );
    setGrants(next);
  }

  async function removeGrant(userId: string) {
    if (!organization || !grantWorkspace) return;
    await api(
      `/api/v1/organizations/${organization.id}/workspaces/${grantWorkspace}/members/${userId}`,
      { method: "DELETE" },
    );
    setGrants((rows) => rows.filter((row) => row.user_id !== userId));
  }

  return (
    <div className="page">
      <PageHeader
        kicker="Organization"
        title="Settings"
        lede="Workspaces map 1:1 onto tracking workspaces. Artifact prefixes are org/<org_id>/workspace/<workspace_id>."
      />
      {message ? <div className="banner warn">{message}</div> : null}
      <div className="grid">
        <div className="card span-8">
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Tracking workspace</th>
                <th>Artifact root</th>
              </tr>
            </thead>
            <tbody>
              {workspaces.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{row.mlflow_workspace_name}</td>
                  <td>{displayArtifactUri(row.artifact_root)}</td>
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
          <button className="btn" type="submit" disabled={!canAdmin}>
            Create workspace
          </button>
        </form>
        <form className="card span-6" onSubmit={(event) => void saveOrg(event)}>
          <p className="kicker">Access and isolation</p>
          <label className="field">
            <span>Workspace ACL</span>
            <select value={acl} onChange={(event) => setAcl(event.target.value)} disabled={!canAdmin}>
              <option value="org_wide">Organization-wide (default)</option>
              <option value="restricted">Restricted grants</option>
            </select>
          </label>
          {acl === "restricted" ? (
            <p className="lede">
              Developers and viewers will only see workspaces they are granted. Assign grants below
              before you switch, or they will see an empty list. Owners and admins always see every
              workspace.
            </p>
          ) : null}
          <label className="field">
            <span>Isolation</span>
            <select
              value={isolation}
              onChange={(event) => setIsolation(event.target.value)}
              disabled={!canOwner}
            >
              <option value="shared">Shared</option>
              <option value="dedicated">Dedicated (Enterprise)</option>
            </select>
          </label>
          <button className="btn" type="submit" disabled={!canAdmin}>
            Save
          </button>
        </form>
        {acl === "restricted" && canAdmin ? (
          <form className="card span-6" onSubmit={(event) => void addGrant(event)}>
            <p className="kicker">Workspace grants</p>
            <label className="field">
              <span>Workspace</span>
              <select value={grantWorkspace} onChange={(event) => setGrantWorkspace(event.target.value)}>
                <option value="">Select</option>
                {workspaces.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Member</span>
              <select value={grantUser} onChange={(event) => setGrantUser(event.target.value)}>
                <option value="">Select</option>
                {members
                  .filter((member) => member.role !== "owner" && member.role !== "admin")
                  .map((member) => (
                    <option key={member.user_id} value={member.user_id}>
                      {member.email}
                    </option>
                  ))}
              </select>
            </label>
            <button className="btn" type="submit" disabled={!grantWorkspace || !grantUser}>
              Grant access
            </button>
            {grants.length ? (
              <table className="data" style={{ marginTop: 16 }}>
                <thead>
                  <tr>
                    <th>User</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {grants.map((row) => (
                    <tr key={row.user_id}>
                      <td>{members.find((member) => member.user_id === row.user_id)?.email ?? row.user_id}</td>
                      <td>
                        <button type="button" className="btn danger" onClick={() => void removeGrant(row.user_id)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </form>
        ) : null}
      </div>
    </div>
  );
}
