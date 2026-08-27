"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Wordmark } from "@/components/Wordmark";
import { api, ApiError } from "@/lib/api";

type Preview = {
  organization_name: string;
  email: string;
  role: string;
  expired: boolean;
  accepted: boolean;
};

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = params.token;
  const [preview, setPreview] = useState<Preview | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void api<Preview>(`/api/v1/invitations/preview?token=${encodeURIComponent(token)}`)
      .then(setPreview)
      .catch(() => setMessage("This invitation is invalid or has been revoked."));
    void api("/api/v1/me")
      .then(() => setSignedIn(true))
      .catch(() => setSignedIn(false));
  }, [token]);

  async function accept() {
    setMessage(null);
    try {
      await api("/api/v1/invitations/accept", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      router.replace("/overview");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace(`/login?next=/invite/${token}`);
        return;
      }
      setMessage(err instanceof Error ? err.message : "Could not accept invitation.");
    }
  }

  const next = `/invite/${token}`;

  return (
    <div className="auth-shell">
      <div className="auth-story">
        <Wordmark />
        <div>
          <p className="kicker">Invitation</p>
          <h1>You were asked to join a Tensorlane organization.</h1>
        </div>
        <p className="lede">The Python SDK already speaks this host. Organizations stay on the Tensorlane control plane.</p>
      </div>
      <div className="auth-form">
        <div className="auth-card">
          <p className="kicker">Join</p>
          {preview ? (
            <>
              <h1>{preview.organization_name}</h1>
              <p className="lede">
                Invited as {preview.role} for {preview.email}.
              </p>
              {preview.expired ? <div className="banner danger">This invitation has expired.</div> : null}
              {preview.accepted ? <div className="banner">Already accepted.</div> : null}
              {message ? <div className="banner danger">{message}</div> : null}
              {signedIn ? (
                <button
                  type="button"
                  className="btn"
                  disabled={preview.expired || preview.accepted}
                  onClick={() => void accept()}
                >
                  Accept invitation
                </button>
              ) : (
                <div className="stack">
                  <Link className="btn" href={`/login?next=${encodeURIComponent(next)}`}>
                    Sign in to accept
                  </Link>
                  <Link className="btn secondary" href={`/signup?next=${encodeURIComponent(next)}`}>
                    Create an account
                  </Link>
                </div>
              )}
            </>
          ) : (
            <>
              <h1>Invitation</h1>
              {message ? <div className="banner danger">{message}</div> : <p className="lede">Looking up the invite…</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
