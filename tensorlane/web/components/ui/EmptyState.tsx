import type { ReactNode } from "react";

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

export function ErrorState({
  title,
  body,
  onRetry,
}: {
  title: string;
  body: string;
  onRetry?: () => void;
}) {
  return (
    <div className="error-state">
      <h2>{title}</h2>
      <p className="lede">{body}</p>
      {onRetry ? (
        <button type="button" className="btn secondary" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}
