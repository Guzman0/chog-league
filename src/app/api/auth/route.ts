import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { publicClient } from "@/lib/chain";
import { SESSION_COOKIE, createSessionValue, getSessionAddress, signInMessage } from "@/lib/session";

// Who is signed in?
export async function GET() {
  return NextResponse.json({ address: await getSessionAddress() });
}

// Sign in: { address, issuedAt, signature }
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { address, issuedAt, signature } = body as { address?: string; issuedAt?: string; signature?: `0x${string}` };
  if (!address || !isAddress(address) || !issuedAt || !signature) {
    return NextResponse.json({ error: "Missing sign-in details" }, { status: 400 });
  }
  const age = Date.now() - Date.parse(issuedAt);
  if (!Number.isFinite(age) || age > 10 * 60000 || age < -60000) {
    return NextResponse.json({ error: "Sign-in request expired, please try again" }, { status: 400 });
  }
  const wallet = getAddress(address);
  const valid = await publicClient
    .verifyMessage({ address: wallet, message: signInMessage(wallet, issuedAt), signature })
    .catch(() => false);
  if (!valid) return NextResponse.json({ error: "Signature didn't match this wallet" }, { status: 401 });

  const { value, maxAge } = await createSessionValue(wallet);
  const res = NextResponse.json({ address: wallet.toLowerCase() });
  res.cookies.set(SESSION_COOKIE, value, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge });
  return res;
}

// Sign out
export async function DELETE() {
  const res = NextResponse.json({ address: null });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
