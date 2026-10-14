// Gives every new visitor their practice ID as soon as the page loads, so all
// of the page's requests share one ID. (Without this, a fresh browser's first
// few requests could each create a different ID, and the duel lobby would show
// a "ghost" copy of yourself.)
import { NextResponse, type NextRequest } from "next/server";

const PRACTICE_COOKIE = "chog_practice"; // same name as src/lib/practice.ts

export function middleware(req: NextRequest) {
  const v = req.cookies.get(PRACTICE_COOKIE)?.value;
  if (v && /^[0-9a-f-]{36}$/.test(v)) return NextResponse.next();
  const res = NextResponse.next();
  res.cookies.set(PRACTICE_COOKIE, crypto.randomUUID(), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return res;
}

// Pages only: not API calls, images, or Next's own files.
export const config = { matcher: ["/((?!api|_next|.*\\..*).*)"] };
