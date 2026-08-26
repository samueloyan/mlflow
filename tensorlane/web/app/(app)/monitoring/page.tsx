"use client";

import { useEffect, useState } from "react";

import { EmptyState, PageHeader, PlanGate } from "@/components/PageHeader";
import { api, type AlertEvent, type AlertRule } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useShell } from "@/lib/shell";

export default function MonitoringPage() {
  const { organization, workspace, role } = useShell();
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [name, setName] = useState("Trace volume");
  const [metric, setMetric] = useState("monthly_traces");
  const [threshold, setThreshold] = useState(40000);
  const [message, setMessage] = useState<string | null>(null);
  const canManage = role === "owner" || role === "admin" || role === "developer";

  async function refresh() {
    if (!organization) return;
    try {
      const payload = await api<{ rules: AlertRule[]; events: AlertEvent[] }>(
        `/api/v1/organizations/${organization.id}/alerts`,
      );
      setRules(payload.rules);
      setEvents(payload.events);
      setMessage(null);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Monitoring requires Team or higher.");
    }
  }

  useEffect(() => {
    void refresh();
  }, [organization]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!organization) return;
    try {
      await api(`/api/v1/organizations/${organization.id}/alerts`, {
        method: "POST",
        body: JSON.stringify({
          name,
          metric,
          operator: "gte",
          threshold,
          workspace_id: workspace?.id ?? null,
        }),
      });
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not create alert.");
    }
  }

  return (
    <div className="page">
      <PageHeader
        kicker="Operate"
        title="Monitoring"
        lede="Alert on usage and quality signals. The worker evaluates rules off the request path so tracing p99 stays clean."
      />
      {message && !organization?.features?.quality_monitoring ? (
        <PlanGate body="Quality monitoring is included on Team and above. Create rules here once you upgrade." />
      ) : null}
      {message && organization?.features?.quality_monitoring ? (
        <div className="banner danger">{message}</div>
      ) : null}
      <div className="grid">
        <div className="card span-8">
          <p className="kicker">Rules</p>
          {rules.length === 0 ? (
            <EmptyState
              title="No alert rules"
              body="Watch trace volume, run count, or storage before they become a billing surprise."
            />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Metric</th>
                  <th>When</th>
                  {canManage ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id}>
                    <td>{rule.name}</td>
                    <td>{rule.metric}</td>
                    <td>
                      {rule.operator} {rule.threshold}
                    </td>
                    {canManage ? (
                      <td>
                        <button
                          type="button"
                          className="btn danger"
                          onClick={() => {
                            if (!organization) return;
                            void api(`/api/v1/organizations/${organization.id}/alerts/${rule.id}`, {
                              method: "DELETE",
                            }).then(() => refresh());
                          }}
                        >
                          Remove
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="kicker" style={{ marginTop: 24 }}>
            Recent events
          </p>
          {events.length === 0 ? (
            <p className="lede">No firings yet.</p>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>{formatDate(event.created_at)}</td>
                    <td>{event.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {canManage ? (
          <form className="card span-4" onSubmit={(event) => void create(event)}>
            <p className="kicker">New rule</p>
            <label className="field">
              <span>Name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
            <label className="field">
              <span>Metric</span>
              <select value={metric} onChange={(event) => setMetric(event.target.value)}>
                <option value="monthly_traces">monthly_traces</option>
                <option value="monthly_runs">monthly_runs</option>
                <option value="storage_gb">storage_gb</option>
                <option value="monthly_api_requests">monthly_api_requests</option>
              </select>
            </label>
            <label className="field">
              <span>Threshold</span>
              <input
                type="number"
                value={threshold}
                onChange={(event) => setThreshold(Number(event.target.value))}
                required
              />
            </label>
            <button className="btn" type="submit">
              Create alert
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
