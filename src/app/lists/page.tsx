import Link from "next/link";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/require-user";
import { SignOutButton } from "@/app/SignOutButton";

import { createList, deleteList } from "./actions";

type ListRow = {
  id: string;
  name: string;
  updatedAt: Date;
};

export default async function ListsPage() {
  const session = await getServerSession(authOptions);
  const userId = await requireUserId();

  const lists: ListRow[] = await prisma.shoppingList.findMany({
    where: { ownerId: userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, updatedAt: true },
  });

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-3xl px-3 py-6 sm:px-4 sm:py-10">
        <header className="flex items-center justify-between gap-2 sm:gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Einkaufslisten</h1>
            <p className="mt-1 text-sm text-zinc-600">
              Angemeldet als {session?.user?.name ?? session?.user?.email ?? "User"}
            </p>
          </div>
          <SignOutButton />
        </header>

        <section className="mt-4 rounded-2xl border border-zinc-200 bg-white p-3 sm:mt-8 sm:p-4">
          <form action={createList} className="flex gap-1.5 sm:gap-2">
            <input
              name="name"
              placeholder="Neue Liste (z.B. WG, Grillabend, Büro…)"
              className="h-11 flex-1 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-400"
            />
            <button
              type="submit"
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-900 text-sm font-semibold text-white hover:bg-zinc-800"
              aria-label="Liste erstellen"
              title="Liste erstellen"
            >
              +
            </button>
          </form>
        </section>

        <section className="mt-4 sm:mt-6">
          {lists.length === 0 ? (
            <p className="text-sm text-zinc-600">Noch keine Listen. Leg eine an.</p>
          ) : (
            <ul className="space-y-3">
              {lists.map((list: ListRow) => (
                <li
                  key={list.id}
                  className="flex items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white p-3 sm:gap-3 sm:p-4"
                >
                  <Link
                    href={`/lists/${list.id}`}
                    className="min-w-0 flex-1"
                    prefetch={false}
                  >
                    <div className="truncate text-base font-semibold">{list.name}</div>
                    <div className="mt-1 text-xs text-zinc-500">Zuletzt geändert</div>
                  </Link>
                  <form action={deleteList}>
                    <input type="hidden" name="listId" value={list.id} />
                    <button
                      type="submit"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-sm font-semibold hover:bg-zinc-100"
                      aria-label="Liste löschen"
                      title="Liste löschen"
                    >
                      ⌫
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
