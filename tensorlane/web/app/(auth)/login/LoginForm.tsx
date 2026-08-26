"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { safeNext } from "@/lib/mlflow";

type Providers = {
  google: boolean;
  github: boolean;
  microsoft: boolean;
};

function LoginFormInner({ providers }: { providers: Providers }) {
  const router = useRouter();
  const search = useSearchParams();
  const next = safeNext(search.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    try {
      const policy = await api<{ required: boolean; message?: string }>(
        `/api/v1/auth/sso-policy?email=${encodeURIComponent(email)}`,
      );
      if (policy.required) {
        setMessage(policy.message ?? "Your organization requires SSO.");
        return;
      }
    } catch {
      // Policy lookup is advisory; continue with password if the control plane is down.
    }
    const result = await authClient.signIn.email({ email, password });
    if (result.error) {
      setMessage(result.error.message ?? "Sign in failed.");
      return;
    }
    router.replace(next);
  }

  return (
    <div className="auth-card">
      <p className="kicker">Sign in</p>
      <h1>Welcome back</h1>
      <p className="lede">Use your Tensorlane account. Social login appears when configured.</p>
      {message ? <div className="banner danger">{message}</div> : null}
      <form onSubmit={(event) => void onSubmit(event)}>
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
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={10}
            required
          />
        </label>
        <button className="btn" type="submit">
          Continue
        </button>
      </form>
      <div className="stack" style={{ marginTop: 16 }}>
        {providers.google ? (
          <button type="button" className="btn secondary" onClick={() => void authClient.signIn.social({ provider: "google" })}>
            Continue with Google
          </button>
        ) : null}
        {providers.github ? (
          <button type="button" className="btn secondary" onClick={() => void authClient.signIn.social({ provider: "github" })}>
            Continue with GitHub
          </button>
        ) : null}
        {providers.microsoft ? (
          <button
            type="button"
            className="btn secondary"
            onClick={() => void authClient.signIn.social({ provider: "microsoft" })}
          >
            Continue with Microsoft
          </button>
        ) : null}
      </div>
      <p className="lede" style={{ marginTop: 24 }}>
        New here? <Link href={next === "/overview" ? "/signup" : `/signup?next=${encodeURIComponent(next)}`}>Create an account</Link>
      </p>
    </div>
  );
}

export function LoginForm({ providers }: { providers: Providers }) {
  return (
    <Suspense fallback={<p className="lede">Loading…</p>}>
      <LoginFormInner providers={providers} />
    </Suspense>
  );
}
