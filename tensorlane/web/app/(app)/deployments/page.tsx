"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { EmptyState, PageHeader } from "@/components/PageHeader";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { Drawer } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FormField } from "@/components/ui/FormField";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { formatEpoch, formatUsd } from "@/lib/format";
import {
  DEFAULT_MODELS,
  addGuardrailToEndpoint,
  createBudgetPolicy,
  createGatewayEndpoint,
  createGatewayModelDefinition,
  deleteBudgetPolicy,
  deleteGatewayEndpoint,
  deleteGatewayGuardrail,
  endpointModel,
  gatewayAnthropicMessagesPath,
  gatewayChatCompletionsPath,
  gatewayGeminiGeneratePath,
  gatewayInvokePath,
  gatewayOpenaiBasePath,
  invokeGatewayChat,
  listBudgetPolicies,
  listBudgetWindows,
  listGatewayEndpoints,
  listGatewayGuardrails,
  listGatewaySecrets,
  listSupportedModels,
  providerLabel,
  sdkSnippet,
  slugGatewayName,
  type BudgetPolicy,
  type BudgetWindow,
  type GatewayEndpoint,
  type GatewayGuardrail,
  type GatewayProviderModel,
  type GatewaySecret,
} from "@/lib/gateway";
import { canWrite } from "@/lib/permissions";
import { usePublicTrackingUri } from "@/lib/usePublicTrackingUri";
import { useShell } from "@/lib/shell";
import { useTrackingContext } from "@/lib/useTrackingContext";

const TABS = [
  { id: "endpoints", label: "Endpoints" },
  { id: "budgets", label: "Budgets" },
  { id: "guardrails", label: "Guardrails" },
];

