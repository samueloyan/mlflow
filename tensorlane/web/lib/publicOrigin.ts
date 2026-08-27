export function publicTrackingUri(): string {
  const fromEnv = (process.env.NEXT_PUBLIC_TRACKING_URI || process.env.NEXT_PUBLIC_APP_URL || "").replace(
    /\/$/,
    "",
  );
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "";
}

export function publicTrackingHost(): string {
  const uri = publicTrackingUri();
  if (!uri) return "this host";
  try {
    return new URL(uri).host;
  } catch {
    return uri.replace(/^https?:\/\//, "");
  }
}
