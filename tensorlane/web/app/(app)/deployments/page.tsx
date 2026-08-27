"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { EmptyState, PageHeader } from "@/components/PageHeader";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { Drawer } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FormField } from "@/components/ui/FormField";
import { useToast } from "@/components/ui/Toast";
import { formatEpoch } from "@/lib/format";
import {
  DEFAULT_MODELS,
  createGatewayEndpoint,
  createGatewayModelDefinition,
  deleteGatewayEndpoint,
  endpointModel,
  gatewayChatCompletionsPath,
  gatewayInvokePath,
  invokeGatewayChat,
  listGatewayEndpoints,
  listGatewaySecrets,
  providerLabel,
  sdkSnippet,
  type GatewayEndpoint,
  type GatewaySecret,
} from "@/lib/gateway";
import { canWrite } from "@/lib/permissions";
import { usePublicTrackingUri } from "@/lib/usePublicTrackingUri";
import { useShell } from "@/lib/shell";
import { useTrackingContext } from "@/lib/useTrackingContext";

export default function DeploymentsPage() {
  const { me, role } = useShell();
  const ctx = useTrackingContext();
  const toast = useToast();
  const tracking = usePublicTrackingUri();
  const canManage = canWrite(role);
  const [endpoints, setEndpoints] = useState<GatewayEndpoint[]>([]);
  const [secrets, setSecrets] = useState<GatewaySecret[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("support-chat");
  const [secretId, setSecretId] = useState("");
  const [modelName, setModelName] = useState("gpt-4o-mini");
  const [saving, setSaving] = useState(false);
  const [trying, setTrying] = useState<GatewayEndpoint | null>(null);
  const [prompt, setPrompt] = useState("Say hello in one sentence.");
  const [reply, setReply] = useState<string | null>(null);
  const [tryError, setTryError] = useState<string | null>(null);
  const [invoking, setInvoking] = useState(false);

  const selectedSecret = secrets.find((secret) => secret.secret_id === secretId);

  async function refresh() {
    if (!ctx) return;
    setLoading(true);
    const [listed, keys] = await Promise.all([listGatewayEndpoints(ctx), listGatewaySecrets(ctx)]);
    if (!listed.ok) {
      setError(listed.message);
      setEndpoints([]);
      setLoading(false);
      return;
    }
    setError(null);
    setEndpoints(listed.data.endpoints ?? []);
    setSecrets(keys.ok ? keys.data.secrets ?? [] : []);
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
  }, [ctx]);

  useEffect(() => {
    if (!secretId && secrets[0]?.secret_id) setSecretId(secrets[0].secret_id);
  }, [secrets, secretId]);

  useEffect(() => {
    if (!selectedSecret?.provider) return;
    const fallback = DEFAULT_MODELS[selectedSecret.provider];
    if (fallback) setModelName(fallback);
  }, [selectedSecret?.provider]);

  const snippet = useMemo(
    () => (trying?.name ? sdkSnippet(tracking, trying.name) : ""),
    [trying, tracking],
  );

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!ctx || !selectedSecret?.secret_id || !selectedSecret.provider) return;
    const endpointName = name.trim();
    if (!/^[A-Za-z0-9._-]+$/.test(endpointName)) {
      toast.push("Endpoint names can only contain letters, numbers, dots, underscores, and hyphens.", "error");
      return;
    }
    setSaving(true);
    const model = modelName.trim();
    const definition = await createGatewayModelDefinition(ctx, {
      name: `${endpointName}-${model}`.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 80),
      secret_id: selectedSecret.secret_id,
      provider: selectedSecret.provider,
      model_name: model,
      created_by: me.email,
    });
    if (!definition.ok || !definition.data.model_definition?.model_definition_id) {
      setSaving(false);
      toast.push(definition.ok ? "Could not create the model definition." : definition.message, "error");
      return;
    }
    const created = await createGatewayEndpoint(ctx, {
      name: endpointName,
      created_by: me.email,
      usage_tracking: true,
      model_configs: [
        {
          model_definition_id: definition.data.model_definition.model_definition_id,
          linkage_type: "PRIMARY",
        },
      ],
    });
    setSaving(false);
    if (!created.ok) {
      toast.push(created.message, "error");
      return;
    }
    toast.push("Endpoint created.", "success");
    setCreating(false);
    await refresh();
  }

  async function remove(endpoint: GatewayEndpoint) {
    if (!ctx || !endpoint.endpoint_id) return;
    if (!window.confirm(`Delete ${endpoint.name}? In-flight traffic to this route will fail.`)) return;
    const result = await deleteGatewayEndpoint(ctx, endpoint.endpoint_id);
    if (!result.ok) {
      toast.push(result.message, "error");
      return;
    }
    toast.push("Endpoint deleted.", "success");
    await refresh();
  }

  async function sendTry(event: React.FormEvent) {
    event.preventDefault();
    if (!ctx || !trying?.name) return;
    setInvoking(true);
    setTryError(null);
    setReply(null);
    const result = await invokeGatewayChat(ctx, trying.name, prompt);
    setInvoking(false);
    if (!result.ok) {
      setTryError(result.message);
      return;
    }
    const choice = (result.data.choices as { message?: { content?: string } }[] | undefined)?.[0];
    const content = choice?.message?.content;
    setReply(typeof content === "string" ? content : JSON.stringify(result.data, null, 2));
  }

  return (
    <div className="page">
      <PageHeader
        kicker="Operate"
        title="Deployments"
        lede="Named AI Gateway endpoints. The SDK calls this host; Tensorlane holds the provider key and traces the call."
      >
        {canManage ? (
          <button type="button" className="btn" onClick={() => setCreating(true)} disabled={!secrets.length}>
            + Create endpoint
          </button>
        ) : null}
      </PageHeader>
      {error ? <div className="banner danger">{error}</div> : null}
      {!loading && !secrets.length ? (
        <div className="banner warn">
          Connect an LLM provider on <Link href="/integrations">Integrations</Link> before creating an endpoint.
        </div>
      ) : null}
      <div className="card">
        {loading ? (
          <p className="lede">Loading endpoints…</p>
        ) : endpoints.length === 0 ? (
          <EmptyState
            title="No AI Gateway endpoints"
            body="Create an endpoint after connecting OpenAI, Anthropic, Gemini, Bedrock, or another provider. Traffic is traced into this workspace."
            action={
              <Link className="btn secondary" href="/tracking?hash=/gateway">
                Open workbench AI Gateway
              </Link>
            }
          />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Endpoint</th>
                <th>Provider</th>
                <th>Model</th>
                <th>Created</th>
                <th>Route</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {endpoints.map((endpoint) => {
                const model = endpointModel(endpoint);
                return (
                  <tr key={endpoint.endpoint_id ?? endpoint.name}>
                    <td>
                      <strong>{endpoint.name}</strong>
                    </td>
                    <td>
                      <StatusBadge label={providerLabel(model.provider) || "—"} tone="info" />
                    </td>
                    <td className="mono">{model.model || "—"}</td>
                    <td>{formatEpoch(endpoint.created_at)}</td>
                    <td className="mono">{endpoint.name ? gatewayInvokePath(endpoint.name) : "—"}</td>
                    <td>
                      {endpoint.name ? (
                        <button type="button" className="btn ghost" onClick={() => setTrying(endpoint)}>
                          Try
                        </button>
                      ) : null}
                      {canManage && endpoint.endpoint_id ? (
                        <button type="button" className="btn ghost" onClick={() => void remove(endpoint)}>
                          Delete
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {creating ? (
        <Drawer title="Create endpoint" onClose={() => setCreating(false)}>
          <form onSubmit={(event) => void create(event)}>
            <FormField label="Name" htmlFor="endpoint-name" description="Letters, numbers, dots, underscores, hyphens.">
              <input
                id="endpoint-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </FormField>
            <FormField label="Connection" htmlFor="endpoint-secret">
              <select id="endpoint-secret" value={secretId} onChange={(event) => setSecretId(event.target.value)}>
                {secrets.map((secret) => (
                  <option key={secret.secret_id} value={secret.secret_id}>
                    {secret.secret_name} ({providerLabel(secret.provider)})
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Model" htmlFor="endpoint-model">
              <input
                id="endpoint-model"
                value={modelName}
                onChange={(event) => setModelName(event.target.value)}
                required
              />
            </FormField>
            <button className="btn" type="submit" disabled={saving || !secretId}>
              {saving ? "Creating…" : "Create endpoint"}
            </button>
          </form>
        </Drawer>
      ) : null}
      {trying?.name ? (
        <Drawer title={trying.name} onClose={() => setTrying(null)}>
          <p className="lede">
            POST `{gatewayInvokePath(trying.name)}` with your Tensorlane API key. OpenAI-compatible clients can use{" "}
            `{gatewayChatCompletionsPath()}` and set `model` to this endpoint name.
          </p>
          <form onSubmit={(event) => void sendTry(event)}>
            <FormField label="Prompt" htmlFor="try-prompt">
              <textarea id="try-prompt" rows={4} value={prompt} onChange={(event) => setPrompt(event.target.value)} />
            </FormField>
            <button className="btn" type="submit" disabled={invoking}>
              {invoking ? "Calling…" : "Send"}
            </button>
          </form>
          {tryError ? <div className="banner danger">{tryError}</div> : null}
          {reply ? (
            <pre className="secret" style={{ marginTop: 16, whiteSpace: "pre-wrap" }}>
              {reply}
            </pre>
          ) : null}
          <div style={{ marginTop: 16 }}>
            <CodeBlock value={snippet} label="Copy SDK snippet" />
          </div>
          <p className="lede" style={{ marginTop: 16 }}>
            <Link href={`/tracking?hash=/gateway/endpoints/${encodeURIComponent(trying.endpoint_id ?? "")}`}>
              Open in workbench
            </Link>
          </p>
        </Drawer>
      ) : null}
    </div>
  );
}
