"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icons";
import { pageTitle } from "@/lib/nav";
import { useShell } from "@/lib/shell";

import { NotificationCenter } from "./NotificationCenter";
import { UserMenu } from "./UserMenu";

export function Header({ onSearch }: { onSearch: () => void }) {
  const pathname = usePathname();
  const { me, organization, workspace } = useShell();
  const title = useMemo(() => pageTitle(pathname), [pathname]);
  const [notesOpen, setNotesOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const displayName = me?.name || me?.email || "User";

  return (
    <header className="app-header">
      <div className="app-header-left">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <span>{organization?.name ?? "Organization"}</span>
          <span aria-hidden="true">/</span>
          <span>{workspace?.name ?? "Workspace"}</span>
          <span aria-hidden="true">/</span>
          <strong>{title}</strong>
        </nav>
      </div>
      <button type="button" className="search-trigger" onClick={onSearch}>
        <Icon name="search" />
        <span>Search runs, experiments, models, traces, sessions...</span>
        <kbd>⌘K</kbd>
      </button>
      <div className="app-header-right">
        <a
          className="icon-btn"
          href="/onboarding"
          aria-label="Documentation"
          title="Documentation"
        >
          <Icon name="docs" />
        </a>
        <div style={{ position: "relative" }}>
          <button
            type="button"
            className="icon-btn"
            aria-label="Notifications"
            data-open={notesOpen}
            onClick={() => {
              setNotesOpen((open) => !open);
              setUserOpen(false);
            }}
          >
            <Icon name="bell" />
            <span className="dot" />
          </button>
          {notesOpen ? <NotificationCenter onClose={() => setNotesOpen(false)} /> : null}
        </div>
        <div style={{ position: "relative" }}>
          <button
            type="button"
            className="avatar-btn"
            aria-label="User menu"
            data-open={userOpen}
            onClick={() => {
              setUserOpen((open) => !open);
              setNotesOpen(false);
            }}
          >
            <Avatar name={displayName} size={32} />
          </button>
          {userOpen ? <UserMenu onClose={() => setUserOpen(false)} /> : null}
        </div>
      </div>
    </header>
  );
}
