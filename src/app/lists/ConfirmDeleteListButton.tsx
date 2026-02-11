"use client";

import { useTransition } from "react";

import { deleteList } from "./actions";

type Props = {
  listId: string;
  label?: string;
};

export function ConfirmDeleteListButton({ listId, label }: Props) {
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        const ok = window.confirm("Liste wirklich löschen?");
        if (!ok) return;

        startTransition(async () => {
          await deleteList(formData);
        });
      }}
    >
      <input type="hidden" name="listId" value={listId} />
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-sm font-semibold hover:bg-zinc-100 disabled:opacity-60"
        aria-label={label ?? "Liste löschen"}
        title={label ?? "Liste löschen"}
      >
        ⌫
      </button>
    </form>
  );
}
