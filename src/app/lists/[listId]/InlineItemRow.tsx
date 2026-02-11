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
    <li className="rounded-2xl border border-zinc-200 bg-white p-4">
      <form
        ref={formRef}
        className="flex flex-wrap items-center gap-2"
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
        <label className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100">
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
              ? "h-11 min-w-0 flex-1 rounded-xl border border-zinc-200 px-3 text-sm text-zinc-500 line-through outline-none focus:border-zinc-400"
              : "h-11 min-w-0 flex-1 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-400"
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
              ? "h-11 w-[96px] rounded-xl border border-zinc-200 px-3 text-sm text-zinc-500 line-through outline-none focus:border-zinc-400"
              : "h-11 w-[96px] rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-400"
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
              ? "h-11 w-[96px] rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-500 outline-none focus:border-zinc-400"
              : "h-11 w-[96px] rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-400"
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
