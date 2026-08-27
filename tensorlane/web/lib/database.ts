import pg from "pg";

function sqliteFileFromUrl(databaseUrl: string): string {
  if (databaseUrl.startsWith("sqlite:////")) {
    return databaseUrl.slice("sqlite:///".length);
  }
  if (databaseUrl.startsWith("sqlite:///")) {
    const relative = databaseUrl.slice("sqlite:///".length);
    if (relative.startsWith("/")) {
      return relative;
    }
    return `${process.cwd()}/${relative.replace(/^\.\//, "")}`;
  }
  throw new Error(`Unsupported SQLite URL: ${databaseUrl}`);
}

export function createAuthDatabase(): pg.Pool | InstanceType<typeof import("better-sqlite3")> {
  const url =
    process.env.DATABASE_URL ||
    (process.env.VERCEL ? "postgresql://127.0.0.1/tensorlane" : "sqlite:///./tensorlane-dev.db");
  if (url.startsWith("postgres")) {
    // Pool construction does not open a connection, so Next.js can compile on Vercel
    // before DATABASE_URL is set. Auth routes still need a reachable Postgres at runtime.
    return new pg.Pool({ connectionString: url });
  }
  try {
    const Database = require("better-sqlite3") as typeof import("better-sqlite3");
    return new Database(sqliteFileFromUrl(url));
  } catch (error) {
    throw new Error(
      "SQLite auth requires better-sqlite3. Use Postgres in production, or install optionalDependencies.",
      { cause: error },
    );
  }
}
