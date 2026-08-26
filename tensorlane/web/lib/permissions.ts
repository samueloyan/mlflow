export function canWrite(role: string | null): boolean {
  return role === "owner" || role === "admin" || role === "developer";
}

export function canAdmin(role: string | null): boolean {
  return role === "owner" || role === "admin";
}

export function canManageBilling(role: string | null): boolean {
  return role === "owner" || role === "billing";
}

export function canManageKeys(role: string | null): boolean {
  return canWrite(role);
}
