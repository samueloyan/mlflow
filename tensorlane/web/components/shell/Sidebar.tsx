"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Avatar } from "@/components/ui/Avatar";
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
  const { me, role } = useShell();
  const displayName = me?.name || me?.email || "User";

  return (
    <aside className="sidebar" data-open={mobileOpen} data-collapsed={collapsed ? "true" : "false"}>
      <div className="sidebar-brand">
        <Wordmark tone="light" />
        <button type="button" className="nav-toggle" aria-expanded={mobileOpen} onClick={onMobileToggle}>
          Menu
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
        <div className="sidebar-user">
          <Avatar name={displayName} />
          <span className="sidebar-user-copy">
            <strong>{displayName}</strong>
            <small>{role ? role[0]?.toUpperCase() + role.slice(1) : "Member"}</small>
          </span>
        </div>
        <button
          type="button"
          className="sidebar-collapse"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-pressed={collapsed}
          onClick={onToggleCollapsed}
        >
          <Icon name={collapsed ? "chevron" : "collapse"} />
          <span>{collapsed ? "Expand" : "Collapse"}</span>
        </button>
      </div>
    </aside>
  );
}
