"use client";

import { useEffect, useState } from "react";

import { api, type Member } from "@/lib/api";
import { useShell } from "@/lib/shell";

const ROLES = ["owner", "admin", "developer", "viewer", "billing"] as const;

export default function MembersPage() {
  const { me, organization } = useShell();
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("developer");
  const [message, setMessage] = useState<string | null>(null);
  const myRole = me.organizations.find((row) => row.id === organization?.id)?.role;
  const canManage = myRole === "owner" || myRole === "admin";

  async function refresh() {
    if (!organization) return;
    setMembers(await api<Member[]>(`/api/v1/organizations/${organization.id}/members`));
  }

  useEffect(() => {
    void refresh();
  }, [organization]);

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    if (!organization) return;
    setMessage(null);
    try {
      await api(`/api/v1/organizations/${organization.id}/members`, {
        method: "POST",
        body: JSON.stringify({ email, role }),
      });
      setEmail("");
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not add member.");
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

  return (
    <div className="page">
      <p className="kicker">Access</p>
      <h1>Members</h1>
      <p className="lede">
        Every member of the organization can use every workspace. Roles still apply. Per-workspace
        grants arrive in a later phase.
      </p>
      {message ? <div className="banner danger">{message}</div> : null}
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
        </div>
        {canManage ? (
          <form className="card span-4" onSubmit={(event) => void invite(event)}>
            <p className="kicker">Add member</p>
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
              <select value={role} onChange={(event) => setRole(event.target.value)}>
                <option value="admin">Admin</option>
                <option value="developer">Developer</option>
                <option value="viewer">Viewer</option>
                <option value="billing">Billing</option>
              </select>
            </label>
            <button className="btn" type="submit">
              Add
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
