import { formatDate } from "@/lib/format";

export type ActivityItem = {
  id: string;
  title: string;
  detail?: string;
  at?: string | null;
};

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return <p className="lede">No recent activity.</p>;
  }
  return (
    <ul className="plain-list" style={{ paddingLeft: 0, listStyle: "none" }}>
      {items.map((item) => (
        <li key={item.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--color-border)" }}>
          <strong>{item.title}</strong>
          {item.detail ? <div className="lede" style={{ margin: "4px 0 0" }}>{item.detail}</div> : null}
          {item.at ? (
            <div className="lede" style={{ margin: "4px 0 0", fontSize: 12 }}>
              {formatDate(item.at)}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
