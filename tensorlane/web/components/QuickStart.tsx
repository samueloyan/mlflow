"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { api, type ApiKey, type Member } from "@/lib/api";
import { listGatewaySecrets } from "@/lib/gateway";
import { useShell } from "@/lib/shell";
import { useTrackingContext } from "@/lib/useTrackingContext";

type Step = {
  id: string;
  label: string;
  href: string;
  done: boolean;
};

export function QuickStart({ hasRun }: { hasRun: boolean }) {
  const { organization, workspace } = useShell();
  const ctx = useTrackingContext();
  const [keys, setKeys] = useState(0);
  const [members, setMembers] = useState(1);
  const [connections, setConnections] = useState(0);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!organization) return;
    const storageKey = `tensorlane.quickstart.dismissed.${organization.id}`;
    setDismissed(window.localStorage.getItem(storageKey) === "1");
    void api<ApiKey[]>(`/api/v1/api-keys?organization_id=${organization.id}`)
      .then((rows) => setKeys(rows.length))
      .catch(() => setKeys(0));
    void api<Member[]>(`/api/v1/organizations/${organization.id}/members`)
      .then((rows) => setMembers(rows.length))
      .catch(() => setMembers(1));
  }, [organization]);

  useEffect(() => {
    if (!ctx) return;
    void listGatewaySecrets(ctx).then((result) => {
      setConnections(result.ok ? (result.data.secrets ?? []).length : 0);
    });
  }, [ctx]);

  const steps = useMemo<Step[]>(
    () => [
      { id: "org", label: "Create organization", href: "/onboarding", done: Boolean(organization) },
      { id: "workspace", label: "Create workspace", href: "/workspaces", done: Boolean(workspace) },
      { id: "key", label: "Create API key", href: "/api-keys", done: keys > 0 },
      { id: "sdk", label: "Point the SDK at this workspace", href: "/onboarding", done: hasRun || keys > 0 },
      { id: "run", label: "Log first run", href: "/runs", done: hasRun },
      { id: "llm", label: "Connect an LLM provider", href: "/integrations", done: connections > 0 },
      { id: "invite", label: "Invite teammate", href: "/members", done: members > 1 },
    ],
    [connections, hasRun, keys, members, organization, workspace],
  );

  const remaining = steps.filter((step) => !step.done).length;
  if (!organization || dismissed) return null;

  return (
    <div className="card span-12">
      <div className="page-header" style={{ marginBottom: 12 }}>
        <div>
          <p className="kicker">Quick Start</p>
          <h2>Get tracking data into this workspace</h2>
        </div>
        {remaining === 0 ? (
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              window.localStorage.setItem(`tensorlane.quickstart.dismissed.${organization.id}`, "1");
              setDismissed(true);
            }}
          >
            Dismiss
          </button>
        ) : null}
      </div>
      <ol className="checklist">
        {steps.map((step) => (
          <li key={step.id}>
            <span className="mark" data-done={step.done} aria-hidden="true">
              {step.done ? "✓" : ""}
            </span>
            {step.done ? (
              <span>{step.label}</span>
            ) : (
              <Link href={step.href}>{step.label}</Link>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
