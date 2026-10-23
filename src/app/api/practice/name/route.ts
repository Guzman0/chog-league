// POST { name } → set (or clear, with "") this browser's practice-board nickname.
import { NextResponse } from "next/server";
import { getPracticeId } from "@/lib/practice";
import { setPracticeName } from "@/lib/store";

const BLOCKED = /(fuck|shit|cunt|nigg|fag|rape|hitler|nazi|admin|moderator|official|chog ?team)/i;

export async function POST(req: Request) {
  const id = await getPracticeId();
  if (!id) return NextResponse.json({ error: "Play a practice call first" }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  const name = typeof b.name === "string" ? b.name.trim().replace(/\s+/g, " ") : "";
  if (name && !/^[\p{L}\p{N} _.\-]{3,16}$/u.test(name)) {
    return NextResponse.json({ error: "3 to 16 letters, numbers, spaces, _ . or -" }, { status: 400 });
  }
  if (name && BLOCKED.test(name)) return NextResponse.json({ error: "Pick a different name" }, { status: 400 });
  try {
    await setPracticeName(id, name || null);
    return NextResponse.json({ name: name || null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't save the name" }, { status: 500 });
  }
}
