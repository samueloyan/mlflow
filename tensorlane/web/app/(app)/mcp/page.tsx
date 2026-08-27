"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { EmptyState, PageHeader } from "@/components/PageHeader";
import { ErrorState } from "@/components/ui/EmptyState";
import { FormField } from "@/components/ui/FormField";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { trackingUiHref } from "@/lib/brand";
import { formatEpoch } from "@/lib/format";
import { canWrite } from "@/lib/permissions";
import { useShell } from "@/lib/shell";
import { createMcpServer, searchMcpServers, type McpServer } from "@/lib/tracking";
import { useTrackingContext } from "@/lib/useTrackingContext";

export default function McpPage() {
  const router = useRouter();
  const { role } = useShell();
  const ctx = useTrackingContext();
  const toast = useToast();
  const writable = canWrite(role);
  const [rows, setRows] = useState<McpServer[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!ctx) return;
    setLoading(true);
    const result = await searchMcpServers(ctx);
    if (!result.ok) {
      setError(result.message);
      setRows([]);
      setLoading(false);
      return;
    }
    setError(null);
    setRows(result.data.mcp_servers ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [ctx]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => {
      const hay = `${row.name ?? ""} ${row.display_name ?? ""} ${row.description ?? ""} ${row.status ?? ""}`;
      return hay.toLowerCase().includes(needle);
    });
  }, [query, rows]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!ctx) return;
    setSaving(true);
    const result = await createMcpServer(ctx, { name: name.trim(), description: description.trim() || undefined });
    setSaving(false);
    if (!result.ok) {
      toast.push(result.message, "error");
      return;
    }
    toast.push("MCP server registered.", "success");
    setCreating(false);
    setName("");
    setDescription("");
    await load();
  }

  return (
    <div className="page">
      <PageHeader
        kicker="AI"
        title="MCP"
        lede="Register Model Context Protocol servers for this workspace. Versions and access endpoints stay on the same tracking host."
      >
        {writable ? (
          <button type="button" className="btn" onClick={() => setCreating(true)}>
            Register server
          </button>
        ) : null}
      </PageHeader>
      <div className="card">
        <label className="field">
          <span>Search</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Server name" />
        </label>
        {error ? (
          <ErrorState title="Unable to load MCP servers" body={error} onRetry={() => void load()} />
        ) : loading ? (
          <p className="lede">Loading MCP registry…</p>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No MCP servers yet"
            body="Register a server here, or publish one from the SDK. Versions and tools stay in this workspace."
          />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Server</th>
                <th>Status</th>
                <th>Latest version</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr
                  key={row.name ?? row.display_name}
                  data-clickable="true"
                  onClick={() => {
                    if (row.name) router.push(trackingUiHref(`/mcp-registry/${encodeURIComponent(row.name)}`));
                  }}
                >
                  <td>
                    <strong>{row.display_name || row.name}</strong>
                    {row.description ? <p className="lede" style={{ margin: 0 }}>{row.description}</p> : null}
                  </td>
                  <td>
                    <StatusBadge
                      label={row.status ?? "unknown"}
                      tone={row.status === "active" ? "success" : row.status === "deprecated" ? "warning" : "neutral"}
                    />
                  </td>
                  <td className="mono">{row.latest_version ?? "—"}</td>
                  <td>{formatEpoch(row.last_updated_timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {creating ? (
        <Modal
          title="Register MCP server"
          onClose={() => setCreating(false)}
          footer={
            <>
              <button type="button" className="btn secondary" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button type="submit" form="create-mcp" className="btn" disabled={saving || !name.trim()}>
                {saving ? "Saving…" : "Register"}
              </button>
            </>
          }
        >
          <form id="create-mcp" onSubmit={(event) => void create(event)}>
            <FormField label="Name" htmlFor="mcp-name" description="A workspace-unique name, like io.company.tools">
              <input id="mcp-name" value={name} onChange={(event) => setName(event.target.value)} required />
            </FormField>
            <FormField label="Description" htmlFor="mcp-description">
              <textarea
                id="mcp-description"
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </FormField>
          </form>
        </Modal>
      ) : null}
      <p className="lede" style={{ marginTop: 16 }}>
        <Link href={trackingUiHref("/mcp-registry")}>Open version and endpoint details</Link>
      </p>
    </div>
  );
}
