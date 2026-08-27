"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { PRODUCT_NAME } from "@/lib/brand";

function TrackingFrame() {
  const searchParams = useSearchParams();
  const hash = (searchParams.get("hash") ?? "").replace(/^#/, "");
  const src = hash ? `/mlflow/#${hash}` : "/mlflow/";
  return (
    <div className="workbench">
      <div className="workbench-bar">
        <strong>{PRODUCT_NAME} tracking UI</strong>
        <span>Deep experiment, registry, and gateway views for this workspace.</span>
      </div>
      <iframe title={`${PRODUCT_NAME} tracking UI`} src={src} />
    </div>
  );
}

export default function TrackingPage() {
  return (
    <Suspense fallback={<div className="workbench">Loading tracking UI…</div>}>
      <TrackingFrame />
    </Suspense>
  );
}
