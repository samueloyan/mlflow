"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { EmptyState, PageHeader } from "@/components/PageHeader";
import { api, type Organization, type Plan } from "@/lib/api";
import { formatCount, formatUsd } from "@/lib/format";
import { useShell } from "@/lib/shell";

function BillingInner() {
  const { organization, role, refresh } = useShell();
  const search = useSearchParams();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const canManage = role === "owner" || role === "billing";

  useEffect(() => {
    void api<{ plans: Plan[] }>("/api/v1/plans").then((payload) => setPlans(payload.plans));
  }, []);

  useEffect(() => {
    const status = search.get("status");
    const sessionId = search.get("session_id");
    if (status === "success" && sessionId && organization && canManage) {
      void api<Organization>(`/api/v1/organizations/${organization.id}/billing/confirm`, {
        method: "POST",
        body: JSON.stringify({ session_id: sessionId }),
      })
        .then(() => {
          setMessage("Plan updated.");
          refresh();
        })
        .catch((err) => setMessage(err instanceof Error ? err.message : "Could not confirm checkout."));
    }
  }, [canManage, organization, refresh, search]);

  async function checkout(plan: string) {
    if (!organization) return;
    setMessage(null);
    setBusy(plan);
    try {
      const result = await api<{ url: string }>(
        `/api/v1/organizations/${organization.id}/billing/checkout`,
        {
          method: "POST",
          body: JSON.stringify({
            plan,
            success_url: `${window.location.origin}/billing?status=success`,
            cancel_url: `${window.location.origin}/billing?status=cancel`,
          }),
        },
      );
      window.location.href = result.url;
    } catch (err) {
      setBusy(null);
      setMessage(err instanceof Error ? err.message : "Could not start checkout.");
    }
  }

  async function portal() {
    if (!organization) return;
    const result = await api<{ url: string }>(`/api/v1/organizations/${organization.id}/billing/portal`, {
      method: "POST",
    });
    window.location.href = result.url;
  }

  return (
    <div className="page">
      <PageHeader
        kicker="Manage"
        title="Billing"
        lede="Plans are snapshots on the organization. Stripe (or the local sandbox) is the only writer. The tracking path never talks to a card network."
      >
        {canManage ? (
          <button type="button" className="btn secondary" onClick={() => void portal()}>
            Customer portal
          </button>
        ) : null}
      </PageHeader>
      {message ? <div className="banner warn">{message}</div> : null}
      {search.get("status") === "cancel" ? (
        <div className="banner">Checkout was cancelled. Your current plan is unchanged.</div>
      ) : null}
      <div className="grid">
        {plans.map((plan) => (
          <div className={`card span-4${organization?.plan === plan.id ? " current" : ""}`} key={plan.id}>
            <p className="kicker">{plan.id}</p>
            <div className="metric">
              {plan.custom ? "Sales" : formatUsd(plan.price_usd_month)}
              {!plan.custom ? <span style={{ fontSize: 14, color: "var(--muted)" }}> / mo</span> : null}
            </div>
            <p className="lede">
              {formatCount(plan.limits.members)} seats · {formatCount(plan.limits.storage_gb)} GB ·{" "}
              {plan.features.sso ? "SSO + SCIM" : "no SSO"}
            </p>
            <ul className="plain-list">
              <li>{formatCount(plan.limits.monthly_traces)} traces / month</li>
              <li>{plan.features.approvals ? "Approvals" : "No approvals"}</li>
              <li>{plan.features.quality_monitoring ? "Monitoring" : "No monitoring"}</li>
              <li>{plan.features.dedicated_isolation ? "Dedicated isolation" : "Shared isolation"}</li>
            </ul>
            {organization?.plan === plan.id ? (
              <span className="status-pill approved">Current</span>
            ) : canManage && !plan.custom ? (
              <button
                type="button"
                className="btn"
                disabled={busy !== null}
                onClick={() => void checkout(plan.id)}
              >
                {busy === plan.id
                  ? "Redirecting…"
                  : plan.price_usd_month === 0
                    ? "Move to Free"
                    : "Upgrade"}
              </button>
            ) : plan.custom ? (
              <p className="lede">Talk to sales for Enterprise isolation, SSO, and SCIM.</p>
            ) : null}
          </div>
        ))}
        {plans.length === 0 ? (
          <div className="span-12">
            <EmptyState title="Plans unavailable" body="The control plane could not load the catalog." />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense
      fallback={
        <div className="page">
          <p className="lede">Loading billing…</p>
        </div>
      }
    >
      <BillingInner />
    </Suspense>
  );
}
