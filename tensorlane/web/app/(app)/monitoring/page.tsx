"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { PageHeader } from "@/components/PageHeader";
import { MetricCard } from "@/components/ui/MetricCard";
import { ChartCard, LineChart, BarChart } from "@/components/ui/Charts";
import { api, type AlertEvent, type AlertRule, type Usage } from "@/lib/api";
import { formatCount } from "@/lib/format";
import { useShell } from "@/lib/shell";
import { useTrackingContext } from "@/lib/useTrackingContext";
import { bucketByDay, searchExperiments, searchTraces, type TraceInfo } from "@/lib/tracking";

export default function MonitoringPage() {
  const { organization } = useShell();
  const ctx = useTrackingContext();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [traces, setTraces] = useState<TraceInfo[]>([]);

  useEffect(() => {
    if (!organization) return;
    void api<Usage>(`/api/v1/usage?organization_id=${organization.id}`).then(setUsage).catch(() => setUsage(null));
    void api<{ rules: AlertRule[]; events: AlertEvent[] }>(`/api/v1/organizations/${organization.id}/alerts`)
      .then((payload) => {
        setRules(payload.rules);
        setEvents(payload.events);
      })
      .catch(() => undefined);
  }, [organization]);

  useEffect(() => {
    if (!ctx) return;
    void searchExperiments(ctx).then(async (result) => {
      if (!result.ok) return;
      const ids = (result.data.experiments ?? []).map((row) => row.experiment_id).filter((id): id is string => Boolean(id));
      const tracesResult = await searchTraces(ctx, ids, { maxResults: 100 });
      if (tracesResult.ok) setTraces(tracesResult.data.traces ?? []);
    });
  }, [ctx]);

  const errorTraces = traces.filter((trace) => (trace.state || trace.status || "").toUpperCase() === "ERROR");
  const errorRate = traces.length ? (errorTraces.length / traces.length) * 100 : 0;

  return (
    <div className="page">
      <PageHeader
        kicker="Operate"
        title="Monitoring"
        lede="Traffic, errors, and cost for this organization. Alert rules live on Alerts."
      >
        <Link className="btn secondary" href="/alerts">
          Alert rules
        </Link>
      </PageHeader>
      <div className="grid">
        <div className="span-3">
          <MetricCard label="Applications" value={formatCount(1)} hint="This workspace" icon="monitoring" />
        </div>
        <div className="span-3">
          <MetricCard label="Active deployments" value="—" hint="No deploy API yet" icon="deployments" />
        </div>
        <div className="span-3">
          <MetricCard label="Error rate" value={`${errorRate.toFixed(1)}%`} hint={`${errorTraces.length} error traces`} />
        </div>
        <div className="span-3">
          <MetricCard
            label="Monthly traces"
            value={formatCount(usage?.metrics.monthly_traces?.current)}
            hint={`Limit ${formatCount(usage?.metrics.monthly_traces?.limit)}`}
          />
        </div>
        <div className="span-8">
          <ChartCard title="Trace volume">
            <LineChart
              series={[
                {
                  label: "Traces",
                  values: bucketByDay(
                    traces.map((trace) =>
                      trace.timestamp_ms ? Number(trace.timestamp_ms) : trace.request_time ? Date.parse(trace.request_time) : 0,
                    ),
                  ),
                },
              ]}
            />
          </ChartCard>
        </div>
        <div className="span-4">
          <ChartCard title="Errors vs OK">
            <BarChart
              items={[
                { label: "OK", value: traces.length - errorTraces.length, color: "var(--color-success)" },
                { label: "Error", value: errorTraces.length, color: "var(--color-danger)" },
              ]}
            />
          </ChartCard>
        </div>
        <div className="card span-12">
          <h2>Alert events</h2>
          {events.length === 0 ? (
            <p className="lede">
              {rules.length ? "No firings yet." : "Create rules on the Alerts page."}
            </p>
          ) : (
            <ul className="plain-list">
              {events.slice(0, 8).map((event) => (
                <li key={event.id}>{event.message}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
