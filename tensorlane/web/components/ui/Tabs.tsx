"use client";

export function Tabs({
  items,
  value,
  onChange,
}: {
  items: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={value === item.id}
          data-active={value === item.id}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
