export type NavItem = {
  href: string;
  label: string;
  roles?: readonly string[];
  feature?: string;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

const ALL_ROLES = ["owner", "admin", "developer", "viewer", "billing"] as const;

export const NAV: NavGroup[] = [
  { label: "", items: [{ href: "/overview", label: "Overview" }] },
  {
    label: "Build",
    items: [
      { href: "/experiments", label: "Experiments", roles: ["owner", "admin", "developer", "viewer"] },
      { href: "/tracking", label: "Workbench", roles: ["owner", "admin", "developer", "viewer"] },
    ],
  },
  {
    label: "AI",
    items: [
      { href: "/traces", label: "Traces", roles: ["owner", "admin", "developer", "viewer"] },
      { href: "/prompts", label: "Prompts", roles: ["owner", "admin", "developer", "viewer"] },
      { href: "/evaluations", label: "Evaluations", roles: ["owner", "admin", "developer", "viewer"] },
    ],
  },
  {
    label: "Operate",
    items: [
      {
        href: "/approvals",
        label: "Approvals",
        roles: ["owner", "admin", "developer", "viewer"],
        feature: "approvals",
      },
      {
        href: "/monitoring",
        label: "Monitoring",
        roles: ["owner", "admin", "developer", "viewer", "billing"],
        feature: "quality_monitoring",
      },
    ],
  },
  {
    label: "Manage",
    items: [
      { href: "/members", label: "Members", roles: ["owner", "admin", "developer", "viewer"] },
      { href: "/keys", label: "Keys", roles: ["owner", "admin", "developer"] },
      { href: "/usage", label: "Usage", roles: ["owner", "admin", "billing", "developer"] },
      { href: "/cost", label: "Cost", roles: ["owner", "admin", "billing", "developer"] },
      { href: "/billing", label: "Billing", roles: ["owner", "billing"] },
      { href: "/audit", label: "Audit", roles: ["owner", "admin"] },
      { href: "/security", label: "Security", roles: ["owner", "admin"] },
      { href: "/retention", label: "Retention", roles: ["owner", "admin"] },
      { href: "/settings", label: "Settings", roles: ["owner", "admin"] },
    ],
  },
];

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function visibleNav(
  role: string | null,
  features: Record<string, boolean> | undefined,
): NavGroup[] {
  return NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      const allowed = item.roles ?? ALL_ROLES;
      if (role && !allowed.includes(role)) return false;
      if (item.feature && features && !features[item.feature]) return false;
      return true;
    }),
  })).filter((group) => group.items.length > 0);
}
