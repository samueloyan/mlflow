"use client";

import { useShell } from "@/lib/shell";
import type { TrackingContext } from "@/lib/tracking";

export function useTrackingContext(): TrackingContext | null {
  const { organization, workspace } = useShell();
  if (!organization || !workspace) return null;
  return { organizationId: organization.id, workspaceId: workspace.id };
}
