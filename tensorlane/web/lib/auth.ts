import { APIError, createAuthMiddleware } from "better-auth/api";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";

import { createAuthDatabase } from "./database";
import { newPrefixedId } from "./ids";

const socialProviders: NonNullable<Parameters<typeof betterAuth>[0]["socialProviders"]> = {};

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  socialProviders.google = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  };
}
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  socialProviders.github = {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
  };
}
if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
  socialProviders.microsoft = {
    clientId: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
  };
}

export const enabledSocialProviders = {
  google: Boolean(socialProviders.google),
  github: Boolean(socialProviders.github),
  microsoft: Boolean(socialProviders.microsoft),
};

async function assertPasswordAllowed(email: string | undefined): Promise<void> {
  if (!email || !email.includes("@")) return;
  const origin = process.env.TENSORLANE_API_ORIGIN || "http://127.0.0.1:8080";
  try {
    const response = await fetch(
      `${origin}/api/v1/auth/sso-policy?email=${encodeURIComponent(email)}`,
    );
    if (!response.ok) return;
    const policy = (await response.json()) as { required?: boolean; message?: string };
    if (policy.required) {
      throw new APIError("FORBIDDEN", {
        message: policy.message ?? "Your organization requires SSO.",
      });
    }
  } catch (error) {
    if (error instanceof APIError) throw error;
  }
}

export const auth = betterAuth({
  database: createAuthDatabase(),
  secret: process.env.BETTER_AUTH_SECRET || process.env.TENSORLANE_SECRET_KEY || "dev-only-secret",
  baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  trustedOrigins: [
    "http://localhost:3000",
    "http://localhost:8080",
    process.env.BETTER_AUTH_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined,
  ].filter((value): value is string => Boolean(value)),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
  },
  socialProviders,
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/email" && ctx.path !== "/sign-up/email") return;
      const body = ctx.body as { email?: string } | undefined;
      await assertPasswordAllowed(body?.email);
    }),
  },
  user: {
    modelName: "users",
    fields: {
      emailVerified: "email_verified",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  session: {
    modelName: "sessions",
    fields: {
      userId: "user_id",
      expiresAt: "expires_at",
      ipAddress: "ip_address",
      userAgent: "user_agent",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  account: {
    modelName: "accounts",
    fields: {
      userId: "user_id",
      accountId: "account_id",
      providerId: "provider_id",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      accessTokenExpiresAt: "access_token_expires_at",
      refreshTokenExpiresAt: "refresh_token_expires_at",
      idToken: "id_token",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  verification: {
    modelName: "verifications",
    fields: {
      expiresAt: "expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  advanced: {
    database: {
      generateId: ({ model }: { model: string }) => {
        const prefixes: Record<string, string> = {
          user: "usr",
          session: "ses",
          account: "acc",
          verification: "ver",
        };
        return newPrefixedId(prefixes[model] ?? "id");
      },
    },
  },
  plugins: [nextCookies()],
});
