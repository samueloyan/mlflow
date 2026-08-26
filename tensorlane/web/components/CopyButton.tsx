"use client";

import { useState } from "react";

import { copyText } from "@/lib/format";

export function CopyButton({
  value,
  label = "Copy",
  className = "btn secondary",
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    const ok = await copyText(value);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button type="button" className={className} onClick={() => void onCopy()}>
      {copied ? "Copied" : label}
    </button>
  );
}
