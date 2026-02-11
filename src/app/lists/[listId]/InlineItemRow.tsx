"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

import { updateItem } from "../actions";

type Props = {
  listId: string;
  item: {
    id: string;
    title: string;
    quantity: string | null;
    unit: string | null;
    done: boolean;
  };
  units: string[];
};

export function InlineItemRow({ listId, item, units }: Props) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (isPending) return;
    formRef.current?.requestSubmit();
  }

  return (
    <li className="rounded-xl border border-zinc-200 bg-white p-2 sm:rounded-2xl sm:p-4">
      <form
        ref={formRef}
        className="flex flex-wrap items-center gap-1 sm:gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);

          startTransition(async () => {
            await updateItem(formData);
            router.refresh();
          });
        }}
      >
        <input type="hidden" name="itemId" value={item.id} />
        <input type="hidden" name="listId" value={listId} />

        {/* done: hidden 0 + checkbox 1 so we always submit a value */}
        <input type="hidden" name="done" value="0" />
        <label className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-zinc-200 bg-white hover:bg-zinc-100 sm:h-11 sm:w-11 sm:rounded-xl">
          <input
            type="checkbox"
            name="done"
            value="1"
            defaultChecked={item.done}
            onChange={submit}
            className="h-4 w-4"
            aria-label={item.done ? "Erledigt (aktiv)" : "Erledigt"}
            disabled={isPending}
          />
        </label>

        <input
          name="title"
          defaultValue={item.title}
          onBlur={submit}
          disabled={isPending}
          className={
            item.done
              ? "h-9 min-w-0 flex-1 rounded-lg border border-zinc-200 px-2 text-sm text-zinc-500 line-through outline-none focus:border-zinc-400 sm:h-11 sm:rounded-xl sm:px-3"
              : "h-9 min-w-0 flex-1 rounded-lg border border-zinc-200 px-2 text-sm outline-none focus:border-zinc-400 sm:h-11 sm:rounded-xl sm:px-3"
          }
          placeholder="Bezeichnung"
        />

        <input
          name="quantity"
          defaultValue={item.quantity ?? ""}
          onBlur={submit}
          disabled={isPending}
          className={
            item.done
              ? "h-9 w-[64px] rounded-lg border border-zinc-200 px-2 text-sm text-zinc-500 line-through outline-none focus:border-zinc-400 sm:h-11 sm:w-[96px] sm:rounded-xl sm:px-3"
              : "h-9 w-[64px] rounded-lg border border-zinc-200 px-2 text-sm outline-none focus:border-zinc-400 sm:h-11 sm:w-[96px] sm:rounded-xl sm:px-3"
          }
          placeholder="Menge"
        />

        <select
          name="unit"
          defaultValue={item.unit ?? ""}
          onChange={submit}
          disabled={isPending}
          className={
            item.done
              ? "h-9 w-[64px] rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-500 outline-none focus:border-zinc-400 sm:h-11 sm:w-[96px] sm:rounded-xl sm:px-3"
              : "h-9 w-[64px] rounded-lg border border-zinc-200 bg-white px-2 text-sm outline-none focus:border-zinc-400 sm:h-11 sm:w-[96px] sm:rounded-xl sm:px-3"
          }
        >
          <option value="">Einheit</option>
          {units.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </form>
    </li>
  );
}
