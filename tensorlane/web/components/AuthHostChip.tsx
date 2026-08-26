"use client";

import { useEffect, useState } from "react";

import { publicTrackingHost } from "@/lib/publicOrigin";

export function AuthHostChip() {
  const [host, setHost] = useState(publicTrackingHost);
  useEffect(() => {
    try {
      setHost(new URL(window.location.origin).host);
    } catch {
      setHost(window.location.host || publicTrackingHost());
    }
  }, []);
  return <p className="userchip">{host}</p>;
}
