import { mlflowCall, type MlflowResult } from "@/lib/mlflow";
import type { TrackingContext } from "@/lib/tracking";

export type WebhookEvent = {
  entity: string;
  action: string;
};

export type RegistryWebhook = {
  webhook_id?: string;
  name?: string;
  url?: string;
  events?: WebhookEvent[];
  status?: string;
  creation_timestamp?: string | number;
  last_updated_timestamp?: string | number;
  description?: string;
};

export const WEBHOOK_EVENTS: { entity: string; action: string; label: string }[] = [
  { entity: "REGISTERED_MODEL", action: "CREATED", label: "Registered model created" },
  { entity: "MODEL_VERSION", action: "CREATED", label: "Model version created" },
  { entity: "MODEL_VERSION_TAG", action: "SET", label: "Model version tag set" },
  { entity: "MODEL_VERSION_TAG", action: "DELETED", label: "Model version tag deleted" },
  { entity: "MODEL_VERSION_ALIAS", action: "CREATED", label: "Model version alias created" },
  { entity: "MODEL_VERSION_ALIAS", action: "DELETED", label: "Model version alias deleted" },
  { entity: "PROMPT", action: "CREATED", label: "Prompt created" },
  { entity: "PROMPT_VERSION", action: "CREATED", label: "Prompt version created" },
  { entity: "PROMPT_TAG", action: "SET", label: "Prompt tag set" },
  { entity: "PROMPT_TAG", action: "DELETED", label: "Prompt tag deleted" },
  { entity: "PROMPT_VERSION_TAG", action: "SET", label: "Prompt version tag set" },
  { entity: "PROMPT_VERSION_TAG", action: "DELETED", label: "Prompt version tag deleted" },
  { entity: "PROMPT_ALIAS", action: "CREATED", label: "Prompt alias created" },
  { entity: "PROMPT_ALIAS", action: "DELETED", label: "Prompt alias deleted" },
  { entity: "BUDGET_POLICY", action: "EXCEEDED", label: "Budget policy exceeded" },
];

function ctxInit(ctx: TrackingContext, init?: RequestInit): RequestInit & TrackingContext {
  return { ...init, organizationId: ctx.organizationId, workspaceId: ctx.workspaceId };
}

export function eventKey(event: WebhookEvent): string {
  return `${event.entity}.${event.action}`;
}

export async function listWebhooks(
  ctx: TrackingContext,
): Promise<MlflowResult<{ webhooks?: RegistryWebhook[] }>> {
  return mlflowCall("/ajax-api/2.0/mlflow/webhooks", {
    ...ctxInit(ctx),
    method: "GET",
  });
}

export async function createWebhook(
  ctx: TrackingContext,
  payload: {
    name: string;
    url: string;
    events: WebhookEvent[];
    description?: string;
    secret?: string;
    status: "ACTIVE" | "DISABLED";
  },
): Promise<MlflowResult<RegistryWebhook>> {
  return mlflowCall("/ajax-api/2.0/mlflow/webhooks", {
    ...ctxInit(ctx),
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteWebhook(
  ctx: TrackingContext,
  webhookId: string,
): Promise<MlflowResult<Record<string, never>>> {
  return mlflowCall(`/ajax-api/2.0/mlflow/webhooks/${encodeURIComponent(webhookId)}`, {
    ...ctxInit(ctx),
    method: "DELETE",
  });
}

export async function testWebhook(
  ctx: TrackingContext,
  webhookId: string,
): Promise<MlflowResult<{ result?: { success?: boolean; response_status?: number; error_message?: string } }>> {
  return mlflowCall(`/ajax-api/2.0/mlflow/webhooks/${encodeURIComponent(webhookId)}/test`, {
    ...ctxInit(ctx),
    method: "POST",
    body: JSON.stringify({}),
  });
}
