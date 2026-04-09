import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/require-user";

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const { stateJson } = await req.json();
    if (!stateJson || typeof stateJson !== "string") {
      return NextResponse.json({ error: "Missing stateJson" }, { status: 400 });
    }
    // Validate JSON structure before saving
    JSON.parse(stateJson);
    await prisma.taskBoardState.upsert({
      where: { userId },
      create: { userId, stateJson },
      update: { stateJson },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("save-board error:", e);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
}
