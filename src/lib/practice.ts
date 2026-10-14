// Practice mode: anyone can trade with any Chog, no wallet needed.
// Each browser gets a random practice ID in a cookie. Practice trades are
// stored separately and never touch a Chog's real record or the league.
import crypto from "crypto";
import { cookies } from "next/headers";

export const PRACTICE_COOKIE = "chog_practice";

export async function getPracticeId(): Promise<string | null> {
  const v = (await cookies()).get(PRACTICE_COOKIE)?.value;
  return v && /^[0-9a-f-]{36}$/.test(v) ? v : null;
}

export function newPracticeId() {
  return crypto.randomUUID();
}

export const practiceCookieOptions = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 * 365 };
