"use client";

import { useEffect, useState } from "react";

import { EmptyState, PageHeader } from "@/components/PageHeader";
import { api, type AuditEvent } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useShell } from "@/lib/shell";

export default function AuditPage() {
  const { organization } = useShell();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    if (!organization) return;
    void api<AuditEvent[]>(`/api/v1/audit-events?organization_id=${organization.id}`)
      .then(setEvents)
      .catch(() => setForbidden(true));
  }, [organization]);

  return (
    <div className="page">
      <PageHeader
        kicker="Manage"
        title="Audit log"
        lede="Every membership, key, billing, and security change is recorded with an actor and request id. Owners and admins can read this feed."
      >
        {organization && !forbidden ? (
          <a className="btn secondary" href={`/api/v1/audit-events.csv?organization_id=${organization.id}`}>
            Export CSV
          </a>
        ) : null}
      </PageHeader>
      <div className="card span-12">
        {forbidden ? (
          <p className="lede">Owners and admins can read the audit log.</p>
        ) : events.length === 0 ? (
          <EmptyState title="No events yet" body="Membership, key, billing, and security changes appear here." />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Resource</th>
                <th>Request</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td>{formatDate(event.created_at)}</td>
                  <td>{event.action}</td>
                  <td>
                    {event.resource}
                    {event.resource_id ? ` · ${event.resource_id}` : ""}
                  </td>
                  <td>{event.request_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
