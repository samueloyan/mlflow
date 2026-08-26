"use client";

import { useEffect, useState } from "react";

import { api, type Invitation, type Member } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useShell } from "@/lib/shell";
import { CopyButton } from "@/components/CopyButton";
import { PageHeader } from "@/components/PageHeader";

const ROLES = ["owner", "admin", "developer", "viewer", "billing"] as const;

export default function MembersPage() {
  const { me, organization, role } = useShell();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("developer");
  const [message, setMessage] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const myRole = role ?? me.organizations.find((row) => row.id === organization?.id)?.role;
  const canManage = myRole === "owner" || myRole === "admin";

  async function refresh() {
    if (!organization) return;
    setMembers(await api<Member[]>(`/api/v1/organizations/${organization.id}/members`));
    setInvites(await api<Invitation[]>(`/api/v1/organizations/${organization.id}/invitations`));
  }

  useEffect(() => {
    void refresh();
  }, [organization]);

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    if (!organization) return;
    setMessage(null);
    setInviteUrl(null);
    try {
      const created = await api<Invitation>(`/api/v1/organizations/${organization.id}/invitations`, {
        method: "POST",
        body: JSON.stringify({ email, role: inviteRole }),
      });
      setEmail("");
      setInviteUrl(created.invite_url ?? null);
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not send invitation.");
    }
  }

  async function changeRole(userId: string, nextRole: string) {
    if (!organization) return;
    setMessage(null);
    try {
      await api(`/api/v1/organizations/${organization.id}/members/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ role: nextRole }),
      });
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not update role.");
    }
  }

  async function remove(userId: string) {
    if (!organization) return;
    setMessage(null);
    try {
      await api(`/api/v1/organizations/${organization.id}/members/${userId}`, {
        method: "DELETE",
      });
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not remove member.");
    }
  }

  async function revoke(id: string) {
    if (!organization) return;
    await api(`/api/v1/organizations/${organization.id}/invitations/${id}`, { method: "DELETE" });
    await refresh();
  }

  async function resend(id: string) {
    if (!organization) return;
    setMessage(null);
    try {
      const created = await api<Invitation>(
        `/api/v1/organizations/${organization.id}/invitations/${id}/resend`,
        { method: "POST" },
      );
      setInviteUrl(created.invite_url ?? null);
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not resend invitation.");
    }
  }

  const openInvites = invites.filter((row) => !row.accepted_at && !row.revoked_at);

  return (
    <div className="page">
      <PageHeader
        kicker="Access"
        title="Members"
        lede={
          organization?.workspace_acl === "restricted"
            ? "This organization uses restricted workspace grants. Owners and admins still see every workspace."
            : "Every member of the organization can use every workspace unless you switch ACL to restricted in Settings."
        }
      />
      {organization?.limits?.members ? (
        <p className="lede">
          {members.length} of {organization.limits.members} seats on the {organization.plan} plan.
        </p>
      ) : null}
      {message ? <div className="banner danger">{message}</div> : null}
      {inviteUrl ? (
        <div className="banner warn">
          Invitation created. Share this link if mail is not configured.
          <pre className="secret" style={{ marginTop: 12 }}>
            {inviteUrl}
          </pre>
          <div className="page-actions" style={{ marginTop: 12 }}>
            <CopyButton value={inviteUrl} label="Copy invite link" />
          </div>
        </div>
      ) : null}
      <div className="grid">
        <div className="card span-8">
          <table className="data">
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                {canManage ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.user_id}>
                  <td>{member.email}</td>
                  <td>
                    {canManage ? (
                      <select
                        className="quiet"
                        value={member.role}
                        aria-label={`Role for ${member.email}`}
                        onChange={(event) => void changeRole(member.user_id, event.target.value)}
                      >
                        {ROLES.filter((value) => myRole === "owner" || value !== "owner").map(
                          (value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ),
                        )}
                      </select>
                    ) : (
                      member.role
                    )}
                  </td>
                  {canManage ? (
                    <td>
                      <button type="button" className="btn danger" onClick={() => void remove(member.user_id)}>
                        Remove
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          {openInvites.length ? (
            <>
              <p className="kicker" style={{ marginTop: 24 }}>
                Pending invitations
              </p>
              <table className="data">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Expires</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {openInvites.map((invite) => (
                    <tr key={invite.id}>
                      <td>{invite.email}</td>
                      <td>{invite.role}</td>
                      <td>{formatDate(invite.expires_at)}</td>
                      <td>
                        {canManage ? (
                          <div className="page-actions">
                            <button type="button" className="btn secondary" onClick={() => void resend(invite.id)}>
                              Resend
                            </button>
                            <button type="button" className="btn danger" onClick={() => void revoke(invite.id)}>
                              Revoke
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}
        </div>
        {canManage ? (
          <form className="card span-4" onSubmit={(event) => void invite(event)}>
            <p className="kicker">Invite</p>
            <p className="lede">They do not need an account yet. We email a fourteen-day link.</p>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>Role</span>
              <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}>
                <option value="admin">Admin</option>
                <option value="developer">Developer</option>
                <option value="viewer">Viewer</option>
                <option value="billing">Billing</option>
              </select>
            </label>
            <button className="btn" type="submit">
              Send invitation
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
