"use client";

import { useEffect, useMemo, useState } from "react";

import { EmptyState } from "@/components/PageHeader";
import { ErrorState } from "@/components/ui/EmptyState";
import { FormField } from "@/components/ui/FormField";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { formatDate, formatEpoch } from "@/lib/format";
import { canWrite } from "@/lib/permissions";
import { useTrackingContext } from "@/lib/useTrackingContext";
import {
  WEBHOOK_EVENTS,
  createWebhook,
  deleteWebhook,
  eventKey,
  listWebhooks,
  testWebhook,
  type RegistryWebhook,
  type WebhookEvent,
} from "@/lib/webhooks";

export function RegistryWebhooks({ canManage }: { canManage: boolean }) {
  const ctx = useTrackingContext();
  const toast = useToast();
  const [rows, setRows] = useState<RegistryWebhook[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [events, setEvents] = useState<string[]>(["REGISTERED_MODEL.CREATED"]);
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!ctx) return;
    setLoading(true);
    const result = await listWebhooks(ctx);
    if (!result.ok) {
      setError(result.message);
      setRows([]);
      setLoading(false);
      return;
    }
    setError(null);
    setRows(result.data.webhooks ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [ctx]);

  const selectedEvents = useMemo((): WebhookEvent[] => {
    return WEBHOOK_EVENTS.filter((event) => events.includes(eventKey(event))).map((event) => ({
      entity: event.entity,
      action: event.action,
    }));
  }, [events]);

  async function create(form: React.FormEvent) {
    form.preventDefault();
    if (!ctx) return;
    if (!selectedEvents.length) {
      toast.push("Select at least one event.", "error");
      return;
    }
    setSaving(true);
    const result = await createWebhook(ctx, {
      name: name.trim(),
      url: url.trim(),
      events: selectedEvents,
      secret: secret.trim() || undefined,
      status: "ACTIVE",
    });
    setSaving(false);
    if (!result.ok) {
      toast.push(result.message, "error");
      return;
    }
    toast.push("Webhook created.", "success");
    setCreating(false);
    setName("");
    setUrl("");
    setSecret("");
    await load();
  }

  async function test(webhook: RegistryWebhook) {
    if (!ctx || !webhook.webhook_id) return;
    const result = await testWebhook(ctx, webhook.webhook_id);
    if (!result.ok) {
      toast.push(result.message, "error");
      return;
    }
    const ok = result.data.result?.success;
    toast.push(
      ok
        ? `Test delivered (${result.data.result?.response_status ?? "ok"}).`
        : result.data.result?.error_message || "Test failed.",
      ok ? "success" : "error",
    );
  }

  async function remove(webhook: RegistryWebhook) {
    if (!ctx || !webhook.webhook_id) return;
    if (!window.confirm(`Delete webhook ${webhook.name}?`)) return;
    const result = await deleteWebhook(ctx, webhook.webhook_id);
    if (!result.ok) {
      toast.push(result.message, "error");
      return;
    }
    toast.push("Webhook deleted.", "success");
    await load();
  }

  return (
    <section style={{ marginBottom: 24 }}>
      <div className="page-header" style={{ marginBottom: 12 }}>
        <div>
          <p className="kicker">Registry webhooks</p>
          <h2>Model and prompt events</h2>
        </div>
        {canManage ? (
          <button type="button" className="btn" onClick={() => setCreating(true)}>
            New webhook
          </button>
        ) : null}
      </div>
      <div className="card">
        {error ? (
          <ErrorState title="Unable to load webhooks" body={error} onRetry={() => void load()} />
        ) : loading ? (
          <p className="lede">Loading webhooks…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No registry webhooks"
            body="Deliver HTTPS callbacks when models, prompts, or budget policies change in this workspace."
          />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>URL</th>
                <th>Events</th>
                <th>Status</th>
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((webhook) => (
                <tr key={webhook.webhook_id ?? webhook.name}>
                  <td>{webhook.name}</td>
                  <td className="mono">{webhook.url}</td>
                  <td>{(webhook.events ?? []).map((event) => eventKey(event)).join(", ") || "—"}</td>
                  <td>
                    <StatusBadge
                      label={webhook.status ?? "ACTIVE"}
                      tone={(webhook.status ?? "ACTIVE") === "ACTIVE" ? "success" : "neutral"}
                    />
                  </td>
                  <td>
                    {typeof webhook.last_updated_timestamp === "string" && webhook.last_updated_timestamp.includes("-")
                      ? formatDate(webhook.last_updated_timestamp)
                      : formatEpoch(webhook.last_updated_timestamp)}
                  </td>
                  <td>
                    {canManage && webhook.webhook_id ? (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button type="button" className="btn ghost" onClick={() => void test(webhook)}>
                          Test
                        </button>
                        <button type="button" className="btn ghost" onClick={() => void remove(webhook)}>
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {creating ? (
        <Modal
          title="Create webhook"
          onClose={() => setCreating(false)}
          footer={
            <>
              <button type="button" className="btn secondary" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button type="submit" form="create-webhook" className="btn" disabled={saving || !name.trim() || !url.trim()}>
                {saving ? "Saving…" : "Create"}
              </button>
            </>
          }
        >
          <form id="create-webhook" onSubmit={(event) => void create(event)}>
            <FormField label="Name" htmlFor="webhook-name">
              <input id="webhook-name" value={name} onChange={(event) => setName(event.target.value)} required />
            </FormField>
            <FormField label="HTTPS URL" htmlFor="webhook-url">
              <input
                id="webhook-url"
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                required
              />
            </FormField>
            <FormField label="Signing secret" htmlFor="webhook-secret" description="Optional. Sent as a Standard Webhooks signature.">
              <input
                id="webhook-secret"
                type="password"
                autoComplete="off"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
              />
            </FormField>
            <fieldset className="field">
              <span>Events</span>
              {WEBHOOK_EVENTS.map((event) => {
                const key = eventKey(event);
                return (
                  <label key={key} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={events.includes(key)}
                      onChange={(change) => {
                        setEvents((current) =>
                          change.target.checked ? [...current, key] : current.filter((item) => item !== key),
                        );
                      }}
                    />
                    {event.label}
                  </label>
                );
              })}
            </fieldset>
          </form>
        </Modal>
      ) : null}
    </section>
  );
}
