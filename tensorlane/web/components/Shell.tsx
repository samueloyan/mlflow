"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { UsageBanner } from "@/components/UsageBanner";
import { Wordmark } from "@/components/Wordmark";
import { api, type Me, type Organization, type Workspace } from "@/lib/api";
import { isActivePath, visibleNav } from "@/lib/nav";
import { ShellContext } from "@/lib/shell";

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [navOpen, setNavOpen] = useState(false);

  const refresh = useCallback(() => setTick((value) => value + 1), []);

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
  }, [pathname, router, tick]);

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
  }, [organizationId, tick]);

  useEffect(() => {
    if (workspaceId) {
      window.localStorage.setItem("tensorlane.workspace", workspaceId);
    }
  }, [workspaceId]);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  const organization = organizations.find((org) => org.id === organizationId) ?? null;
  const workspace = workspaces.find((row) => row.id === workspaceId) ?? null;
  const role = me?.organizations.find((row) => row.id === organization?.id)?.role ?? null;
  const navigation = useMemo(
    () => visibleNav(role, organization?.features),
    [organization?.features, role],
  );

  const value = useMemo(
    () => ({
      me: me ?? { id: "", email: "", name: "", organizations: [] },
      organizations,
      organization,
      workspaces,
      workspace,
      role,
      setOrganizationId: (id: string) => setOrganizationId(id),
      setWorkspaceId: (id: string) => setWorkspaceId(id),
      refresh,
    }),
    [me, organization, organizations, refresh, role, workspace, workspaces],
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
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="app-frame">
        <aside className="sidebar" data-open={navOpen}>
          <div className="sidebar-brand">
            <Wordmark />
            <button
              type="button"
              className="nav-toggle"
              aria-expanded={navOpen}
              aria-controls="primary-nav"
              onClick={() => setNavOpen((open) => !open)}
            >
              Menu
            </button>
          </div>
          <div className="sidebar-context">
            {organization ? (
              <label className="field">
                <span>Organization</span>
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
          <nav id="primary-nav" className="sidebar-nav" aria-label="Primary">
            {navigation.map((group) => (
              <div key={group.label || "root"} className="nav-group">
                {group.label ? <p className="nav-label">{group.label}</p> : null}
                {group.items.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    data-active={isActivePath(pathname, link.href)}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
          <div className="sidebar-foot">
            <span className="userchip">{me?.email}</span>
            {organization ? (
              <span className="plan-chip">{organization.plan}</span>
            ) : null}
            <form action="/api/logout" method="post">
              <button type="submit" className="btn secondary">
                Sign out
              </button>
            </form>
          </div>
        </aside>
        <div className="main-col" id="main">
          {organization ? <UsageBanner /> : null}
          {children}
        </div>
      </div>
    </ShellContext.Provider>
  );
}
