import { NextResponse, type NextRequest } from "next/server";

/**
 * Preview-only safety gate. No live customer purchase, webhook, lead capture
 * or cron may run on this Railway staging service before production signoff.
 * This file lives on a migration branch, not the live Vercel deployment.
 */
export function proxy(request: NextRequest) {
  if (process.env.RAILWAY_MIGRATION_READONLY !== "true") {
    return NextResponse.next();
  }
  const path = request.nextUrl.pathname;
  if (path === "/api" || path.startsWith("/api/") ||
      (request.method !== "GET" && request.method !== "HEAD")) {
    return NextResponse.json(
      { error: "Railway migration preview is read-only.", chargeAttempted: false },
      { status: 403, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } }
    );
  }
  const response = NextResponse.next();
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
export const config = { matcher: "/((?!_next/static|_next/image|favicon.ico).*)" };
