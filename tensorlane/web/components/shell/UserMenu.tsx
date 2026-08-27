"use client";

import Link from "next/link";

import { useShell } from "@/lib/shell";

export function UserMenu({ onClose }: { onClose: () => void }) {
  const { me, organization, role } = useShell();
  return (
    <div className="dropdown" role="menu" aria-label="User menu" style={{ minWidth: 240 }}>
      <div className="dropdown-item">
        <strong>{me.name || me.email}</strong>
        <span className="lede" style={{ margin: 0 }}>
          {me.email}
        </span>
        <span className="lede" style={{ margin: 0 }}>
          {role ?? "member"}
          {organization ? ` · ${organization.plan}` : ""}
        </span>
      </div>
      <Link className="dropdown-item" href="/tracking" onClick={onClose}>
        Tracking UI
      </Link>
      <Link className="dropdown-item" href="/settings" onClick={onClose}>
        Settings
      </Link>
      <Link className="dropdown-item" href="/security" onClick={onClose}>
        Security
      </Link>
      <Link className="dropdown-item" href="/billing" onClick={onClose}>
        Billing
      </Link>
      <form action="/api/logout" method="post">
        <button type="submit" className="dropdown-item" style={{ width: "100%", border: 0, background: "transparent", textAlign: "left" }}>
          Sign out
        </button>
      </form>
    </div>
  );
}
