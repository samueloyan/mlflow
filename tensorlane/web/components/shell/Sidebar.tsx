"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "@/components/ui/Icons";
import { Wordmark } from "@/components/Wordmark";
import { isActivePath, type NavGroup } from "@/lib/nav";
import { useShell } from "@/lib/shell";

import { ContextSwitchers } from "./ContextSwitchers";

export function Sidebar({
  navigation,
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onMobileToggle,
}: {
  navigation: NavGroup[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onMobileToggle: () => void;
}) {
  const pathname = usePathname();
  const { me, organization, role } = useShell();

  return (
    <aside className="sidebar" data-open={mobileOpen}>
      <div className="sidebar-brand">
        <Wordmark tone="light" />
        <button type="button" className="nav-toggle" aria-expanded={mobileOpen} onClick={onMobileToggle}>
          Menu
        </button>
        <button
          type="button"
          className="sidebar-collapse"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={onToggleCollapsed}
        >
          <Icon name={collapsed ? "chevron" : "collapse"} />
        </button>
      </div>
      <ContextSwitchers collapsed={collapsed} />
      <nav id="primary-nav" className="sidebar-nav" aria-label="Primary">
        {navigation.map((group) => (
          <div key={group.label || "root"} className="nav-group">
            {group.label ? <p className="nav-label">{group.label}</p> : null}
            {group.items.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                data-active={isActivePath(pathname, link.href)}
                title={collapsed ? link.label : undefined}
              >
                <Icon name={link.icon} />
                <span>{link.label}</span>
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar-foot">
        <span className="userchip">{me?.name || me?.email}</span>
        <span className="plan-chip">
          {role ? role : "member"}
          {organization ? ` · ${organization.plan}` : ""}
        </span>
      </div>
    </aside>
  );
}
