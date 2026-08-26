"use client";

import { useMemo } from "react";

import { useShell } from "@/lib/shell";
import type { TrackingContext } from "@/lib/tracking";

export function useTrackingContext(): TrackingContext | null {
  const { organization, workspace } = useShell();
  const organizationId = organization?.id ?? null;
  const workspaceId = workspace?.id ?? null;
  return useMemo(() => {
    if (!organizationId || !workspaceId) return null;
    return { organizationId, workspaceId };
  }, [organizationId, workspaceId]);
}
