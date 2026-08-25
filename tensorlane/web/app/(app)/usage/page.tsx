"use client";

import { useEffect, useState } from "react";

import { api, type AuditEvent, type Usage } from "@/lib/api";
import { useShell } from "@/lib/shell";

export default function UsagePage() {
  const { organization } = useShell();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    if (!organization) return;
    void api<Usage>(`/api/v1/usage?organization_id=${organization.id}`).then(setUsage);
    void api<AuditEvent[]>(`/api/v1/audit-events?organization_id=${organization.id}`)
      .then(setEvents)
      .catch(() => setForbidden(true));
  }, [organization]);

  return (
    <div className="page">
      <p className="kicker">Capacity</p>
      <h1>Usage</h1>
      <p className="lede">
        Warnings fire at 80%. Traces and runs may exceed plan limits. Storage and seats stop. API
        volume is throttled.
      </p>
      <div className="grid">
        {usage
          ? Object.entries(usage.metrics).map(([metric, row]) => (
              <div className="card span-4" key={metric}>
                <p className="kicker">{metric.replaceAll("_", " ")}</p>
                <div className="metric">
                  {row.current}
                  <span style={{ fontSize: 14, color: "var(--muted)" }}> / {row.limit}</span>
                </div>
                <p className="lede">
                  {row.behavior}
                  {row.warning ? " · approaching limit" : ""}
                  {row.over_limit ? " · over limit" : ""}
                </p>
              </div>
            ))
          : null}
        <div className="card span-12">
          <p className="kicker">Audit</p>
          {forbidden ? (
            <p className="lede">Owners and admins can read the audit log.</p>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Action</th>
                  <th>Resource</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>{event.created_at}</td>
                    <td>{event.action}</td>
                    <td>{event.resource}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
