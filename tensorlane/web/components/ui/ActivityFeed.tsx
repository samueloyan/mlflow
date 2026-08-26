import { formatRelative } from "@/lib/format";

export type ActivityItem = {
  id: string;
  title: string;
  detail?: string;
  at?: string | number | null;
};

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return <p className="lede">No recent activity.</p>;
  }
  return (
    <ul className="activity-feed">
      {items.map((item) => (
        <li key={item.id}>
          <span className="activity-dot" aria-hidden="true" />
          <div>
            <strong>{item.title}</strong>
            {item.detail ? <div className="lede">{item.detail}</div> : null}
            {item.at ? <div className="activity-time">{formatRelative(item.at)}</div> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
