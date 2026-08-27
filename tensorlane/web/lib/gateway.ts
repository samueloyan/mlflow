import { mlflowCall, type MlflowResult } from "@/lib/mlflow";
import type { TrackingContext } from "@/lib/tracking";

export type GatewaySecret = {
  secret_id?: string;
  secret_name?: string;
  masked_values?: Record<string, string>;
  provider?: string;
  auth_config?: Record<string, string>;
  created_at?: number;
  last_updated_at?: number;
  created_by?: string;
};

export type GatewayModelDefinition = {
  model_definition_id?: string;
  name?: string;
  secret_id?: string;
  secret_name?: string;
  provider?: string;
  model_name?: string;
  created_at?: number;
  endpoint_count?: number;
};

export type GatewayEndpointMapping = {
  mapping_id?: string;
  model_definition_id?: string;
  model_definition?: GatewayModelDefinition;
  linkage_type?: string;
  weight?: number;
  fallback_order?: number;
};

export type GatewayEndpoint = {
  endpoint_id?: string;
  name?: string;
  model_mappings?: GatewayEndpointMapping[];
  created_at?: number;
  last_updated_at?: number;
  created_by?: string;
  routing_strategy?: string;
  usage_tracking?: boolean;
  experiment_id?: string;
};

export type GatewayProviderField = {
  name?: string;
  type?: string;
  description?: string;
  required?: boolean;
};

export type GatewayAuthMode = {
  mode?: string;
  display_name?: string;
  description?: string;
  secret_fields?: GatewayProviderField[];
  config_fields?: GatewayProviderField[];
};

export type GatewayProviderConfig = {
  auth_modes?: GatewayAuthMode[];
  default_mode?: string;
};

export type GatewayProviderModel = {
  model?: string;
  provider?: string;
  supports_function_calling?: boolean;
  supports_vision?: boolean;
};

export type ProviderOption = {
  id: string;
  name: string;
  description: string;
};

export type BudgetDuration = {
  unit?: string;
  value?: number;
};

export type BudgetPolicy = {
  budget_policy_id?: string;
  budget_unit?: string;
  budget_amount?: number;
  duration?: BudgetDuration;
  target_scope?: string;
  budget_action?: string;
  created_at?: number;
  created_by?: string;
};

export type BudgetWindow = {
  budget_policy_id?: string;
  window_start_ms?: number;
  window_end_ms?: number;
  current_spend?: number;
};

export type GatewayGuardrail = {
  guardrail_id?: string;
  name?: string;
  stage?: string;
  action?: string;
  created_at?: number;
  created_by?: string;
  scorer?: { scorer_id?: string; scorer_version?: number };
};

function ctxInit(ctx: TrackingContext, init?: RequestInit): RequestInit & TrackingContext {
  return { ...init, organizationId: ctx.organizationId, workspaceId: ctx.workspaceId };
}

export const FEATURED_PROVIDERS: readonly ProviderOption[] = [
  { id: "openai", name: "OpenAI", description: "GPT models via chat, completions, and embeddings." },
  { id: "anthropic", name: "Anthropic", description: "Claude models for traces, judges, and serving." },
  { id: "gemini", name: "Google Gemini", description: "Gemini models on Google AI Studio." },
  { id: "bedrock", name: "AWS Bedrock", description: "Bedrock model traffic with API keys or IAM." },
  { id: "azure", name: "Azure OpenAI", description: "Azure-hosted OpenAI-compatible models." },
  { id: "groq", name: "Groq", description: "Low-latency open-weight chat models." },
  { id: "mistral", name: "Mistral", description: "Mistral cloud chat and embeddings." },
  { id: "deepseek", name: "DeepSeek", description: "DeepSeek chat models." },
  { id: "openrouter", name: "OpenRouter", description: "One key for many upstream model providers." },
  { id: "ollama", name: "Ollama", description: "Local or self-hosted models. Set the API base URL." },
  { id: "xai", name: "xAI", description: "Grok models." },
  { id: "together_ai", name: "Together AI", description: "Hosted open-weight chat models." },
];

