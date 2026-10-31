import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyJwt } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Define which paths require authentication
  const isProtectedRoute =
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname.startsWith("/api/protected");

  // Define auth/landing paths where logged-in users should be sent to the dashboard
  const isAuthRoute = pathname === "/login";
  const isHomeRoute = pathname === "/";

  const token = request.cookies.get("auth_token")?.value;
  let verifiedPayload = null;

  if (token) {
    verifiedPayload = await verifyJwt(token);
  }

  // If the user is trying to access a protected route without a valid token, redirect to login
  if (isProtectedRoute && !verifiedPayload) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // If a logged-in user visits the landing/home page or login page, redirect them to the dashboard
  if ((isHomeRoute || isAuthRoute) && verifiedPayload) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const middleware = proxy;

// Optimize proxy execution by filtering paths
export const config = {
  matcher: [
    "/",
    "/dashboard",
    "/dashboard/:path*",
    "/login",
    "/api/protected/:path*",
  ],
};
