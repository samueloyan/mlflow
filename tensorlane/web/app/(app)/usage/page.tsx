"use client";

import { useEffect, useState } from "react";

import { PageHeader } from "@/components/PageHeader";
import { api, type Usage } from "@/lib/api";
import { useShell } from "@/lib/shell";

export default function UsagePage() {
  const { organization } = useShell();
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    if (!organization) return;
    void api<Usage>(`/api/v1/usage?organization_id=${organization.id}`).then(setUsage);
  }, [organization]);

  return (
    <div className="page">
      <PageHeader
        kicker="Capacity"
        title="Usage"
        lede="Warnings fire at 80%. Traces and runs may exceed plan limits. Storage and seats stop. API volume is throttled."
      />
      <div className="grid">
        {usage
          ? Object.entries(usage.metrics).map(([metric, row]) => {
              const ratio = row.limit > 0 ? Math.min(100, (row.current / row.limit) * 100) : 0;
              return (
                <div className="card span-4" key={metric}>
                  <p className="kicker">{metric.replaceAll("_", " ")}</p>
                  <div className="metric">
                    {row.current.toLocaleString()}
                    <span style={{ fontSize: 14, color: "var(--muted)" }}>
                      {" "}
                      / {row.limit.toLocaleString()}
                    </span>
                  </div>
                  <div className={`meter ${row.over_limit ? "danger" : row.warning ? "warn" : ""}`}>
                    <i style={{ width: `${ratio}%` }} />
                  </div>
                  <p className="lede">
                    {row.behavior}
                    {row.warning ? " · approaching limit" : ""}
                    {row.over_limit ? " · over limit" : ""}
                  </p>
                </div>
              );
            })
          : null}
      </div>
    </div>
  );
}
