"use client";

import { useEffect, useState } from "react";

import { publicTrackingUri } from "@/lib/publicOrigin";

export function usePublicTrackingUri(): string {
  const [uri, setUri] = useState(publicTrackingUri);
  useEffect(() => {
    setUri(window.location.origin);
  }, []);
  return uri;
}
