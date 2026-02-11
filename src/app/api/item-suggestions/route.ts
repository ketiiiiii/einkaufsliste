import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ suggestions: [] }, { status: 200 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  if (!q) {
    return NextResponse.json({ suggestions: [] }, { status: 200 });
  }

  const rows = await prisma.shoppingItem.findMany({
    where: {
      title: { contains: q },
      list: {
        ownerId: userId,
      },
    },
    distinct: ["title"],
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { title: true },
  });

  const suggestions = rows
    .map((r) => r.title)
    .filter(Boolean)
    .slice(0, 10);

  return NextResponse.json({ suggestions }, { status: 200 });
}
