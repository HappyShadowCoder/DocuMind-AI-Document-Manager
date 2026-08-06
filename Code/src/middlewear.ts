import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyJwt } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Define which paths require authentication
  const isProtectedRoute = pathname.startsWith("/dashboard") || pathname.startsWith("/api/protected");
  
  // Define auth paths where logged-in users shouldn't be (like the login page itself)
  const isAuthRoute = pathname === "/login";

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

  // If a logged-in user tries to visit the login page, redirect them to the dashboard
  if (isAuthRoute && verifiedPayload) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// Optimize middleware execution by filtering paths
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/login",
    "/api/protected/:path*",
  ],
};