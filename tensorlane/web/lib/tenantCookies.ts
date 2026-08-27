export function persistTenantCookies(
  organizationId: string | null,
  workspaceId: string | null,
): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  const base = `Path=/; SameSite=Lax${secure}`;
  if (organizationId) {
    document.cookie = `tensorlane.organization=${encodeURIComponent(organizationId)}; ${base}`;
  }
  if (workspaceId) {
    document.cookie = `tensorlane.workspace=${encodeURIComponent(workspaceId)}; ${base}`;
  }
}
