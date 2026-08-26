export function safeNext(value: string | null | undefined, fallback = "/overview"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  return value;
}

export async function mlflowJson<T>(
  path: string,
  init: RequestInit & { organizationId: string; workspaceId?: string | null },
): Promise<T | null> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Tensorlane-Organization-Id": init.organizationId,
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.workspaceId) {
    headers["X-Tensorlane-Workspace-Id"] = init.workspaceId;
  }
  try {
    const response = await fetch(path, {
      ...init,
      credentials: "include",
      headers,
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.includes("json")) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  }
}
