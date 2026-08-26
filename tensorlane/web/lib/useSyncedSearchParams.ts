"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

/** Keep listed query keys in the URL so filtered views can be bookmarked. */
export function useSyncedSearchParams(state: Record<string, string>): void {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const serialized = JSON.stringify(state);

  useEffect(() => {
    const nextState = JSON.parse(serialized) as Record<string, string>;
    const params = new URLSearchParams(searchParams.toString());
    let changed = false;
    for (const [key, value] of Object.entries(nextState)) {
      const normalized = !value || value === "all" ? "" : value;
      const current = params.get(key) ?? "";
      if (current === normalized) continue;
      changed = true;
      if (normalized) params.set(key, normalized);
      else params.delete(key);
    }
    if (!changed) return;
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams, serialized]);
}
