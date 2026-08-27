"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { EmptyState, PageHeader } from "@/components/PageHeader";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { ErrorState } from "@/components/ui/EmptyState";
import { FormField } from "@/components/ui/FormField";
import { useToast } from "@/components/ui/Toast";
import {
  extractChatText,
  invokeGatewayChat,
  listGatewayEndpoints,
  sdkSnippet,
  type GatewayEndpoint,
} from "@/lib/gateway";
import { canWrite } from "@/lib/permissions";
import { usePublicTrackingUri } from "@/lib/usePublicTrackingUri";
import { useShell } from "@/lib/shell";
import { useTrackingContext } from "@/lib/useTrackingContext";

export default function PlaygroundPage() {
  const { role } = useShell();
  const ctx = useTrackingContext();
  const toast = useToast();
  const tracking = usePublicTrackingUri();
  const writable = canWrite(role);
  const [endpoints, setEndpoints] = useState<GatewayEndpoint[]>([]);
  const [endpoint, setEndpoint] = useState("");
  const [prompt, setPrompt] = useState("Say hello in one sentence.");
  const [reply, setReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  async function load() {
    if (!ctx) return;
    setLoading(true);
    const result = await listGatewayEndpoints(ctx);
    if (!result.ok) {
      setError(result.message);
      setEndpoints([]);
      setLoading(false);
      return;
    }
    const rows = result.data.endpoints ?? [];
    setError(null);
    setEndpoints(rows);
    setEndpoint((current) => current || rows[0]?.name || "");
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [ctx]);

  const selected = useMemo(
    () => endpoints.find((row) => row.name === endpoint) ?? null,
    [endpoint, endpoints],
  );

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!ctx || !endpoint) return;
    setSending(true);
    setReply(null);
    const result = await invokeGatewayChat(ctx, endpoint, prompt);
    setSending(false);
    if (!result.ok) {
      toast.push(result.message, "error");
      return;
    }
    setReply(extractChatText(result.data));
  }

  return (
    <div className="page">
      <PageHeader
        kicker="AI"
        title="Playground"
        lede="Chat against named endpoints in this workspace. Connect a provider on Integrations, then create an endpoint on Deployments."
      >
        <Link className="btn secondary" href="/deployments">
          Endpoints
        </Link>
      </PageHeader>
      {error ? <ErrorState title="Unable to load endpoints" body={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <p className="lede">Loading endpoints…</p>
      ) : endpoints.length === 0 ? (
        <EmptyState
          title="No endpoints yet"
          body="Create a provider connection, then a named endpoint. Playground invokes that endpoint in this workspace."
          action={
            <div style={{ display: "flex", gap: 8 }}>
              <Link className="btn" href="/integrations">
                Connect a provider
              </Link>
              <Link className="btn secondary" href="/deployments">
                Create an endpoint
              </Link>
            </div>
          }
        />
      ) : (
        <div className="grid">
          <form className="card span-8" onSubmit={(event) => void send(event)}>
            <FormField label="Endpoint" htmlFor="playground-endpoint">
              <select
                id="playground-endpoint"
                value={endpoint}
                onChange={(event) => setEndpoint(event.target.value)}
              >
                {endpoints.map((row) => (
                  <option key={row.endpoint_id ?? row.name} value={row.name ?? ""}>
                    {row.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Prompt" htmlFor="playground-prompt">
              <textarea
                id="playground-prompt"
                rows={6}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
              />
            </FormField>
            <button className="btn" type="submit" disabled={!writable || sending || !endpoint}>
              {sending ? "Invoking…" : "Send"}
            </button>
            {!writable ? <p className="lede">Viewers can inspect endpoints. Developers can invoke.</p> : null}
            {reply ? (
              <div style={{ marginTop: 16 }}>
                <p className="kicker">Response</p>
                <pre className="secret">{reply}</pre>
              </div>
            ) : null}
          </form>
          <div className="card span-4">
            <p className="kicker">SDK</p>
            <p className="lede">
              {selected?.name
                ? `Same endpoint as ${selected.name}. The OpenAI client talks to this host.`
                : "Pick an endpoint to see the client snippet."}
            </p>
            {selected?.name ? <CodeBlock value={sdkSnippet(tracking, selected.name)} label="Copy snippet" /> : null}
          </div>
        </div>
      )}
    </div>
  );
}
