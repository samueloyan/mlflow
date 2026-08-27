"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { CodeBlock } from "@/components/ui/CodeBlock";
import { api, type Organization } from "@/lib/api";
import { pythonSdkSnippet } from "@/lib/brand";
import { usePublicTrackingUri } from "@/lib/usePublicTrackingUri";

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [workspace, setWorkspace] = useState("Production");
  const [message, setMessage] = useState<string | null>(null);
  const tracking = usePublicTrackingUri();

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    try {
      const org = await api<Organization>("/api/v1/organizations", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      await api("/api/v1/workspaces", {
        method: "POST",
        body: JSON.stringify({ name: workspace, organization_id: org.id }),
      });
      window.localStorage.setItem("tensorlane.org", org.id);
      router.replace("/overview");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not create organization.");
    }
  }

  return (
    <div className="page">
      <p className="kicker">Start</p>
      <h1>Create your organization</h1>
      <p className="lede">
        An organization is the billing and membership root. A workspace is the isolation
        boundary your SDK traffic binds to.
      </p>
      {message ? <div className="banner danger">{message}</div> : null}
      <form className="card span-6" style={{ maxWidth: 480 }} onSubmit={(event) => void create(event)}>
        <label className="field">
          <span>Organization name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label className="field">
          <span>First workspace</span>
          <input value={workspace} onChange={(event) => setWorkspace(event.target.value)} required />
        </label>
        <button className="btn" type="submit">
          Continue
        </button>
      </form>
      <div className="card" style={{ maxWidth: 640, marginTop: 24 }}>
        <p className="kicker">Python SDK</p>
        <CodeBlock value={pythonSdkSnippet(tracking)} label="Copy snippet" />
      </div>
    </div>
  );
}
