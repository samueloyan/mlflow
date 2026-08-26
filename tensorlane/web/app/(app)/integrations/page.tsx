"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/PageHeader";
import { Drawer } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FormField } from "@/components/ui/FormField";
import { useToast } from "@/components/ui/Toast";
import { formatEpoch } from "@/lib/format";
import {
  FEATURED_PROVIDERS,
  createGatewaySecret,
  deleteGatewaySecret,
  getProviderConfig,
  getSecretsConfig,
  listGatewaySecrets,
  providerLabel,
  type GatewayAuthMode,
  type GatewaySecret,
} from "@/lib/gateway";
import { canWrite } from "@/lib/permissions";
import { useShell } from "@/lib/shell";
import { useTrackingContext } from "@/lib/useTrackingContext";

const OTHER_INTEGRATIONS = [
  {
    category: "Notifications",
    name: "Webhook",
    description: "HTTPS callbacks when an alert rule fires.",
    href: "/alerts",
    live: true,
  },
  {
    category: "Notifications",
    name: "Slack",
    description: "Alert delivery to a Slack channel.",
    live: false,
  },
  {
    category: "Notifications",
    name: "PagerDuty",
    description: "On-call escalation for firing alerts.",
    live: false,
  },
  {
    category: "Cloud",
    name: "AWS / GCS / Azure Blob",
    description: "Artifact storage is configured on the tracking server, not as a dashboard connector.",
    live: false,
  },
  {
    category: "Development",
    name: "GitHub / GitLab",
    description: "Source tags come from the MLflow SDK in CI. There is no OAuth app yet.",
    live: false,
  },
];

function fallbackAuthMode(): GatewayAuthMode {
  return {
    mode: "api_key",
    display_name: "API Key",
    secret_fields: [{ name: "api_key", description: "API key", required: true }],
    config_fields: [{ name: "api_base", description: "Optional API base URL", required: false }],
  };
}

