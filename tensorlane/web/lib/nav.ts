export type NavItem = {
  href: string;
  label: string;
  icon: string;
  roles?: readonly string[];
  feature?: string;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

const ALL_ROLES = ["owner", "admin", "developer", "viewer", "billing"] as const;
const BUILD_ROLES = ["owner", "admin", "developer", "viewer"] as const;
const KEY_ROLES = ["owner", "admin", "developer"] as const;
const ADMIN_ROLES = ["owner", "admin"] as const;
const BILLING_ROLES = ["owner", "admin", "billing", "developer"] as const;
const BILLING_ONLY = ["owner", "billing"] as const;

export const NAV: NavGroup[] = [
  {
    label: "",
    items: [
      { href: "/overview", label: "Overview", icon: "overview" },
      { href: "/experiments", label: "Experiments", icon: "experiments", roles: BUILD_ROLES },
      { href: "/runs", label: "Runs", icon: "runs", roles: BUILD_ROLES },
      { href: "/models", label: "Models", icon: "models", roles: BUILD_ROLES },
      { href: "/traces", label: "Traces", icon: "traces", roles: BUILD_ROLES },
      { href: "/sessions", label: "Sessions", icon: "sessions", roles: BUILD_ROLES },
      { href: "/evaluations", label: "Evaluations", icon: "evaluations", roles: BUILD_ROLES },
      { href: "/review", label: "Review", icon: "review", roles: BUILD_ROLES },
      { href: "/datasets", label: "Datasets", icon: "datasets", roles: BUILD_ROLES },
      { href: "/prompts", label: "Prompts", icon: "prompts", roles: BUILD_ROLES },
      { href: "/playground", label: "Playground", icon: "playground", roles: BUILD_ROLES },
      { href: "/deployments", label: "Deployments", icon: "deployments", roles: BUILD_ROLES },
      { href: "/mcp", label: "MCP", icon: "mcp", roles: BUILD_ROLES },
      {
        href: "/monitoring",
        label: "Monitoring",
        icon: "monitoring",
        roles: [...BUILD_ROLES, "billing"],
        feature: "quality_monitoring",
      },
      { href: "/alerts", label: "Alerts", icon: "alerts", roles: [...BUILD_ROLES, "billing"] },
      { href: "/reports", label: "Reports", icon: "reports", roles: [...BUILD_ROLES, "billing"] },
    ],
  },
  {
    label: "Govern",
    items: [
      { href: "/workspaces", label: "Workspaces", icon: "workspaces", roles: BUILD_ROLES },
      { href: "/members", label: "Members", icon: "members", roles: BUILD_ROLES },
      { href: "/api-keys", label: "API Keys", icon: "keys", roles: KEY_ROLES },
      { href: "/integrations", label: "Integrations", icon: "integrations", roles: KEY_ROLES },
      { href: "/usage", label: "Usage & Billing", icon: "usage", roles: BILLING_ROLES },
      { href: "/audit", label: "Audit Logs", icon: "audit", roles: ADMIN_ROLES },
      { href: "/settings", label: "Settings", icon: "settings", roles: ADMIN_ROLES },
    ],
  },
];

export const EXTRA_NAV: NavItem[] = [
  { href: "/tracking", label: "Tracking UI", icon: "workbench", roles: BUILD_ROLES },
  { href: "/billing", label: "Billing", icon: "billing", roles: BILLING_ONLY },
  { href: "/cost", label: "Cost", icon: "cost", roles: BILLING_ROLES },
  { href: "/security", label: "Security", icon: "security", roles: ADMIN_ROLES },
  { href: "/retention", label: "Retention", icon: "retention", roles: ADMIN_ROLES },
  { href: "/approvals", label: "Approvals", icon: "approvals", roles: BUILD_ROLES, feature: "approvals" },
];

export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/overview") return pathname === href;
  if (href === "/runs") return pathname === "/runs" || pathname.startsWith("/runs/");
  if (href === "/usage") return pathname === "/usage" || pathname === "/billing" || pathname === "/cost";
  if (href === "/settings") {
    return pathname === "/settings" || pathname === "/security" || pathname === "/retention";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function allowedItem(
  item: NavItem,
  role: string | null,
  features: Record<string, boolean> | undefined,
): boolean {
  const allowed = item.roles ?? ALL_ROLES;
  if (role && !allowed.includes(role)) return false;
  if (item.feature && features && !features[item.feature]) return false;
  return true;
}

export function visibleNav(
  role: string | null,
  features: Record<string, boolean> | undefined,
): NavGroup[] {
  return NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => allowedItem(item, role, features)),
  })).filter((group) => group.items.length > 0);
}

export function visibleExtraNav(
  role: string | null,
  features: Record<string, boolean> | undefined,
): NavItem[] {
  return EXTRA_NAV.filter((item) => allowedItem(item, role, features));
}

export function pageTitle(pathname: string): string {
  if (pathname.startsWith("/design-system")) return "Design system";
  if (pathname.startsWith("/onboarding")) return "Onboarding";
  const items = [...NAV.flatMap((group) => group.items), ...EXTRA_NAV];
  const exact = items.find((item) => pathname === item.href);
  if (exact) return exact.label;
  const nested = items
    .filter((item) => item.href !== "/overview" && pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return nested?.label ?? "Tensorlane";
}