export const DEFAULT_MODELS: Record<string, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-sonnet-4-5",
  gemini: "gemini-2.0-flash",
  bedrock: "anthropic.claude-sonnet-4-5-v1:0",
  azure: "gpt-4o-mini",
  groq: "llama-3.3-70b-versatile",
  mistral: "mistral-small-latest",
  deepseek: "deepseek-chat",
  openrouter: "openai/gpt-4o-mini",
  ollama: "llama3.1",
  xai: "grok-2",
  together_ai: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
};

export function providerLabel(provider: string | undefined): string {
  const featured = FEATURED_PROVIDERS.find((row) => row.id === provider);
  if (featured) return featured.name;
  if (!provider) return "Provider";
  return provider.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function extraProviders(ids: string[] | undefined): ProviderOption[] {
  const featured = new Set(FEATURED_PROVIDERS.map((row) => row.id));
  return (ids ?? [])
    .filter((id) => id && !featured.has(id))
    .map((id) => ({
      id,
      name: providerLabel(id),
      description: "Listed by the tracking server provider catalog.",
    }));
}

export function endpointModel(endpoint: GatewayEndpoint): { provider: string; model: string } {
  const mapping =
    endpoint.model_mappings?.find((row) => (row.linkage_type ?? "PRIMARY") === "PRIMARY") ??
    endpoint.model_mappings?.[0];
  return {
    provider: mapping?.model_definition?.provider ?? "",
    model: mapping?.model_definition?.model_name ?? "",
  };
}

export function slugGatewayName(value: string): string {
  return value
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function gatewayInvokePath(endpointName: string): string {
  return `/gateway/${encodeURIComponent(endpointName)}/invocations`;
}

export function gatewayChatCompletionsPath(): string {
  return "/gateway/v1/chat/completions";
}

export function gatewayOpenaiBasePath(): string {
  return "/gateway/openai/v1";
}

export function gatewayAnthropicMessagesPath(): string {
  return "/gateway/anthropic/v1/messages";
}

export function gatewayGeminiGeneratePath(endpointName: string): string {
  return `/gateway/gemini/v1beta/models/${encodeURIComponent(endpointName)}:generateContent`;
}

export async function listGatewaySecrets(
  ctx: TrackingContext,
  provider?: string,
): Promise<MlflowResult<{ secrets?: GatewaySecret[] }>> {
  const params = new URLSearchParams();
  if (provider) params.set("provider", provider);
  const query = params.toString();
  return mlflowCall(`/ajax-api/3.0/mlflow/gateway/secrets/list${query ? `?${query}` : ""}`, {
    ...ctxInit(ctx),
    method: "GET",
  });
}

export async function listGatewayEndpoints(
  ctx: TrackingContext,
): Promise<MlflowResult<{ endpoints?: GatewayEndpoint[] }>> {
  return mlflowCall("/ajax-api/3.0/mlflow/gateway/endpoints/list", {
    ...ctxInit(ctx),
    method: "GET",
  });
}

export async function listGatewayModelDefinitions(
  ctx: TrackingContext,
): Promise<MlflowResult<{ model_definitions?: GatewayModelDefinition[] }>> {
  return mlflowCall("/ajax-api/3.0/mlflow/gateway/model-definitions/list", {
    ...ctxInit(ctx),
    method: "GET",
  });
}

export async function listSupportedProviders(
  ctx: TrackingContext,
): Promise<MlflowResult<{ providers?: string[] }>> {
  return mlflowCall("/ajax-api/3.0/mlflow/gateway/supported-providers", {
    ...ctxInit(ctx),
    method: "GET",
  });
}

export async function listSupportedModels(
  ctx: TrackingContext,
  provider?: string,
): Promise<MlflowResult<{ models?: GatewayProviderModel[] }>> {
  const params = new URLSearchParams();
  if (provider) params.set("provider", provider);
  const query = params.toString();
  return mlflowCall(`/ajax-api/3.0/mlflow/gateway/supported-models${query ? `?${query}` : ""}`, {
    ...ctxInit(ctx),
    method: "GET",
  });
}

export async function getProviderConfig(
  ctx: TrackingContext,
  provider: string,
): Promise<MlflowResult<GatewayProviderConfig>> {
  const params = new URLSearchParams({ provider });
  return mlflowCall(`/ajax-api/3.0/mlflow/gateway/provider-config?${params.toString()}`, {
    ...ctxInit(ctx),
    method: "GET",
  });
}

export async function getSecretsConfig(
  ctx: TrackingContext,
): Promise<MlflowResult<{ secrets_available?: boolean; using_default_passphrase?: boolean }>> {
  return mlflowCall("/ajax-api/3.0/mlflow/gateway/secrets/config", {
    ...ctxInit(ctx),
    method: "GET",
  });
}

export async function createGatewaySecret(
  ctx: TrackingContext,
  payload: {
    secret_name: string;
    secret_value: Record<string, string>;
    provider: string;
    auth_config?: Record<string, string>;
    created_by?: string;
  },
): Promise<MlflowResult<{ secret?: GatewaySecret }>> {
  return mlflowCall("/ajax-api/3.0/mlflow/gateway/secrets/create", {
    ...ctxInit(ctx),
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateGatewaySecret(
  ctx: TrackingContext,
  payload: {
    secret_id: string;
    secret_value?: Record<string, string>;
    auth_config?: Record<string, string>;
    updated_by?: string;
  },
): Promise<MlflowResult<{ secret?: GatewaySecret }>> {
  return mlflowCall("/ajax-api/3.0/mlflow/gateway/secrets/update", {
    ...ctxInit(ctx),
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteGatewaySecret(
  ctx: TrackingContext,
  secretId: string,
): Promise<MlflowResult<Record<string, never>>> {
  return mlflowCall("/ajax-api/3.0/mlflow/gateway/secrets/delete", {
    ...ctxInit(ctx),
    method: "DELETE",
    body: JSON.stringify({ secret_id: secretId }),
  });
}

export async function createGatewayModelDefinition(
  ctx: TrackingContext,
  payload: {
    name: string;
    secret_id: string;
    provider: string;
    model_name: string;
    created_by?: string;
  },
): Promise<MlflowResult<{ model_definition?: GatewayModelDefinition }>> {
  return mlflowCall("/ajax-api/3.0/mlflow/gateway/model-definitions/create", {
    ...ctxInit(ctx),
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createGatewayEndpoint(
  ctx: TrackingContext,
  payload: {
    name: string;
    model_configs: {
      model_definition_id: string;
      linkage_type: string;
      weight?: number;
      fallback_order?: number;
    }[];
    created_by?: string;
    usage_tracking?: boolean;
    fallback_config?: { strategy: string; max_attempts: number };
  },
): Promise<MlflowResult<{ endpoint?: GatewayEndpoint }>> {
  return mlflowCall("/ajax-api/3.0/mlflow/gateway/endpoints/create", {
    ...ctxInit(ctx),
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteGatewayEndpoint(
  ctx: TrackingContext,
  endpointId: string,
): Promise<MlflowResult<Record<string, never>>> {
  return mlflowCall("/ajax-api/3.0/mlflow/gateway/endpoints/delete", {
    ...ctxInit(ctx),
    method: "DELETE",
    body: JSON.stringify({ endpoint_id: endpointId }),
  });
}

export async function listBudgetPolicies(
  ctx: TrackingContext,
): Promise<MlflowResult<{ budget_policies?: BudgetPolicy[] }>> {
  return mlflowCall("/ajax-api/3.0/mlflow/gateway/budgets/list?max_results=100", {
    ...ctxInit(ctx),
    method: "GET",
  });
}

export async function listBudgetWindows(
  ctx: TrackingContext,
): Promise<MlflowResult<{ windows?: BudgetWindow[] }>> {
  return mlflowCall("/ajax-api/3.0/mlflow/gateway/budgets/windows", {
    ...ctxInit(ctx),
    method: "GET",
  });
}

export async function createBudgetPolicy(
  ctx: TrackingContext,
  payload: {
    budget_unit: string;
    budget_amount: number;
    duration: { unit: string; value: number };
    target_scope: string;
    budget_action: string;
    created_by?: string;
  },
): Promise<MlflowResult<{ budget_policy?: BudgetPolicy }>> {
  return mlflowCall("/ajax-api/3.0/mlflow/gateway/budgets/create", {
    ...ctxInit(ctx),
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteBudgetPolicy(
  ctx: TrackingContext,
  budgetPolicyId: string,
): Promise<MlflowResult<Record<string, never>>> {
  return mlflowCall("/ajax-api/3.0/mlflow/gateway/budgets/delete", {
    ...ctxInit(ctx),
    method: "DELETE",
    body: JSON.stringify({ budget_policy_id: budgetPolicyId }),
  });
}

export async function listGatewayGuardrails(
  ctx: TrackingContext,
): Promise<MlflowResult<{ guardrails?: GatewayGuardrail[] }>> {
  return mlflowCall("/ajax-api/3.0/mlflow/gateway/guardrails/list?max_results=100", {
    ...ctxInit(ctx),
    method: "GET",
  });
}

export async function deleteGatewayGuardrail(
  ctx: TrackingContext,
  guardrailId: string,
): Promise<MlflowResult<Record<string, never>>> {
  return mlflowCall("/ajax-api/3.0/mlflow/gateway/guardrails/delete", {
    ...ctxInit(ctx),
    method: "DELETE",
    body: JSON.stringify({ guardrail_id: guardrailId }),
  });
}

export async function addGuardrailToEndpoint(
  ctx: TrackingContext,
  payload: { endpoint_id: string; guardrail_id: string; execution_order?: number },
): Promise<MlflowResult<{ config?: unknown }>> {
  return mlflowCall("/ajax-api/3.0/mlflow/gateway/guardrails/add-to-endpoint", {
    ...ctxInit(ctx),
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function invokeGatewayChat(
  ctx: TrackingContext,
  endpointName: string,
  prompt: string,
): Promise<MlflowResult<Record<string, unknown>>> {
  return mlflowCall(gatewayInvokePath(endpointName), {
    ...ctxInit(ctx),
    method: "POST",
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      stream: false,
    }),
  });
}

export function extractChatText(payload: Record<string, unknown>): string {
  const choices = payload.choices;
  if (Array.isArray(choices) && choices[0] && typeof choices[0] === "object") {
    const choice = choices[0] as { message?: { content?: unknown }; text?: unknown };
    if (typeof choice.message?.content === "string") return choice.message.content;
    if (typeof choice.text === "string") return choice.text;
  }
  const content = payload.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts = content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .filter(Boolean);
    if (parts.length) return parts.join("\n");
  }
  return JSON.stringify(payload, null, 2);
}

export function sdkSnippet(trackingUri: string, endpointName: string): string {
  return `import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["TENSORLANE_API_KEY"],
    base_url="${trackingUri}${gatewayOpenaiBasePath()}",
)
print(client.chat.completions.create(
    model="${endpointName}",
    messages=[{"role": "user", "content": "Hello"}],
).choices[0].message.content)

# Native invoke:
# POST ${trackingUri}${gatewayInvokePath(endpointName)}
# Chat completions: ${trackingUri}${gatewayChatCompletionsPath()}
# Anthropic: POST ${trackingUri}${gatewayAnthropicMessagesPath()}
# Gemini: POST ${trackingUri}${gatewayGeminiGeneratePath(endpointName)}`;
}
