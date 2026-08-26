"use client";

import { useEffect, useState } from "react";

import { PageHeader, PlanGate } from "@/components/PageHeader";
import { api } from "@/lib/api";
import { useShell } from "@/lib/shell";

type SsoState = {
  enforced: boolean;
  domain: string | null;
  connections: { id: string; protocol: string; issuer: string; client_id: string; status: string }[];
};

type ScimToken = {
  id: string;
  name: string;
  token_prefix: string;
  created_at: string | null;
  revoked_at: string | null;
};

export default function SecurityPage() {
  const { organization, role, refresh } = useShell();
  const [sso, setSso] = useState<SsoState | null>(null);
  const [tokens, setTokens] = useState<ScimToken[]>([]);
  const [secret, setSecret] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [issuer, setIssuer] = useState("https://login.example.com");
  const [clientId, setClientId] = useState("");
  const [domain, setDomain] = useState(organization?.sso_domain ?? "");
  const canManage = role === "owner" || role === "admin";

  async function load() {
    if (!organization) return;
    setMessage(null);
    try {
      setSso(await api<SsoState>(`/api/v1/organizations/${organization.id}/sso`));
      setTokens(await api<ScimToken[]>(`/api/v1/organizations/${organization.id}/scim/tokens`));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "SSO and SCIM require the Enterprise plan.");
    }
  }

  useEffect(() => {
    void load();
  }, [organization]);

  async function saveSso(event: React.FormEvent) {
    event.preventDefault();
    if (!organization) return;
    try {
      await api(`/api/v1/organizations/${organization.id}/sso`, {
        method: "POST",
        body: JSON.stringify({ protocol: "oidc", issuer, client_id: clientId }),
      });
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save SSO.");
    }
  }

  async function mintScim() {
    if (!organization) return;
    try {
      const created = await api<{ token: string }>(`/api/v1/organizations/${organization.id}/scim/tokens`, {
        method: "POST",
        body: JSON.stringify({ name: "IdP" }),
      });
      setSecret(created.token);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not mint a SCIM token.");
    }
  }

  async function enforce(next: boolean) {
    if (!organization) return;
    try {
      await api(`/api/v1/organizations/${organization.id}`, {
        method: "PATCH",
        body: JSON.stringify({ sso_enforced: next }),
      });
      refresh();
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not update enforcement.");
    }
  }

  return (
    <div className="page">
      <PageHeader
        kicker="Manage"
        title="Security"
        lede="Tensorlane owns organizations. Better Auth signs people in. Enterprise SSO and SCIM attach here — not via a vendor organization plugin."
      />
      {message && !organization?.features?.sso ? (
        <PlanGate body="SSO and SCIM are Enterprise. Domain enforcement and IdP provisioning attach here — Tensorlane still owns the organization." />
      ) : null}
      {message && organization?.features?.sso ? <div className="banner danger">{message}</div> : null}
      {secret ? (
        <div className="banner warn">
          Copy this SCIM token now. It cannot be recovered.
          <pre className="secret" style={{ marginTop: 12 }}>
            {secret}
          </pre>
        </div>
      ) : null}
      <div className="grid">
        <div className="card span-8">
          <p className="kicker">SSO</p>
          <p className="lede">
            Domain {organization?.sso_domain || "not set"} · enforced{" "}
            {organization?.sso_enforced ? "yes" : "no"}
          </p>
          <table className="data">
            <thead>
              <tr>
                <th>Protocol</th>
                <th>Issuer</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sso?.connections.map((row) => (
                <tr key={row.id}>
                  <td>{row.protocol}</td>
                  <td>{row.issuer}</td>
                  <td>{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {canManage ? (
          <form className="card span-4" onSubmit={(event) => void saveSso(event)}>
            <p className="kicker">OIDC connection</p>
            <label className="field">
              <span>Issuer</span>
              <input value={issuer} onChange={(event) => setIssuer(event.target.value)} required />
            </label>
            <label className="field">
              <span>Client ID</span>
              <input value={clientId} onChange={(event) => setClientId(event.target.value)} required />
            </label>
            <button className="btn" type="submit">
              Save connection
            </button>
            <label className="field" style={{ marginTop: 16 }}>
              <span>SSO domain</span>
              <input
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
                placeholder="acme.com"
              />
            </label>
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                if (!organization) return;
                void api(`/api/v1/organizations/${organization.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ sso_domain: domain || null }),
                }).then(() => {
                  refresh();
                  void load();
                });
              }}
            >
              Save domain
            </button>
            <button
              type="button"
              className="btn secondary"
              style={{ marginTop: 8 }}
              onClick={() => void enforce(!(organization?.sso_enforced ?? false))}
            >
              {organization?.sso_enforced ? "Disable enforcement" : "Require SSO"}
            </button>
          </form>
        ) : null}
        <div className="card span-8">
          <p className="kicker">SCIM tokens</p>
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Prefix</th>
                <th>Created</th>
                {canManage ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {tokens.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{row.token_prefix}</td>
                  <td>{row.created_at}</td>
                  {canManage ? (
                    <td>
                      {row.revoked_at ? (
                        "revoked"
                      ) : (
                        <button
                          type="button"
                          className="btn danger"
                          onClick={() => {
                            if (!organization) return;
                            void api(`/api/v1/organizations/${organization.id}/scim/tokens/${row.id}`, {
                              method: "DELETE",
                            }).then(() => load());
                          }}
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {canManage ? (
          <div className="card span-4">
            <p className="kicker">Provisioning</p>
            <p className="lede">Point your IdP at `/scim/v2` on this host with a bearer token.</p>
            <button type="button" className="btn" onClick={() => void mintScim()}>
              Mint SCIM token
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