export default function IntegrationsPage() {
  const { me, role } = useShell();
  const ctx = useTrackingContext();
  const toast = useToast();
  const canManage = canWrite(role);
  const [secrets, setSecrets] = useState<GatewaySecret[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [defaultKek, setDefaultKek] = useState(false);
  const [selected, setSelected] = useState<(typeof FEATURED_PROVIDERS)[number] | null>(null);
  const [authMode, setAuthMode] = useState<GatewayAuthMode>(fallbackAuthMode());
  const [secretName, setSecretName] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function refresh() {
    if (!ctx) return;
    setLoading(true);
    const [listed, config] = await Promise.all([listGatewaySecrets(ctx), getSecretsConfig(ctx)]);
    if (!listed.ok) {
      setError(listed.message);
      setSecrets([]);
      setLoading(false);
      return;
    }
    setError(null);
    setSecrets(listed.data.secrets ?? []);
    setDefaultKek(Boolean(config.ok && config.data.using_default_passphrase));
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
  }, [ctx]);

  useEffect(() => {
    if (!selected || !ctx) return;
    setSecretName(`${selected.id}-${me.email.split("@")[0] || "prod"}`);
    setFields({});
    void getProviderConfig(ctx, selected.id).then((result) => {
      const modes = result.ok ? result.data.auth_modes ?? [] : [];
      const preferred =
        modes.find((mode) => mode.mode === result.data.default_mode) ?? modes[0] ?? fallbackAuthMode();
      setAuthMode(preferred);
    });
  }, [selected, ctx, me.email]);

  const byProvider = useMemo(() => {
    const grouped = new Map<string, GatewaySecret[]>();
    for (const secret of secrets) {
      const key = secret.provider || "other";
      grouped.set(key, [...(grouped.get(key) ?? []), secret]);
    }
    return grouped;
  }, [secrets]);

  async function connect(event: React.FormEvent) {
    event.preventDefault();
    if (!ctx || !selected) return;
    const secretValue: Record<string, string> = {};
    const authConfig: Record<string, string> = {};
    for (const field of authMode.secret_fields ?? []) {
      if (!field.name) continue;
      const value = (fields[field.name] ?? "").trim();
      if (field.required && !value) {
        toast.push(`${field.description || field.name} is required.`, "error");
        return;
      }
      if (value) secretValue[field.name] = value;
    }
    for (const field of authMode.config_fields ?? []) {
      if (!field.name) continue;
      const value = (fields[field.name] ?? "").trim();
      if (field.required && !value) {
        toast.push(`${field.description || field.name} is required.`, "error");
        return;
      }
      if (value) authConfig[field.name] = value;
    }
    setSaving(true);
    const created = await createGatewaySecret(ctx, {
      secret_name: secretName.trim(),
      secret_value: secretValue,
      provider: selected.id,
      auth_config: Object.keys(authConfig).length ? authConfig : undefined,
      created_by: me.email,
    });
    setSaving(false);
    if (!created.ok) {
      toast.push(created.message, "error");
      return;
    }
    toast.push(`${selected.name} connected.`, "success");
    setSelected(null);
    await refresh();
  }

  async function remove(secret: GatewaySecret) {
    if (!ctx || !secret.secret_id) return;
    if (!window.confirm(`Disconnect ${secret.secret_name}? Endpoints that use this key will stop working.`)) {
      return;
    }
    const result = await deleteGatewaySecret(ctx, secret.secret_id);
    if (!result.ok) {
      toast.push(result.message, "error");
      return;
    }
    toast.push("Connection removed.", "success");
    await refresh();
  }

  return (
    <div className="page">
      <PageHeader
        kicker="Govern"
        title="Integrations"
        lede="LLM provider keys are stored encrypted in this workspace and used by the AI Gateway. Alert webhooks live on Alerts."
      />
      {error ? <div className="banner danger">{error}</div> : null}
      {defaultKek ? (
        <div className="banner warn">
          Provider keys are encrypted with MLflow&apos;s development passphrase. Set `MLFLOW_CRYPTO_KEK_PASSPHRASE` on
          the tracking server before storing production keys.
        </div>
      ) : null}
      <section style={{ marginBottom: 24 }}>
        <p className="kicker">AI Providers</p>
        <div className="grid">
          {FEATURED_PROVIDERS.map((provider) => {
            const connected = byProvider.get(provider.id) ?? [];
            return (
              <div className="card span-4" key={provider.id}>
                <h2>{provider.name}</h2>
                <p className="lede">{provider.description}</p>
                <StatusBadge
                  label={connected.length ? `${connected.length} connected` : loading ? "Loading" : "Not connected"}
                  tone={connected.length ? "success" : "neutral"}
                />
                {connected.length ? (
                  <ul className="lede" style={{ marginTop: 12, paddingLeft: 18 }}>
                    {connected.map((secret) => (
                      <li key={secret.secret_id}>
                        {secret.secret_name}
                        {secret.masked_values?.api_key ? ` · ${secret.masked_values.api_key}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {canManage ? (
                  <div style={{ marginTop: 12 }}>
                    <button type="button" className="btn secondary" onClick={() => setSelected(provider)}>
                      {connected.length ? "Manage" : "Connect"}
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
      {[...new Set(OTHER_INTEGRATIONS.map((item) => item.category))].map((category) => (
        <section key={category} style={{ marginBottom: 24 }}>
          <p className="kicker">{category}</p>
          <div className="grid">
            {OTHER_INTEGRATIONS.filter((item) => item.category === category).map((item) => (
              <div className="card span-4" key={item.name}>
                <h2>{item.name}</h2>
                <p className="lede">{item.description}</p>
                <StatusBadge label={item.live ? "Available" : "Not shipped"} tone={item.live ? "success" : "neutral"} />
                <div style={{ marginTop: 12 }}>
                  {item.href ? (
                    <Link className="btn secondary" href={item.href}>
                      Configure
                    </Link>
                  ) : (
                    <p className="lede">There is no connector API for this yet.</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      {selected ? (
        <Drawer title={selected.name} onClose={() => setSelected(null)}>
          <p className="lede">{selected.description}</p>
          {(byProvider.get(selected.id) ?? []).map((secret) => (
            <div className="card" key={secret.secret_id} style={{ marginBottom: 12 }}>
              <p>
                <strong>{secret.secret_name}</strong>
              </p>
              <p className="lede">
                Added {formatEpoch(secret.created_at)}
                {secret.created_by ? ` by ${secret.created_by}` : ""}
              </p>
              {canManage ? (
                <button type="button" className="btn ghost" onClick={() => void remove(secret)}>
                  Disconnect
                </button>
              ) : null}
            </div>
          ))}
          {canManage ? (
            <form onSubmit={(event) => void connect(event)}>
              <p className="kicker">New connection</p>
              <FormField label="Name" htmlFor="secret-name">
                <input
                  id="secret-name"
                  value={secretName}
                  onChange={(event) => setSecretName(event.target.value)}
                  required
                />
              </FormField>
              {(authMode.secret_fields ?? []).map((field) => (
                <FormField key={field.name} label={field.description || field.name || "Secret"} htmlFor={field.name}>
                  <input
                    id={field.name}
                    type="password"
                    autoComplete="off"
                    required={field.required}
                    value={fields[field.name ?? ""] ?? ""}
                    onChange={(event) =>
                      setFields((current) => ({ ...current, [field.name ?? ""]: event.target.value }))
                    }
                  />
                </FormField>
              ))}
              {(authMode.config_fields ?? []).map((field) => (
                <FormField key={field.name} label={field.description || field.name || "Config"} htmlFor={field.name}>
                  <input
                    id={field.name}
                    required={field.required}
                    value={fields[field.name ?? ""] ?? ""}
                    onChange={(event) =>
                      setFields((current) => ({ ...current, [field.name ?? ""]: event.target.value }))
                    }
                  />
                </FormField>
              ))}
              <button className="btn" type="submit" disabled={saving}>
                {saving ? "Saving…" : `Connect ${providerLabel(selected.id)}`}
              </button>
            </form>
          ) : (
            <p className="lede">Owners, admins, and developers can add provider keys.</p>
          )}
        </Drawer>
      ) : null}
    </div>
  );
}
