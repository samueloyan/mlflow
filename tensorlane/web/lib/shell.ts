"use client";

import { createContext, useContext } from "react";

import type { Me, Organization, Workspace } from "@/lib/api";

export type ShellState = {
  me: Me;
  organizations: Organization[];
  organization: Organization | null;
  workspaces: Workspace[];
  workspace: Workspace | null;
  setOrganizationId: (id: string) => void;
  setWorkspaceId: (id: string) => void;
};

export const ShellContext = createContext<ShellState | null>(null);

export function useShell(): ShellState {
  const value = useContext(ShellContext);
  if (!value) {
    throw new Error("useShell must be used within the app shell");
  }
  return value;
}
