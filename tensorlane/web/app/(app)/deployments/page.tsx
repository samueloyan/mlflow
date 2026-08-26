import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export default function DeploymentsPage() {
  return (
    <div className="page">
      <PageHeader
        kicker="Operate"
        title="Deployments"
        lede="Deploy and manage your models and endpoints."
      />
      <EmptyState
        title="No deployments yet"
        body="Tensorlane does not yet expose a first-class deploy API. Keep serving with your existing endpoint and use Monitoring for traffic that already lands in traces."
      />
    </div>
  );
}
