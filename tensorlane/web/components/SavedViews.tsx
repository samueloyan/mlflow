"use client";

import { useEffect, useState } from "react";

import { api, type SavedView } from "@/lib/api";
import { useShell } from "@/lib/shell";

export function SavedViews({
  surface,
  query,
  onApply,
}: {
  surface: string;
  query?: Record<string, unknown>;
  onApply?: (query: Record<string, unknown>) => void;
}) {
  const { organization, workspace, me } = useShell();
  const [views, setViews] = useState<SavedView[]>([]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    if (!organization) return;
    setViews(await api<SavedView[]>(`/api/v1/organizations/${organization.id}/views`));
  }

  useEffect(() => {
    void refresh();
  }, [organization]);

  const mine = views.filter((view) => view.surface === surface);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!organization) return;
    setMessage(null);
    try {
      await api(`/api/v1/organizations/${organization.id}/views`, {
        method: "POST",
        body: JSON.stringify({
          name,
          surface,
          workspace_id: workspace?.id ?? null,
          query: query ?? { q: "" },
        }),
      });
      setName("");
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save view.");
    }
  }

  async function remove(id: string) {
    if (!organization) return;
    await api(`/api/v1/organizations/${organization.id}/views/${id}`, { method: "DELETE" });
    await refresh();
  }

  return (
    <div className="card span-4">
      <p className="kicker">Saved views</p>
      {message ? <div className="banner danger">{message}</div> : null}
      {mine.length === 0 ? <p className="lede">Pin the current filter set for this surface.</p> : null}
      <ul className="plain-list">
        {mine.map((view) => (
          <li key={view.id}>
            {onApply ? (
              <button type="button" className="btn secondary" onClick={() => onApply(view.query)}>
                {view.name}
              </button>
            ) : (
              view.name
            )}{" "}
            {view.owner_user_id === me.id ? (
              <button type="button" className="btn danger" onClick={() => void remove(view.id)}>
                Remove
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <form onSubmit={(event) => void save(event)}>
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <button className="btn secondary" type="submit">
          Save view
        </button>
      </form>
    </div>
  );
}
