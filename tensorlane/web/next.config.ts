import type { NextConfig } from "next";

const apiOrigin =
  process.env.TENSORLANE_API_ORIGIN || (process.env.VERCEL ? "" : "http://127.0.0.1:8080");

const nextConfig: NextConfig = {
  // Docker/Compose uses standalone output. Vercel supplies its own tracing.
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  serverExternalPackages: ["better-sqlite3", "pg"],
  // The tracking workbench is served at /mlflow/. Next's default redirect to
  // /mlflow 308s the iframe and breaks relative static-file URLs.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    if (!apiOrigin) {
      return [];
    }
    return [
      { source: "/api/v1/:path*", destination: `${apiOrigin}/api/v1/:path*` },
      { source: "/mlflow", destination: `${apiOrigin}/mlflow/` },
      { source: "/mlflow/", destination: `${apiOrigin}/mlflow/` },
      { source: "/mlflow/:path*", destination: `${apiOrigin}/mlflow/:path*` },
      { source: "/ajax-api/:path*", destination: `${apiOrigin}/ajax-api/:path*` },
      { source: "/api/2.0/:path*", destination: `${apiOrigin}/api/2.0/:path*` },
      { source: "/api/3.0/:path*", destination: `${apiOrigin}/api/3.0/:path*` },
      { source: "/mlflow-artifacts/:path*", destination: `${apiOrigin}/mlflow-artifacts/:path*` },
      { source: "/v1/traces", destination: `${apiOrigin}/v1/traces` },
      { source: "/v1/traces/:path*", destination: `${apiOrigin}/v1/traces/:path*` },
      { source: "/get-artifact", destination: `${apiOrigin}/get-artifact` },
      { source: "/graphql", destination: `${apiOrigin}/graphql` },
      { source: "/version", destination: `${apiOrigin}/version` },
      { source: "/static-files/:path*", destination: `${apiOrigin}/static-files/:path*` },
      { source: "/gateway", destination: `${apiOrigin}/gateway` },
      { source: "/gateway/:path*", destination: `${apiOrigin}/gateway/:path*` },
    ];
  },
};

export default nextConfig;
