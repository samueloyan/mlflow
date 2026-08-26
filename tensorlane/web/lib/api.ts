export type Organization = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  isolation_mode: string;
  workspace_acl: string;
  sso_enforced: boolean;
  sso_domain: string | null;
  retention_traces_days: number;
  retention_runs_days: number;
  retention_artifacts_days: number;
  stripe_customer_id: string | null;
  billing_email: string | null;
  features?: Record<string, boolean>;
  limits?: Record<string, number>;
};

export type Workspace = {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  mlflow_workspace_name: string;
  artifact_root: string;
};

export type Member = {
  user_id: string;
  email: string;
  role: string;
};

export type Invitation = {
  id: string;
  email: string;
  role: string;
  expires_at: string | null;
  accepted_at: string | null;
  revoked_at: string | null;
  invite_url?: string;
};

export type ApiKey = {
  id: string;
  name: string;
  key_prefix: string;
  workspace_id: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export type CreatedApiKey = ApiKey & { secret: string };

export type UsageMetric = {
  current: number;
  limit: number;
  warning: boolean;
  over_limit: boolean;
  behavior: string;
};

export type Usage = {
  plan: string;
  metrics: Record<string, UsageMetric>;
};

export type AuditEvent = {
  id: string;
  action: string;
  resource: string;
  resource_id: string | null;
  actor_user_id: string | null;
  result: string;
  created_at: string | null;
  request_id: string;
};

export type Plan = {
  id: string;
  price_usd_month: number;
  features: Record<string, boolean>;
  limits: Record<string, number>;
  limit_behavior: Record<string, string>;
  custom: boolean;
};

export type CostReport = {
  plan: string;
  price_usd_month: number;
  lines: { metric: string; quantity: number; unit_usd: number; amount_usd: number }[];
  workspaces?: {
    workspace_id: string | null;
    amount_usd: number;
    lines: { metric: string; quantity: number; unit_usd: number; amount_usd: number }[];
  }[];
  total_usd: number;
};

export type Approval = {
  id: string;
  kind: string;
  resource_ref: string;
  status: string;
  note: string;
  workspace_id: string | null;
  requested_by: string;
  reviewed_by: string | null;
  created_at: string | null;
  reviewed_at: string | null;
};

export type AlertRule = {
  id: string;
  name: string;
  metric: string;
  operator: string;
  threshold: number;
  window_hours: number;
  enabled: boolean;
  workspace_id: string | null;
  delivery_url: string | null;
};

export type AlertEvent = {
  id: string;
  rule_id: string;
  value: number;
  message: string;
  created_at: string | null;
};

export type SavedView = {
  id: string;
  name: string;
  surface: string;
  query: Record<string, unknown>;
  workspace_id: string | null;
  owner_user_id: string;
};

export type Me = {
  id: string;
  email: string;
  name: string;
  organizations: { id: string; role: string; name?: string; plan?: string }[];
};

type ErrorBody = {
  error?: { code?: string; message?: string; request_id?: string };
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | undefined;

  constructor(status: number, message: string, code: string, requestId?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  let payload: (T & ErrorBody) | undefined;
  if (text) {
    try {
      payload = JSON.parse(text) as T & ErrorBody;
    } catch {
      throw new ApiError(
        response.status,
        response.ok ? "Unexpected non-JSON response." : `Request failed (${response.status}).`,
        "NON_JSON",
      );
    }
  }
  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload?.error?.message ?? `Request failed (${response.status}).`,
      payload?.error?.code ?? "ERROR",
      payload?.error?.request_id,
    );
  }
  return payload as T;
}
