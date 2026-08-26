"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { api, type Usage } from "@/lib/api";
import { useShell } from "@/lib/shell";

export function UsageBanner() {
  const { organization } = useShell();
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    if (!organization) return;
    void api<Usage>(`/api/v1/usage?organization_id=${organization.id}`)
      .then(setUsage)
      .catch(() => setUsage(null));
  }, [organization]);

  if (!usage) return null;
  const over = Object.entries(usage.metrics).filter(([, row]) => row.over_limit);
  const warn = Object.entries(usage.metrics).filter(([, row]) => row.warning && !row.over_limit);
  if (over.length === 0 && warn.length === 0) return null;

  const tone = over.length ? "danger" : "warn";
  const label = over.length
    ? `${over.map(([name]) => name.replaceAll("_", " ")).join(", ")} at plan limit.`
    : `${warn.map(([name]) => name.replaceAll("_", " ")).join(", ")} approaching 80% of plan.`;

  return (
    <div className={`banner ${tone} usage-banner`}>
      <span>{label}</span>
      <Link href="/billing">Review plan</Link>
    </div>
  );
}