export default function DeploymentsPage() {
  const { me, role } = useShell();
  const ctx = useTrackingContext();
  const toast = useToast();
  const tracking = usePublicTrackingUri();
  const canManage = canWrite(role);
  const [tab, setTab] = useState("endpoints");
  const [endpoints, setEndpoints] = useState<GatewayEndpoint[]>([]);
  const [secrets, setSecrets] = useState<GatewaySecret[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("support-chat");
  const [secretId, setSecretId] = useState("");
  const [modelName, setModelName] = useState("gpt-4o-mini");
  const [fallbackModel, setFallbackModel] = useState("");
  const [catalog, setCatalog] = useState<GatewayProviderModel[]>([]);
  const [saving, setSaving] = useState(false);
  const [trying, setTrying] = useState<GatewayEndpoint | null>(null);
  const [prompt, setPrompt] = useState("Say hello in one sentence.");
  const [reply, setReply] = useState<string | null>(null);
  const [tryError, setTryError] = useState<string | null>(null);
  const [invoking, setInvoking] = useState(false);
  const [policies, setPolicies] = useState<BudgetPolicy[]>([]);
  const [windows, setWindows] = useState<BudgetWindow[]>([]);
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [budgetAmount, setBudgetAmount] = useState("50");
  const [budgetAction, setBudgetAction] = useState("ALERT");
  const [budgetDuration, setBudgetDuration] = useState("MONTHS");
  const [creatingBudget, setCreatingBudget] = useState(false);
  const [guardrails, setGuardrails] = useState<GatewayGuardrail[]>([]);
  const [guardrailError, setGuardrailError] = useState<string | null>(null);
  const [attachTo, setAttachTo] = useState<GatewayGuardrail | null>(null);
  const [attachEndpointId, setAttachEndpointId] = useState("");

  const selectedSecret = secrets.find((secret) => secret.secret_id === secretId);

  async function refresh() {
    if (!ctx) return;
    setLoading(true);
    const [listed, keys, budgetListed, budgetWindows, listedRails] = await Promise.all([
      listGatewayEndpoints(ctx),
      listGatewaySecrets(ctx),
      listBudgetPolicies(ctx),
      listBudgetWindows(ctx),
      listGatewayGuardrails(ctx),
    ]);
    if (!listed.ok) {
      setError(listed.message);
      setEndpoints([]);
      setLoading(false);
      return;
    }
    setError(null);
    setEndpoints(listed.data.endpoints ?? []);
    setSecrets(keys.ok ? keys.data.secrets ?? [] : []);
    if (budgetListed.ok) {
      setBudgetError(null);
      setPolicies(budgetListed.data.budget_policies ?? []);
      setWindows(budgetWindows.ok ? budgetWindows.data.windows ?? [] : []);
    } else {
      setPolicies([]);
      setWindows([]);
      setBudgetError(
        budgetListed.status === 404
          ? "This tracking server does not expose budget policies yet."
          : budgetListed.message,
      );
    }
    if (listedRails.ok) {
      setGuardrailError(null);
      setGuardrails(listedRails.data.guardrails ?? []);
    } else {
      setGuardrails([]);
      setGuardrailError(
        listedRails.status === 404
          ? "This tracking server does not expose guardrails yet."
          : listedRails.message,
      );
    }
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

  useEffect(() => {
    if (!ctx || !selectedSecret?.provider) {
      setCatalog([]);
      return;
    }
    void listSupportedModels(ctx, selectedSecret.provider).then((result) => {
      setCatalog(result.ok ? result.data.models ?? [] : []);
    });
  }, [ctx, selectedSecret?.provider]);

  const snippet = useMemo(
    () => (trying?.name ? sdkSnippet(tracking, trying.name) : ""),
    [trying, tracking],
  );

  const spendByPolicy = useMemo(() => {
    const map = new Map<string, number>();
    for (const window of windows) {
      if (!window.budget_policy_id) continue;
      map.set(window.budget_policy_id, (map.get(window.budget_policy_id) ?? 0) + (window.current_spend ?? 0));
    }
    return map;
  }, [windows]);

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
      name: slugGatewayName(`${endpointName}-${model}`),
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
    const modelConfigs: {
      model_definition_id: string;
      linkage_type: string;
      fallback_order?: number;
    }[] = [
      {
        model_definition_id: definition.data.model_definition.model_definition_id,
        linkage_type: "PRIMARY",
      },
    ];
    const fallback = fallbackModel.trim();
    if (fallback) {
      const fallbackDefinition = await createGatewayModelDefinition(ctx, {
        name: slugGatewayName(`${endpointName}-${fallback}-fallback`),
        secret_id: selectedSecret.secret_id,
        provider: selectedSecret.provider,
        model_name: fallback,
        created_by: me.email,
      });
      if (
        fallbackDefinition.ok &&
        fallbackDefinition.data.model_definition?.model_definition_id
      ) {
        modelConfigs.push({
          model_definition_id: fallbackDefinition.data.model_definition.model_definition_id,
          linkage_type: "FALLBACK",
          fallback_order: 0,
        });
      } else {
        setSaving(false);
        toast.push(
          fallbackDefinition.ok ? "Could not create the fallback model." : fallbackDefinition.message,
          "error",
        );
        return;
      }
    }
    const created = await createGatewayEndpoint(ctx, {
      name: endpointName,
      created_by: me.email,
      usage_tracking: true,
      fallback_config:
        modelConfigs.length > 1 ? { strategy: "SEQUENTIAL", max_attempts: 2 } : undefined,
      model_configs: modelConfigs,
    });
    setSaving(false);
    if (!created.ok) {
      toast.push(created.message, "error");
      return;
    }
    toast.push("Endpoint created.", "success");
    setCreating(false);
    setFallbackModel("");
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

  async function saveBudget(event: React.FormEvent) {
    event.preventDefault();
    if (!ctx) return;
    const amount = Number(budgetAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.push("Enter a positive USD amount.", "error");
      return;
    }
    setSaving(true);
    const created = await createBudgetPolicy(ctx, {
      budget_unit: "USD",
      budget_amount: amount,
      duration: { unit: budgetDuration, value: 1 },
      target_scope: "WORKSPACE",
      budget_action: budgetAction,
      created_by: me.email,
    });
    setSaving(false);
    if (!created.ok) {
      toast.push(created.message, "error");
      return;
    }
    toast.push("Budget policy created.", "success");
    setCreatingBudget(false);
    await refresh();
  }

  async function removeBudget(policy: BudgetPolicy) {
    if (!ctx || !policy.budget_policy_id) return;
    if (!window.confirm("Delete this budget policy?")) return;
    const result = await deleteBudgetPolicy(ctx, policy.budget_policy_id);
    if (!result.ok) {
      toast.push(result.message, "error");
      return;
    }
    toast.push("Budget policy deleted.", "success");
    await refresh();
  }

  async function removeGuardrail(rail: GatewayGuardrail) {
    if (!ctx || !rail.guardrail_id) return;
    if (!window.confirm(`Delete ${rail.name}?`)) return;
    const result = await deleteGatewayGuardrail(ctx, rail.guardrail_id);
    if (!result.ok) {
      toast.push(result.message, "error");
      return;
    }
    toast.push("Guardrail deleted.", "success");
    await refresh();
  }

  async function attach(event: React.FormEvent) {
    event.preventDefault();
    if (!ctx || !attachTo?.guardrail_id || !attachEndpointId) return;
    setSaving(true);
    const result = await addGuardrailToEndpoint(ctx, {
      endpoint_id: attachEndpointId,
      guardrail_id: attachTo.guardrail_id,
    });
    setSaving(false);
    if (!result.ok) {
      toast.push(result.message, "error");
      return;
    }
    toast.push("Guardrail attached.", "success");
    setAttachTo(null);
    await refresh();
  }

  return (
    <div className="page">
      <PageHeader
        kicker="Operate"
        title="Deployments"
        lede="Named LLM endpoints. Tensorlane holds the provider key, traces the call, and serves OpenAI, Anthropic, and Gemini-compatible routes."
      >
        {tab === "endpoints" && canManage ? (
          <button type="button" className="btn" onClick={() => setCreating(true)} disabled={!secrets.length}>
            + Create endpoint
          </button>
        ) : null}
        {tab === "budgets" && canManage && !budgetError ? (
          <button type="button" className="btn" onClick={() => setCreatingBudget(true)}>
            + Create budget
          </button>
        ) : null}
      </PageHeader>
      <Tabs items={TABS} value={tab} onChange={setTab} />
      {error ? <div className="banner danger">{error}</div> : null}
      {tab === "endpoints" ? (
        <>
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
                title="No LLM endpoints"
                body="Create an endpoint after connecting OpenAI, Anthropic, Gemini, Bedrock, or another provider. Traffic is traced into this workspace."
                action={
                  <Link className="btn secondary" href="/integrations">
                    Connect a provider
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
                    const fallbacks = (endpoint.model_mappings ?? []).filter(
                      (row) => row.linkage_type === "FALLBACK",
                    );
                    return (
                      <tr key={endpoint.endpoint_id ?? endpoint.name}>
                        <td>
                          <strong>{endpoint.name}</strong>
                          {endpoint.usage_tracking ? (
                            <p className="lede">Traces on</p>
                          ) : null}
                        </td>
                        <td>
                          <StatusBadge label={providerLabel(model.provider) || "—"} tone="info" />
                        </td>
                        <td className="mono">
                          {model.model || "—"}
                          {fallbacks.length
                            ? ` → ${fallbacks.map((row) => row.model_definition?.model_name).filter(Boolean).join(", ")}`
                            : ""}
                        </td>
                        <td>{formatEpoch(endpoint.created_at)}</td>
                        <td className="mono">{endpoint.name ? gatewayInvokePath(endpoint.name) : "—"}</td>
                        <td>
                          {endpoint.name ? (
                            <button type="button" className="btn ghost" onClick={() => setTrying(endpoint)}>
                              Try
                            </button>
                          ) : null}
                          {endpoint.experiment_id ? (
                            <Link className="btn ghost" href={`/experiments/${endpoint.experiment_id}`}>
                              Traces
                            </Link>
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
        </>
      ) : null}
      {tab === "budgets" ? (
        <div className="card">
          {budgetError ? (
            <p className="lede">{budgetError}</p>
          ) : loading ? (
            <p className="lede">Loading budgets…</p>
          ) : policies.length === 0 ? (
            <EmptyState
              title="No budget policies"
              body="Cap LLM spend for this workspace. Alert when a window is exceeded, or reject further traffic."
            />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Amount</th>
                  <th>Window</th>
                  <th>Action</th>
                  <th>Spend</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {policies.map((policy) => (
                  <tr key={policy.budget_policy_id}>
                    <td>{formatUsd(policy.budget_amount)}</td>
                    <td>
                      {policy.duration?.value ?? 1} {(policy.duration?.unit ?? "MONTHS").toLowerCase()}
                    </td>
                    <td>
                      <StatusBadge
                        label={policy.budget_action === "REJECT" ? "Reject" : "Alert"}
                        tone={policy.budget_action === "REJECT" ? "danger" : "info"}
                      />
                    </td>
                    <td>{formatUsd(spendByPolicy.get(policy.budget_policy_id ?? "") ?? 0)}</td>
                    <td>{formatEpoch(policy.created_at)}</td>
                    <td>
                      {canManage && policy.budget_policy_id ? (
                        <button type="button" className="btn ghost" onClick={() => void removeBudget(policy)}>
                          Delete
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
      {tab === "guardrails" ? (
        <div className="card">
          {guardrailError ? (
            <p className="lede">{guardrailError}</p>
          ) : loading ? (
            <p className="lede">Loading guardrails…</p>
          ) : guardrails.length === 0 ? (
            <EmptyState
              title="No guardrails"
              body="Guardrails wrap a registered judge or scorer and run before or after an endpoint call. Create the scorer in the tracking UI, then attach it here."
              action={
                <Link className="btn secondary" href="/tracking?hash=/gateway">
                  Open tracking UI
                </Link>
              }
            />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Stage</th>
                  <th>Action</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {guardrails.map((rail) => (
                  <tr key={rail.guardrail_id}>
                    <td>
                      <strong>{rail.name}</strong>
                    </td>
                    <td>{rail.stage || "—"}</td>
                    <td>{rail.action || "—"}</td>
                    <td>{formatEpoch(rail.created_at)}</td>
                    <td>
                      {canManage && endpoints.length ? (
                        <button type="button" className="btn ghost" onClick={() => setAttachTo(rail)}>
                          Attach
                        </button>
                      ) : null}
                      {canManage && rail.guardrail_id ? (
                        <button type="button" className="btn ghost" onClick={() => void removeGuardrail(rail)}>
                          Delete
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
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
                list="endpoint-model-options"
                value={modelName}
                onChange={(event) => setModelName(event.target.value)}
                required
              />
            </FormField>
            <datalist id="endpoint-model-options">
              {catalog.map((row) =>
                row.model ? (
                  <option key={row.model} value={row.model}>
                    {row.model}
                  </option>
                ) : null,
              )}
            </datalist>
            <FormField
              label="Fallback model"
              htmlFor="endpoint-fallback"
              description="Optional. Tried if the primary model fails, using the same connection."
            >
              <input
                id="endpoint-fallback"
                list="endpoint-model-options"
                value={fallbackModel}
                onChange={(event) => setFallbackModel(event.target.value)}
              />
            </FormField>
            <button className="btn" type="submit" disabled={saving || !secretId}>
              {saving ? "Creating…" : "Create endpoint"}
            </button>
          </form>
        </Drawer>
      ) : null}
      {creatingBudget ? (
        <Drawer title="Create budget" onClose={() => setCreatingBudget(false)}>
          <form onSubmit={(event) => void saveBudget(event)}>
            <FormField label="Amount (USD)" htmlFor="budget-amount">
              <input
                id="budget-amount"
                type="number"
                min="1"
                step="1"
                value={budgetAmount}
                onChange={(event) => setBudgetAmount(event.target.value)}
                required
              />
            </FormField>
            <FormField label="Window" htmlFor="budget-duration">
              <select
                id="budget-duration"
                value={budgetDuration}
                onChange={(event) => setBudgetDuration(event.target.value)}
              >
                <option value="DAYS">Daily</option>
                <option value="WEEKS">Weekly</option>
                <option value="MONTHS">Monthly</option>
              </select>
            </FormField>
            <FormField label="When exceeded" htmlFor="budget-action">
              <select
                id="budget-action"
                value={budgetAction}
                onChange={(event) => setBudgetAction(event.target.value)}
              >
                <option value="ALERT">Alert</option>
                <option value="REJECT">Reject traffic</option>
              </select>
            </FormField>
            <button className="btn" type="submit" disabled={saving}>
              {saving ? "Creating…" : "Create budget"}
            </button>
          </form>
        </Drawer>
      ) : null}
      {attachTo ? (
        <Drawer title={`Attach ${attachTo.name}`} onClose={() => setAttachTo(null)}>
          <form onSubmit={(event) => void attach(event)}>
            <FormField label="Endpoint" htmlFor="attach-endpoint">
              <select
                id="attach-endpoint"
                value={attachEndpointId}
                onChange={(event) => setAttachEndpointId(event.target.value)}
              >
                <option value="">Select an endpoint</option>
                {endpoints.map((endpoint) => (
                  <option key={endpoint.endpoint_id} value={endpoint.endpoint_id}>
                    {endpoint.name}
                  </option>
                ))}
              </select>
            </FormField>
            <button className="btn" type="submit" disabled={saving || !attachEndpointId}>
              {saving ? "Attaching…" : "Attach"}
            </button>
          </form>
        </Drawer>
      ) : null}
      {trying?.name ? (
        <Drawer title={trying.name} onClose={() => setTrying(null)}>
          <p className="lede">
            POST `{gatewayInvokePath(trying.name)}` with your Tensorlane API key. OpenAI-compatible clients can use{" "}
            `{gatewayOpenaiBasePath()}` or `{gatewayChatCompletionsPath()}` and set `model` to this endpoint name.
            Anthropic: `{gatewayAnthropicMessagesPath()}`. Gemini: `{gatewayGeminiGeneratePath(trying.name)}`.
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
        </Drawer>
      ) : null}
    </div>
  );
}
