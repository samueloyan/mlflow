import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {
    // Always clear the local cookie even if Better Auth rejects the call.
  }
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.cookies.delete("better-auth.session_token");
  response.cookies.delete("__Secure-better-auth.session_token");
  return response;
}
