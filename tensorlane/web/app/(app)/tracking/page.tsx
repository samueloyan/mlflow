"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef } from "react";

import { PRODUCT_NAME } from "@/lib/brand";
import { injectTrackingRebrand } from "@/lib/rebrand";

function TrackingFrame() {
  const searchParams = useSearchParams();
  const hash = (searchParams.get("hash") ?? "").replace(/^#/, "");
  const src = hash ? `/mlflow/#${hash}` : "/mlflow/";
  const frameRef = useRef<HTMLIFrameElement>(null);
  const stopRef = useRef<(() => void) | undefined>(undefined);

  const attach = useCallback(() => {
    stopRef.current?.();
    stopRef.current = undefined;
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    stopRef.current = injectTrackingRebrand(doc);
  }, []);

  useEffect(() => {
    return () => {
      stopRef.current?.();
    };
  }, []);

  return (
    <div className="workbench">
      <div className="workbench-bar">
        <strong>{PRODUCT_NAME} tracking</strong>
        <span>Deep experiment, registry, and gateway views for this workspace.</span>
      </div>
      <iframe
        ref={frameRef}
        title={`${PRODUCT_NAME} tracking`}
        src={src}
        onLoad={attach}
      />
    </div>
  );
}

export default function TrackingPage() {
  return (
    <Suspense fallback={<div className="workbench">Loading tracking…</div>}>
      <TrackingFrame />
    </Suspense>
  );
}
