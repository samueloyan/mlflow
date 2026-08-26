"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({
  kicker,
  title,
  lede,
  children,
}: {
  kicker: string;
  title: string;
  lede?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <p className="kicker">{kicker}</p>
        <h1>{title}</h1>
        {lede ? <p className="lede">{lede}</p> : null}
      </div>
      {children ? <div className="page-actions">{children}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      <p className="lede">{body}</p>
      {action}
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
    <EmptyState
      title={title ?? "Available on a higher plan"}
      body={body}
      action={
        <Link className="btn" href="/billing">
          Compare plans
        </Link>
      }
    />
  );
}
