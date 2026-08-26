"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function TrackingFrame() {
  const searchParams = useSearchParams();
  const hash = (searchParams.get("hash") ?? "").replace(/^#/, "");
  const src = hash ? `/mlflow/#${hash}` : "/mlflow/";
  return (
    <div className="workbench">
      <iframe title="MLflow workbench" src={src} />
    </div>
  );
}

export default function TrackingPage() {
  return (
    <Suspense fallback={<div className="workbench">Loading workbench…</div>}>
      <TrackingFrame />
    </Suspense>
  );
}
