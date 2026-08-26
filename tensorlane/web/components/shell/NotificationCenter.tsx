"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { api, type Approval, type Usage } from "@/lib/api";
import { useShell } from "@/lib/shell";

export function NotificationCenter({ onClose }: { onClose: () => void }) {
  const { organization } = useShell();
  const [items, setItems] = useState<{ id: string; title: string; href: string }[]>([]);

  useEffect(() => {
    if (!organization) return;
    const org = organization;
    let cancelled = false;
    async function load() {
      const notes: { id: string; title: string; href: string }[] = [];
      try {
        const usage = await api<Usage>(`/api/v1/usage?organization_id=${org.id}`);
        for (const [name, row] of Object.entries(usage.metrics)) {
          if (row.over_limit || row.warning) {
            notes.push({
              id: `usage-${name}`,
              title: `${name.replaceAll("_", " ")} ${row.over_limit ? "at plan limit" : "approaching limit"}`,
              href: "/usage",
            });
          }
        }
      } catch {
        // Usage is advisory.
      }
      if (org.features?.approvals) {
        try {
          const approvals = await api<Approval[]>(`/api/v1/organizations/${org.id}/approvals`);
          for (const row of approvals.filter((item) => item.status === "pending").slice(0, 5)) {
            notes.push({ id: row.id, title: `Approval: ${row.kind}`, href: "/approvals" });
          }
        } catch {
          // Feature may be gated.
        }
      }
      if (!cancelled) setItems(notes);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [organization]);

  return (
    <div className="dropdown" role="menu" aria-label="Notifications">
      {items.length === 0 ? (
        <p className="lede" style={{ margin: 8 }}>
          No unread notifications.
        </p>
      ) : (
        items.map((item) => (
          <Link key={item.id} className="dropdown-item" href={item.href} onClick={onClose}>
            <strong>{item.title}</strong>
          </Link>
        ))
      )}
    </div>
  );
}
