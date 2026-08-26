"use client";

import type { ReactNode } from "react";

export { EmptyState } from "@/components/ui/EmptyState";
export { ErrorState } from "@/components/ui/EmptyState";

export function PageHeader({
  kicker,
  title,
  lede,
  children,
}: {
  kicker?: string;
  title: string;
  lede?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        {kicker ? <p className="kicker">{kicker}</p> : null}
        <h1>{title}</h1>
        {lede ? <p className="lede">{lede}</p> : null}
      </div>
      {children ? <div className="page-actions">{children}</div> : null}
    </div>
  );
}

export function PlanGate({
  title,
  body,
}: {
  title?: string;
  body: string;
}) {
  return (
    <div className="empty">
      <h2>{title ?? "Available on a higher plan"}</h2>
      <p className="lede">{body}</p>
      <a className="btn" href="/billing">
        Compare plans
      </a>
    </div>
  );
}
