// Wallet sign-in. The player signs a short message once (free, no transaction),
// the server checks the signature and remembers the wallet in a signed cookie.
// Every trade then re-checks on-chain that this wallet owns the Chog.
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "chog_session";
const SESSION_DAYS = 7;

let secretPromise: Promise<string> | null = null;
function getSecret(): Promise<string> {
  if (process.env.SESSION_SECRET) return Promise.resolve(process.env.SESSION_SECRET);
  if (process.env.VERCEL) return Promise.reject(new Error("SESSION_SECRET is not set in Vercel's environment variables"));
  // Local development: create a random secret once and keep it in data/.
  secretPromise ??= (async () => {
    const file = path.join(process.cwd(), "data", ".session-secret");
    try {
      return (await fs.readFile(file, "utf8")).trim();
    } catch {
      const s = crypto.randomBytes(32).toString("hex");
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, s);
      return s;
    }
  })();
  return secretPromise;
}

async function sign(payload: string) {
  return crypto.createHmac("sha256", await getSecret()).update(payload).digest("hex");
}

export async function createSessionValue(address: string) {
  const exp = Date.now() + SESSION_DAYS * 86400000;
  const payload = `${address.toLowerCase()}.${exp}`;
  return { value: `${payload}.${await sign(payload)}`, maxAge: SESSION_DAYS * 86400 };
}

export async function getSessionAddress(): Promise<string | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const [address, exp, mac] = raw.split(".");
  if (!address || !exp || !mac || Number(exp) < Date.now()) return null;
  const expected = await sign(`${address}.${exp}`);
  const ok = mac.length === expected.length && crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
  return ok ? address : null;
}

export function signInMessage(address: string, issuedAt: string) {
  return `Sign in to Chog League\n\nThis only proves you own this wallet. It costs nothing and sends no transaction.\n\nAddress: ${address}\nIssued: ${issuedAt}`;
}
