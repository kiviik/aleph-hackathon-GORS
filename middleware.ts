import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  if (process.env.VERCEL === "1" && request.nextUrl.pathname.startsWith("/estaciona")) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/estaciona/:path*"] };
