/** User-facing product name. Never “Tensorlane MLflow”. */
export const PRODUCT_NAME = "Tensorlane";

/** Wire-protocol env vars the Python SDK still reads. */
export const TRACKING_URI_ENV = "MLFLOW_TRACKING_URI";
export const TRACKING_TOKEN_ENV = "MLFLOW_TRACKING_TOKEN";

/** Trace metadata key the SDK writes for chat sessions. */
export const TRACE_SESSION_KEY = "mlflow.trace.session";

export function trackingUiHref(hash?: string): string {
  if (!hash) return "/tracking";
  const cleaned = hash.replace(/^#/, "");
  return `/tracking?hash=${encodeURIComponent(cleaned)}`;
}

export function pythonSdkSnippet(trackingUri: string): string {
  return `import mlflow

mlflow.set_tracking_uri("${trackingUri}")
# Auth: export ${TRACKING_TOKEN_ENV}=<your Tensorlane API key>

with mlflow.start_run():
    mlflow.log_param("model", "gpt-4o")
    mlflow.log_metric("score", 0.94)`;
}
