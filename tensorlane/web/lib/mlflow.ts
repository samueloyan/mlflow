export function safeNext(value: string | null | undefined, fallback = "/overview"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  return value;
}

export class MlflowError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type MlflowResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

function errorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const body = payload as { message?: string; error_code?: string; error?: { message?: string } };
  return body.message || body.error?.message || body.error_code || fallback;
}

export async function mlflowCall<T>(
  path: string,
  init: RequestInit & { organizationId: string; workspaceId?: string | null },
): Promise<MlflowResult<T>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Tensorlane-Organization-Id": init.organizationId,
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.workspaceId) {
    headers["X-Tensorlane-Workspace-Id"] = init.workspaceId;
  }
  try {
    const { organizationId: _organizationId, workspaceId: _workspaceId, ...rest } = init;
    const response = await fetch(path, {
      ...rest,
      credentials: "include",
      headers,
    });
    const contentType = response.headers.get("content-type") ?? "";
    const isJson = contentType.includes("json");
    const payload = isJson ? ((await response.json()) as unknown) : null;
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: errorMessage(payload, `Unable to reach the tracking service (${response.status}).`),
      };
    }
    if (!isJson || payload === null) {
      return { ok: false, status: response.status, message: "The tracking service returned a non-JSON response." };
    }
    return { ok: true, data: payload as T };
  } catch {
    return { ok: false, status: 0, message: "The tracking service did not respond." };
  }
}

export async function mlflowJson<T>(
  path: string,
  init: RequestInit & { organizationId: string; workspaceId?: string | null },
): Promise<T | null> {
  const result = await mlflowCall<T>(path, init);
  return result.ok ? result.data : null;
}
