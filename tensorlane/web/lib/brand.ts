/** User-facing product name. Never “Tensorlane MLflow”. */
export const PRODUCT_NAME = "Tensorlane";

/** Env vars shown in the dashboard. The SDK maps these onto the tracking protocol. */
export const TRACKING_URI_ENV = "TENSORLANE_TRACKING_URI";
export const TRACKING_TOKEN_ENV = "TENSORLANE_API_KEY";

/** Trace metadata key the protocol writes for chat sessions. Not shown in chrome. */
export const TRACE_SESSION_KEY = "mlflow.trace.session";

export function trackingUiHref(hash?: string): string {
  if (!hash) return "/tracking";
  const cleaned = hash.replace(/^#/, "");
  return `/tracking?hash=${encodeURIComponent(cleaned)}`;
}

export function pythonSdkSnippet(trackingUri: string): string {
  return `from tensorlane import track

track.connect(tracking_uri="${trackingUri}")
# Auth: export ${TRACKING_TOKEN_ENV}=<your Tensorlane API key>

with track.start_run():
    track.log_param("model", "gpt-4o")
    track.log_metric("score", 0.94)`;
}
