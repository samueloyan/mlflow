import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { MetricCard } from "@/components/ui/MetricCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeleton";

export default function DesignSystemPage() {
  return (
    <div className="page">
      <PageHeader
        kicker="System"
        title="Design system"
        lede="Inspect Tensorlane primitives independently from product data."
      />
      <div className="grid">
        <div className="card span-6">
          <h2>Buttons</h2>
          <div className="page-actions" style={{ marginTop: 12 }}>
            <button type="button" className="btn">
              Primary
            </button>
            <button type="button" className="btn secondary">
              Secondary
            </button>
            <button type="button" className="btn danger">
              Danger
            </button>
            <button type="button" className="btn" disabled>
              Disabled
            </button>
          </div>
        </div>
        <div className="card span-6">
          <h2>Badges</h2>
          <div className="page-actions" style={{ marginTop: 12 }}>
            <StatusBadge label="Completed" tone="success" />
            <StatusBadge label="Failed" tone="danger" />
            <StatusBadge label="Running" tone="info" />
            <StatusBadge label="Healthy" tone="info" />
          </div>
        </div>
        <div className="span-3">
          <MetricCard label="Total Runs" value="1,248" delta={{ value: "+12% vs last 7d", direction: "up" }} series={[2, 4, 3, 8, 6, 9]} />
        </div>
        <div className="span-3">
          <MetricCard label="Error rate" value="0.4%" delta={{ value: "flat", direction: "flat" }} />
        </div>
        <div className="card span-6">
          <h2>Empty / error / loading</h2>
          <EmptyState title="No experiments yet" body="Experiments help you organize and compare your ML runs." />
          <div style={{ marginTop: 12 }}>
            <TableSkeleton rows={3} cols={4} />
          </div>
        </div>
        <div className="card span-12">
          <h2>Form field</h2>
          <label className="field" style={{ maxWidth: 360 }}>
            <span>Organization name</span>
            <input defaultValue="Acme Corporation" />
            <p className="field-help">Shown in the sidebar and invoices.</p>
          </label>
        </div>
      </div>
    </div>
  );
}
