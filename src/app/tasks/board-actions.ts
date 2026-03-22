"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/require-user";

export async function loadBoardState(): Promise<string | null> {
  const userId = await requireUserId();
  const row = await prisma.taskBoardState.findUnique({ where: { userId } });
  return row?.stateJson ?? null;
}

export async function saveBoardState(stateJson: string): Promise<void> {
  const userId = await requireUserId();
  await prisma.taskBoardState.upsert({
    where: { userId },
    create: { userId, stateJson },
    update: { stateJson },
  });
}
