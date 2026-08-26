import type { NextConfig } from "next";

const apiOrigin = process.env.TENSORLANE_API_ORIGIN || "http://127.0.0.1:8080";

const nextConfig: NextConfig = {
  // Docker/Compose uses standalone output. Vercel supplies its own tracing.
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  serverExternalPackages: ["better-sqlite3", "pg"],
  async rewrites() {
    return [
      { source: "/api/v1/:path*", destination: `${apiOrigin}/api/v1/:path*` },
      { source: "/mlflow", destination: `${apiOrigin}/mlflow/` },
      { source: "/mlflow/", destination: `${apiOrigin}/mlflow/` },
      { source: "/mlflow/:path*", destination: `${apiOrigin}/mlflow/:path*` },
      { source: "/ajax-api/:path*", destination: `${apiOrigin}/ajax-api/:path*` },
      { source: "/api/2.0/:path*", destination: `${apiOrigin}/api/2.0/:path*` },
      { source: "/api/3.0/:path*", destination: `${apiOrigin}/api/3.0/:path*` },
      { source: "/mlflow-artifacts/:path*", destination: `${apiOrigin}/mlflow-artifacts/:path*` },
    ];
  },
};

export default nextConfig;
