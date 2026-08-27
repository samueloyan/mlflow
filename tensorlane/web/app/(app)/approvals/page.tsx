"use client";

import { useEffect, useState } from "react";

import { EmptyState, PageHeader, PlanGate } from "@/components/PageHeader";
import { api, type Approval } from "@/lib/api";
import { useShell } from "@/lib/shell";

export default function ApprovalsPage() {
  const { organization, workspace, role, me } = useShell();
  const [rows, setRows] = useState<Approval[]>([]);
  const [title, setTitle] = useState("Promote prompt production");
  const [kind, setKind] = useState("prompt.promote");
  const [message, setMessage] = useState<string | null>(null);
  const canRequest = role === "owner" || role === "admin" || role === "developer";
  const canReview = role === "owner" || role === "admin";

  async function refresh() {
    if (!organization) return;
    try {
      setRows(await api<Approval[]>(`/api/v1/organizations/${organization.id}/approvals`));
      setMessage(null);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Approvals require Team or higher.");
    }
  }

  useEffect(() => {
    void refresh();
  }, [organization]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!organization) return;
    try {
      await api(`/api/v1/organizations/${organization.id}/approvals`, {
        method: "POST",
        body: JSON.stringify({
          kind,
          resource_ref: title,
          note: "",
          workspace_id: workspace?.id ?? null,
        }),
      });
      setTitle("");
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not create approval.");
    }
  }

  async function review(id: string, decision: string) {
    if (!organization) return;
    await api(`/api/v1/organizations/${organization.id}/approvals/${id}/review`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    });
    await refresh();
  }

  return (
    <div className="page">
      <PageHeader
        kicker="Operate"
        title="Approvals"
        lede="Promote prompts, evaluations, and production changes with a recorded reviewer. Team plans and above."
      />
      {message && !organization?.features?.approvals ? (
        <PlanGate body="Approvals ship on Team and above so a second reviewer can sign off on production changes." />
      ) : null}
      {message && organization?.features?.approvals ? <div className="banner danger">{message}</div> : null}
      <div className="grid">
        <div className="card span-8">
          {rows.length === 0 ? (
            <EmptyState
              title="No open or recent requests"
              body="Developers can request a change. Owners and admins review it. Nothing is applied to the tracking store until a reviewer decides."
            />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Kind</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.resource_ref}</td>
                    <td>{row.kind}</td>
                    <td>
                      <span className={`status-pill ${row.status}`}>{row.status}</span>
                    </td>
                    <td>
                      {canReview && row.status === "pending" && row.requested_by !== me.id ? (
                        <>
                          <button
                            type="button"
                            className="btn"
                            onClick={() => void review(row.id, "approved")}
                          >
                            Approve
                          </button>{" "}
                          <button
                            type="button"
                            className="btn danger"
                            onClick={() => void review(row.id, "rejected")}
                          >
                            Reject
                          </button>
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {canRequest ? (
          <form className="card span-4" onSubmit={(event) => void create(event)}>
            <p className="kicker">New request</p>
            <label className="field">
              <span>Kind</span>
              <select value={kind} onChange={(event) => setKind(event.target.value)}>
                <option value="prompt.promote">Prompt promote</option>
                <option value="eval.publish">Evaluation publish</option>
                <option value="model.production">Model production</option>
              </select>
            </label>
            <label className="field">
              <span>What should change</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} required />
            </label>
            <button className="btn" type="submit">
              Request review
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
