export type Organization = {
  id: string;
  name: string;
  slug: string;
  plan: string;
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

export type Me = {
  id: string;
  email: string;
  name: string;
  organizations: { id: string; role: string }[];
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
  const payload = (await response.json()) as T & ErrorBody;
  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload.error?.message ?? "Request failed.",
      payload.error?.code ?? "ERROR",
      payload.error?.request_id,
    );
  }
  return payload;
}
