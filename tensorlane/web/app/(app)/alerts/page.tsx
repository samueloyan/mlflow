"use client";

import { useEffect, useState } from "react";

import { EmptyState, PageHeader, PlanGate } from "@/components/PageHeader";
import { api, type AlertEvent, type AlertRule } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useShell } from "@/lib/shell";
import { StatusBadge } from "@/components/ui/StatusBadge";

export default function AlertsPage() {
  const { organization, workspace, role } = useShell();
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [name, setName] = useState("Error rate");
  const [metric, setMetric] = useState("monthly_traces");
  const [threshold, setThreshold] = useState(40000);
  const [deliveryUrl, setDeliveryUrl] = useState("");
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
          delivery_url: deliveryUrl.trim() || null,
        }),
      });
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not create alert.");
    }
  }

  return (
    <div className="page">
      <PageHeader kicker="Operate" title="Alerts" lede="Fire when error rate, latency, quality, or spend crosses a threshold." />
      {message && !organization?.features?.quality_monitoring ? (
        <PlanGate body="Quality monitoring is included on Team and above." />
      ) : null}
      {message && organization?.features?.quality_monitoring ? <div className="banner danger">{message}</div> : null}
      <div className="grid">
        <div className="card span-8">
          {rules.length === 0 ? (
            <EmptyState title="No alert rules" body="Example: Error rate > 5%, p95 latency > 2 seconds, monthly spend > $5,000." />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Alert</th>
                  <th>Condition</th>
                  <th>Target</th>
                  <th>Delivery</th>
                  <th>Status</th>
                  <th>Last triggered</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id}>
                    <td>{rule.name}</td>
                    <td>
                      {rule.metric} {rule.operator} {rule.threshold}
                    </td>
                    <td>{rule.workspace_id ? "workspace" : "organization"}</td>
                    <td>{rule.delivery_url ? "webhook" : "in-app"}</td>
                    <td>
                      <StatusBadge label={rule.enabled ? "Enabled" : "Paused"} tone={rule.enabled ? "success" : "neutral"} />
                    </td>
                    <td>{events.find((event) => event.rule_id === rule.id)?.created_at ? formatDate(events.find((event) => event.rule_id === rule.id)?.created_at) : "—"}</td>
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
              <input type="number" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} required />
            </label>
            <label className="field">
              <span>Webhook URL (https)</span>
              <input
                value={deliveryUrl}
                onChange={(event) => setDeliveryUrl(event.target.value)}
                placeholder="https://hooks.example.com/tensorlane"
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
