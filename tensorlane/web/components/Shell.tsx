"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Wordmark } from "@/components/Wordmark";
import { api, type Me, type Organization, type Workspace } from "@/lib/api";
import { ShellContext } from "@/lib/shell";

const LINKS = [
  { href: "/overview", label: "Overview" },
  { href: "/tracking", label: "Workbench" },
  { href: "/members", label: "Members" },
  { href: "/keys", label: "Keys" },
  { href: "/usage", label: "Usage" },
  { href: "/settings", label: "Settings" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const profile = await api<Me>("/api/v1/me");
        const orgs = await api<Organization[]>("/api/v1/organizations");
        if (cancelled) return;
        setMe(profile);
        setOrganizations(orgs);
        if (orgs.length === 0) {
          if (pathname !== "/onboarding") {
            router.replace("/onboarding");
          }
          return;
        }
        const stored = window.localStorage.getItem("tensorlane.org");
        const nextOrg = orgs.find((org) => org.id === stored)?.id ?? orgs[0]?.id ?? null;
        setOrganizationId(nextOrg);
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Unable to load workspace.";
          if (message.toLowerCase().includes("authentication")) {
            router.replace("/login");
            return;
          }
          setError(message);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  useEffect(() => {
    if (!organizationId) return;
    window.localStorage.setItem("tensorlane.org", organizationId);
    let cancelled = false;
    async function loadWorkspaces() {
      const rows = await api<Workspace[]>(`/api/v1/workspaces?organization_id=${organizationId}`);
      if (cancelled) return;
      setWorkspaces(rows);
      const stored = window.localStorage.getItem("tensorlane.workspace");
      const next = rows.find((row) => row.id === stored)?.id ?? rows[0]?.id ?? null;
      setWorkspaceId(next);
    }
    void loadWorkspaces();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  useEffect(() => {
    if (workspaceId) {
      window.localStorage.setItem("tensorlane.workspace", workspaceId);
    }
  }, [workspaceId]);

  const organization = organizations.find((org) => org.id === organizationId) ?? null;
  const workspace = workspaces.find((row) => row.id === workspaceId) ?? null;

  const value = useMemo(
    () => ({
      me: me ?? { id: "", email: "", name: "", organizations: [] },
      organizations,
      organization,
      workspaces,
      workspace,
      setOrganizationId: (id: string) => setOrganizationId(id),
      setWorkspaceId: (id: string) => setWorkspaceId(id),
    }),
    [me, organization, organizations, workspace, workspaces],
  );

  if (error) {
    return (
      <div className="page">
        <p>{error}</p>
        <Link href="/login">Return to login</Link>
      </div>
    );
  }

  if (!me && pathname !== "/onboarding") {
    return (
      <div className="page">
        <p className="lede">Opening your workspace…</p>
      </div>
    );
  }

  return (
    <ShellContext.Provider value={value}>
      <header className="topbar">
        <div className="topbar-left">
          <Wordmark />
          {organization ? (
            <select
              className="quiet"
              value={organization.id}
              onChange={(event) => setOrganizationId(event.target.value)}
              aria-label="Organization"
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          ) : null}
          {workspace ? (
            <select
              className="quiet"
              value={workspace.id}
              onChange={(event) => setWorkspaceId(event.target.value)}
              aria-label="Workspace"
            >
              {workspaces.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        <nav className="nav" aria-label="Primary">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} data-active={pathname === link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="topbar-right">
          <span className="userchip">{me?.email}</span>
          <form action="/api/logout" method="post">
            <button type="submit" className="btn secondary">
              Sign out
            </button>
          </form>
        </div>
      </header>
      {children}
    </ShellContext.Provider>
  );
}
