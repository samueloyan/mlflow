"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { UsageBanner } from "@/components/UsageBanner";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { Header } from "@/components/shell/Header";
import { Sidebar } from "@/components/shell/Sidebar";
import { ToastProvider } from "@/components/ui/Toast";
import { api, type Me, type Organization, type Workspace } from "@/lib/api";
import { visibleNav } from "@/lib/nav";
import { ShellContext } from "@/lib/shell";
import { persistTenantCookies } from "@/lib/tenantCookies";

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [planeWarning, setPlaneWarning] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const refresh = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    const stored = window.localStorage.getItem("tensorlane.sidebar.collapsed");
    setCollapsed(stored === "1");
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const sessionResponse = await fetch("/api/auth/get-session", { credentials: "include" });
        const session = (await sessionResponse.json()) as {
          user?: { id: string; email: string; name?: string | null };
        } | null;
        if (!session?.user) {
          if (!cancelled) router.replace("/login");
          return;
        }
        const sessionMe: Me = {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name ?? "",
          organizations: [],
        };
        if (cancelled) return;
        setMe(sessionMe);
        setError(null);
        try {
          const profile = await api<Me>("/api/v1/me");
          const orgs = await api<Organization[]>("/api/v1/organizations");
          if (cancelled) return;
          setMe({ ...profile, name: profile.name || sessionMe.name, email: profile.email || sessionMe.email });
          setOrganizations(orgs);
          setPlaneWarning(null);
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
            setPlaneWarning(
              err instanceof Error ? err.message : "Unable to reach the Tensorlane control plane.",
            );
          }
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Unable to load workspace.";
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
      try {
        const rows = await api<Workspace[]>(`/api/v1/workspaces?organization_id=${organizationId}`);
        if (cancelled) return;
        setWorkspaces(rows);
        const stored = window.localStorage.getItem("tensorlane.workspace");
        const next = rows.find((row) => row.id === stored)?.id ?? rows[0]?.id ?? null;
        setWorkspaceId(next);
      } catch {
        if (!cancelled) setWorkspaces([]);
      }
    }
    void loadWorkspaces();
    return () => {
      cancelled = true;
    };
  }, [organizationId, tick]);

  useEffect(() => {
    if (workspaceId) {
      window.localStorage.setItem("tensorlane.workspace", workspaceId);
      persistTenantCookies(organizationId, workspaceId);
    }
  }, [organizationId, workspaceId]);

  useEffect(() => {
    setNavOpen(false);
    setPaletteOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
      <ToastProvider>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <div className="app-frame" data-collapsed={collapsed ? "true" : "false"}>
          <Sidebar
            navigation={navigation}
            collapsed={collapsed}
            onToggleCollapsed={() => {
              setCollapsed((value) => {
                const next = !value;
                window.localStorage.setItem("tensorlane.sidebar.collapsed", next ? "1" : "0");
                return next;
              });
            }}
            mobileOpen={navOpen}
            onMobileToggle={() => setNavOpen((open) => !open)}
          />
          <div className="main-col">
            <Header onSearch={() => setPaletteOpen(true)} />
            {planeWarning ? <div className="banner danger">{planeWarning}</div> : null}
            {organization ? <UsageBanner /> : null}
            <main id="main">{children}</main>
          </div>
        </div>
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} navigation={navigation} />
      </ToastProvider>
    </ShellContext.Provider>
  );
}
