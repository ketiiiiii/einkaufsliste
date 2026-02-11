"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

import { renameList } from "../actions";

type Props = {
  listId: string;
  name: string;
};

export function RenamePopover({ listId, name }: Props) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function close() {
    detailsRef.current?.removeAttribute("open");
  }

  return (
    <div className="relative">
      <details ref={detailsRef}>
        <summary
          className="inline-flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full border border-zinc-200 bg-white text-sm font-semibold hover:bg-zinc-100"
          aria-label="Einkaufsliste umbenennen"
          title="Einkaufsliste umbenennen"
        >
          ✎
        </summary>

        <div className="absolute left-0 z-10 mt-2 w-[320px] max-w-[calc(100vw-2rem)] rounded-2xl border border-zinc-200 bg-white p-3 sm:left-auto sm:right-0 sm:w-[340px]">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);

              startTransition(async () => {
                await renameList(formData);
                close();
                router.refresh();
              });
            }}
          >
            <input type="hidden" name="listId" value={listId} />
            <input
              name="name"
              defaultValue={name}
              className="h-11 flex-1 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-400"
              autoFocus
              disabled={isPending}
            />
            <button
              type="submit"
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-900 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
              aria-label="Umbenennen"
              title="Umbenennen"
              disabled={isPending}
            >
              ✓
            </button>
          </form>

          <div className="mt-2">
            <button
              type="button"
              onClick={close}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-sm font-semibold text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
              aria-label="Abbrechen"
              title="Abbrechen"
            >
              ×
            </button>
          </div>
        </div>
      </details>
    </div>
  );
}
