"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    const result = await authClient.signUp.email({ name, email, password });
    if (result.error) {
      setMessage(result.error.message ?? "Sign up failed.");
      return;
    }
    router.replace("/onboarding");
  }

  return (
    <div className="auth-card">
      <p className="kicker">Create account</p>
      <h1>Join Tensorlane</h1>
      <p className="lede">Email and password. Google, GitHub, and Microsoft when the operator enables them.</p>
      {message ? <div className="banner danger">{message}</div> : null}
      <form onSubmit={(event) => void onSubmit(event)}>
        <label className="field">
          <span>Name</span>
          <input
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </label>
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
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={10}
            required
          />
        </label>
        <button className="btn" type="submit">
          Create account
        </button>
      </form>
      <p className="lede" style={{ marginTop: 24 }}>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </div>
  );
}
