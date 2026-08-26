import { CopyButton } from "@/components/CopyButton";

export function CodeBlock({ value, label = "Copy" }: { value: string; label?: string }) {
  return (
    <div>
      <pre className="secret" style={{ marginBottom: 8 }}>
        {value}
      </pre>
      <CopyButton value={value} label={label} />
    </div>
  );
}
