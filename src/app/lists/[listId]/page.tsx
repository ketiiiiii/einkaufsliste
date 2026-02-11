import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/require-user";

import { addItem, deleteList } from "../actions";
import { AddItemForm } from "./AddItemForm";
import { InlineItemRow } from "./InlineItemRow";
import { RenamePopover } from "./RenamePopover";

const UNITS = ["Stk", "kg", "g", "l", "ml", "Pck", "Fl", "Dose"];

type ItemRow = {
  id: string;
  title: string;
  quantity: string | null;
  unit: string | null;
  done: boolean;
};

type PageProps = {
  params: Promise<{ listId: string }>;
  searchParams?: Promise<{ showDone?: string; take?: string }>;
};

export default async function ListDetailPage({ params, searchParams }: PageProps) {
  const userId = await requireUserId();
  const { listId } = await params;
  const sp = (await searchParams) ?? {};

  const showDone = sp.showDone === "1";
  const take = Math.max(10, Math.min(200, Number(sp.take ?? 10) || 10));

  const list = await prisma.shoppingList.findFirst({
    where: { id: listId, ownerId: userId },
    select: { id: true, name: true },
  });

  if (!list) notFound();

  const whereItems = {
    listId,
    ...(showDone ? {} : { done: false as const }),
  };

  const [items, totalCount] = await Promise.all([
    prisma.shoppingItem.findMany({
      where: whereItems,
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        title: true,
        quantity: true,
        unit: true,
        done: true,
      },
    }),
    prisma.shoppingItem.count({ where: whereItems }),
  ]);

  const typedItems = items as ItemRow[];

  const nextTake = take + 10;
  const hasMore = totalCount > take;

  const selfHref = `/lists/${listId}?showDone=${showDone ? "1" : "0"}&take=${take}`;
  const toggleShowDoneHref = `/lists/${listId}?showDone=${showDone ? "0" : "1"}&take=${take}`;
  const nextHref = `/lists/${listId}?showDone=${showDone ? "1" : "0"}&take=${nextTake}`;

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link
              href="/lists"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-sm font-semibold text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
              aria-label="Alle Listen"
              title="Alle Listen"
            >
              ←
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">{list.name}</h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <RenamePopover listId={list.id} name={list.name} />
            <Link
              href={toggleShowDoneHref}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-sm font-semibold hover:bg-zinc-100"
              prefetch={false}
              aria-label={showDone ? "Erledigte ausblenden" : "Erledigte anzeigen"}
              title={showDone ? "Erledigte ausblenden" : "Erledigte anzeigen"}
            >
              {showDone ? "☐" : "☑"}
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
          </div>
        </header>

        <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-zinc-700">Position hinzufügen</h2>
          <AddItemForm listId={list.id} units={UNITS} />
        </section>

        <section className="mt-6">
          {items.length === 0 ? (
            <p className="text-sm text-zinc-600">Keine Positionen (oder alles erledigt).</p>
          ) : (
            <ul className="space-y-2">
              {typedItems.map((item: ItemRow) => {
                return (
                  <InlineItemRow key={item.id} listId={list.id} item={item} units={UNITS} />
                );
              })}
            </ul>
          )}

          {hasMore ? (
            <div className="mt-4">
              <Link
                href={nextHref}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-sm font-semibold hover:bg-zinc-100"
                prefetch={false}
                aria-label="Nächste 10"
                title="Nächste 10"
              >
                »
              </Link>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
