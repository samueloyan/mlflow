"use client";

import { useState } from "react";

import { PageHeader } from "@/components/PageHeader";
import { Drawer } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";

const INTEGRATIONS = [
  { category: "AI Providers", name: "OpenAI", description: "LLM tracing and evaluation targets." },
  { category: "AI Providers", name: "Anthropic", description: "Claude traces via the MLflow SDK." },
  { category: "AI Providers", name: "Google", description: "Gemini and Vertex endpoints." },
  { category: "AI Providers", name: "AWS Bedrock", description: "Bedrock model traffic." },
  { category: "Cloud", name: "AWS", description: "Artifact storage and deploy targets." },
  { category: "Cloud", name: "Azure", description: "Blob storage and identity." },
  { category: "Cloud", name: "GCP", description: "GCS artifacts." },
  { category: "Development", name: "GitHub", description: "Source tags on runs." },
  { category: "Development", name: "GitLab", description: "Pipeline run metadata." },
  { category: "Notifications", name: "Slack", description: "Alert delivery." },
  { category: "Notifications", name: "Webhook", description: "HTTP callbacks for alert events." },
  { category: "Notifications", name: "PagerDuty", description: "On-call escalation." },
];

export default function IntegrationsPage() {
  const [selected, setSelected] = useState<(typeof INTEGRATIONS)[0] | null>(null);
  const categories = [...new Set(INTEGRATIONS.map((item) => item.category))];

  return (
    <div className="page">
      <PageHeader kicker="Govern" title="Integrations" lede="Connect providers. Configuration is stored on the operator side until a connector API ships." />
      {categories.map((category) => (
        <section key={category} style={{ marginBottom: 24 }}>
          <p className="kicker">{category}</p>
          <div className="grid">
            {INTEGRATIONS.filter((item) => item.category === category).map((item) => (
              <div className="card span-4" key={item.name}>
                <h2>{item.name}</h2>
                <p className="lede">{item.description}</p>
                <StatusBadge label="Not connected" tone="neutral" />
                <div style={{ marginTop: 12 }}>
                  <button type="button" className="btn secondary" onClick={() => setSelected(item)}>
                    Configure
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      {selected ? (
        <Drawer title={selected.name} onClose={() => setSelected(null)}>
          <p className="lede">{selected.description}</p>
          <p className="lede">
            There is no public connector API yet. Point the MLflow SDK at this host and set provider keys in your runtime
            environment, not in Tensorlane.
          </p>
        </Drawer>
      ) : null}
    </div>
  );
}
