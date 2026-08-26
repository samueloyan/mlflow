"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import { Icon } from "@/components/ui/Icons";
import { pageTitle } from "@/lib/nav";
import { useShell } from "@/lib/shell";

import { NotificationCenter } from "./NotificationCenter";
import { UserMenu } from "./UserMenu";

export function Header({ onSearch }: { onSearch: () => void }) {
  const pathname = usePathname();
  const { organization, workspace } = useShell();
  const title = useMemo(() => pageTitle(pathname), [pathname]);
  const [notesOpen, setNotesOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);

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
      <div className="app-header-right">
        <button type="button" className="search-trigger" onClick={onSearch}>
          <Icon name="search" />
          Search Tensorlane
          <kbd>⌘K</kbd>
        </button>
        <a
          className="icon-btn"
          href="https://mlflow.org/docs/latest/"
          target="_blank"
          rel="noreferrer"
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
            className="icon-btn"
            aria-label="User menu"
            data-open={userOpen}
            onClick={() => {
              setUserOpen((open) => !open);
              setNotesOpen(false);
            }}
          >
            <Icon name="user" />
          </button>
          {userOpen ? <UserMenu onClose={() => setUserOpen(false)} /> : null}
        </div>
        <Link className="btn secondary" href="/tracking">
          Workbench
        </Link>
      </div>
    </header>
  );
}
