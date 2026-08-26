"use client";

import { useEffect, useState } from "react";

import { useShell } from "@/lib/shell";

export function ContextSwitchers({ collapsed }: { collapsed?: boolean }) {
  const { organizations, organization, workspaces, workspace, setOrganizationId, setWorkspaceId } = useShell();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!organization) return null;

  return (
    <div className="sidebar-context">
      <button
        type="button"
        className="context-pill"
        aria-expanded={open}
        aria-haspopup="listbox"
        title={collapsed ? `${organization.name} / ${workspace?.name ?? ""}` : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="context-mark" aria-hidden="true" />
        <span className="context-copy">
          <strong>{organization.name}</strong>
          <small>{workspace?.name ?? "Select workspace"}</small>
        </span>
        <span className="context-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open ? (
        <div className="context-menu" role="listbox" aria-label="Organization and workspace">
          <p className="nav-label">Organization</p>
          {organizations.map((org) => (
            <button
              type="button"
              key={org.id}
              className="dropdown-item"
              data-active={org.id === organization.id}
              onClick={() => {
                setOrganizationId(org.id);
              }}
            >
              {org.name}
            </button>
          ))}
          <p className="nav-label" style={{ marginTop: 8 }}>
            Workspace
          </p>
          {workspaces.map((row) => (
            <button
              type="button"
              key={row.id}
              className="dropdown-item"
              data-active={row.id === workspace?.id}
              onClick={() => {
                setWorkspaceId(row.id);
                setOpen(false);
              }}
            >
              {row.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
