import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Protected one-time seed endpoint.
 * Requires Authorization header matching NEXTAUTH_SECRET.
 * POST { stateJson: "..." }
 */
export async function POST(req: NextRequest) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return NextResponse.json({ error: "No secret configured" }, { status: 500 });

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { stateJson } = await req.json();
  if (!stateJson || typeof stateJson !== "string") {
    return NextResponse.json({ error: "Missing stateJson" }, { status: 400 });
  }

  // Validate JSON
  JSON.parse(stateJson);

  // Find first user (or the only user on Render)
  const user = await prisma.user.findFirst();
  if (!user) {
    return NextResponse.json({ error: "No user found – register first" }, { status: 404 });
  }

  await prisma.taskBoardState.upsert({
    where: { userId: user.id },
    create: { userId: user.id, stateJson },
    update: { stateJson },
  });

  return NextResponse.json({ ok: true, userId: user.id });
}
