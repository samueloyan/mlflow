"use client";

import { useEffect, useState } from "react";

import { EmptyState, PageHeader } from "@/components/PageHeader";
import { api, type CostReport } from "@/lib/api";
import { formatUsd } from "@/lib/format";
import { useShell } from "@/lib/shell";

export default function CostPage() {
  const { organization, workspaces } = useShell();
  const [report, setReport] = useState<CostReport | null>(null);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    if (!organization) return;
    void api<CostReport>(`/api/v1/cost?organization_id=${organization.id}`)
      .then(setReport)
      .catch(() => setForbidden(true));
  }, [organization]);

  return (
    <div className="page">
      <PageHeader
        kicker="Manage"
        title="Cost"
        lede="Estimated spend from metered usage × unit rates on the current plan. This is guidance, not an invoice."
      />
      {forbidden ? (
        <div className="banner">You do not have permission to read cost.</div>
      ) : null}
      <div className="grid">
        <div className="card span-4">
          <p className="kicker">Plan price</p>
          <div className="metric">{formatUsd(report?.price_usd_month)}</div>
        </div>
        <div className="card span-4">
          <p className="kicker">Usage estimate</p>
          <div className="metric">{formatUsd(report?.total_usd)}</div>
        </div>
        <div className="card span-12">
          {!report?.lines.length ? (
            <EmptyState
              title="No metered usage yet"
              body="Cost is quantity × unit rate on the current plan. Invoices still come from Stripe."
            />
          ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Quantity</th>
                <th>Unit</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {report?.lines.map((line) => (
                <tr key={line.metric}>
                  <td>{line.metric}</td>
                  <td>{line.quantity.toLocaleString()}</td>
                  <td>{formatUsd(line.unit_usd)}</td>
                  <td>{formatUsd(line.amount_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
        {report?.workspaces?.length ? (
          <div className="card span-12">
            <p className="kicker">By workspace</p>
            <table className="data">
              <thead>
                <tr>
                  <th>Workspace</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {report.workspaces.map((row) => (
                  <tr key={row.workspace_id ?? "unscoped"}>
                    <td>
                      {row.workspace_id
                        ? workspaces.find((workspace) => workspace.id === row.workspace_id)?.name ??
                          row.workspace_id
                        : "Organization-wide"}
                    </td>
                    <td>{formatUsd(row.amount_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
