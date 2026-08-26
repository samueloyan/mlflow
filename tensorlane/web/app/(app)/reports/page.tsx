import Link from "next/link";

import { PageHeader } from "@/components/PageHeader";

export default function ReportsPage() {
  return (
    <div className="page">
      <PageHeader kicker="Operate" title="Reports" lede="Export-oriented summaries for experiments, usage, and cost." />
      <div className="grid">
        {[
          { href: "/experiments", title: "Experiment performance", body: "Open the experiment list and compare runs." },
          { href: "/models", title: "Model performance", body: "Registry stages and latest versions." },
          { href: "/evaluations", title: "Evaluation results", body: "Scorers and datasets in this workspace." },
          { href: "/usage", title: "Usage", body: "Meters for the current billing period." },
          { href: "/cost", title: "Cost", body: "Estimated spend from metered usage." },
          { href: "/monitoring", title: "AI application health", body: "Alerts and trace volume." },
        ].map((item) => (
          <Link key={item.href} className="card span-4" href={item.href}>
            <h2>{item.title}</h2>
            <p className="lede">{item.body}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
