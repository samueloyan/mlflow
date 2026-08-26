"use client";

import { useShell } from "@/lib/shell";

export function ContextSwitchers({ collapsed }: { collapsed?: boolean }) {
  const { organizations, organization, workspaces, workspace, setOrganizationId, setWorkspaceId } = useShell();

  return (
    <div className="sidebar-context">
      {organization ? (
        <label className="field">
          <span>Organization</span>
          <select
            className="quiet"
            value={organization.id}
            onChange={(event) => setOrganizationId(event.target.value)}
            aria-label="Organization"
            title={collapsed ? organization.name : undefined}
          >
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {workspace ? (
        <label className="field">
          <span>Workspace</span>
          <select
            className="quiet"
            value={workspace.id}
            onChange={(event) => setWorkspaceId(event.target.value)}
            aria-label="Workspace"
            title={collapsed ? workspace.name : undefined}
          >
            {workspaces.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}
