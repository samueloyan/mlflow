"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { type NavGroup, visibleExtraNav } from "@/lib/nav";
import { useShell } from "@/lib/shell";
import { canWrite } from "@/lib/permissions";

type Command = { id: string; label: string; hint?: string; run: () => void };

export function CommandPalette({
  open,
  onClose,
  navigation,
}: {
  open: boolean;
  onClose: () => void;
  navigation: NavGroup[];
}) {
  const router = useRouter();
  const { workspaces, setWorkspaceId, role, organization } = useShell();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const commands = useMemo<Command[]>(() => {
    const nav = navigation.flatMap((group) =>
      group.items.map((item) => ({
        id: item.href,
        label: `Go to ${item.label}`,
        hint: group.label,
        run: () => router.push(item.href),
      })),
    );
    const extras = visibleExtraNav(role, organization?.features).map((item) => ({
      id: item.href,
      label: `Go to ${item.label}`,
      hint: "More",
      run: () => router.push(item.href),
    }));
    const actions: Command[] = [
      {
        id: "create-experiment",
        label: "Create Experiment",
        hint: "Build",
        run: () => router.push("/experiments?new=1"),
      },
    ];
    if (canWrite(role)) {
      actions.push({
        id: "create-key",
        label: "Create API Key",
        hint: "Govern",
        run: () => router.push("/api-keys"),
      });
    }
    const switches = workspaces.map((workspace) => ({
      id: `ws-${workspace.id}`,
      label: `Switch workspace: ${workspace.name}`,
      hint: "Context",
      run: () => setWorkspaceId(workspace.id),
    }));
    const searches: Command[] = query.trim()
      ? [
          {
            id: "search-experiments",
            label: `Search experiments for “${query.trim()}”`,
            hint: "Search",
            run: () => router.push(`/experiments?q=${encodeURIComponent(query.trim())}`),
          },
          {
            id: "search-runs",
            label: `Search runs for “${query.trim()}”`,
            hint: "Search",
            run: () => router.push(`/runs?q=${encodeURIComponent(query.trim())}`),
          },
          {
            id: "search-traces",
            label: `Search traces for “${query.trim()}”`,
            hint: "Search",
            run: () => router.push(`/traces?q=${encodeURIComponent(query.trim())}`),
          },
          {
            id: "search-models",
            label: `Search models for “${query.trim()}”`,
            hint: "Search",
            run: () => router.push(`/models?q=${encodeURIComponent(query.trim())}`),
          },
        ]
      : [];
    return [...searches, ...nav, ...extras, ...actions, ...switches];
  }, [navigation, organization?.features, query, role, router, setWorkspaceId, workspaces]);

  const filtered = commands.filter((command) => {
    const hay = `${command.label} ${command.hint ?? ""}`.toLowerCase();
    return hay.includes(query.trim().toLowerCase());
  });

  useEffect(() => {
    setActive(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((value) => Math.min(filtered.length - 1, value + 1));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((value) => Math.max(0, value - 1));
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const command = filtered[active];
        if (command) {
          command.run();
          onClose();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, filtered, onClose, open]);

  if (!open) return null;

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette" onClick={(event) => event.stopPropagation()}>
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search Tensorlane..."
          aria-label="Command palette"
        />
        <div className="palette-list">
          {filtered.length === 0 ? (
            <p className="lede" style={{ padding: 12 }}>
              No matching commands.
            </p>
          ) : (
            filtered.slice(0, 20).map((command, index) => (
              <button
                key={command.id}
                type="button"
                className="palette-item"
                data-active={index === active}
                onMouseEnter={() => setActive(index)}
                onClick={() => {
                  command.run();
                  onClose();
                }}
              >
                <span>{command.label}</span>
                <span className="lede" style={{ margin: 0 }}>
                  {command.hint}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
