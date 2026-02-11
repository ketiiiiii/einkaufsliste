"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { addItem } from "../actions";

type Props = {
  listId: string;
  units: string[];
};

export function AddItemForm({ listId, units }: Props) {
  const listBoxId = useId();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const normalizedQuery = useMemo(() => query.trim(), [query]);

  useEffect(() => {
    if (normalizedQuery.length < 1) {
      setSuggestions([]);
      abortRef.current?.abort();
      abortRef.current = null;
      return;
    }

    const handle = window.setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(`/api/item-suggestions?q=${encodeURIComponent(normalizedQuery)}`,
          {
            signal: controller.signal,
            headers: { Accept: "application/json" },
          }
        );

        if (!res.ok) {
          setSuggestions([]);
          return;
        }

        const data = (await res.json()) as { suggestions?: unknown };
        const next = Array.isArray(data.suggestions)
          ? data.suggestions.filter((s): s is string => typeof s === "string")
          : [];

        setSuggestions(next.slice(0, 10));
      } catch (e) {
        if ((e as { name?: string })?.name === "AbortError") return;
        setSuggestions([]);
      }
    }, 150);

    return () => window.clearTimeout(handle);
  }, [normalizedQuery]);

  return (
    <form action={addItem} className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-12 sm:gap-2">
      <input type="hidden" name="listId" value={listId} />

      <input
        name="title"
        placeholder="Bezeichnung"
        className="h-9 rounded-lg border border-zinc-200 px-2 text-sm outline-none focus:border-zinc-400 sm:col-span-7 sm:h-11 sm:rounded-xl sm:px-3"
        autoFocus
        autoComplete="off"
        list={listBoxId}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <datalist id={listBoxId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      <input
        name="quantity"
        placeholder="Menge"
        className="h-9 rounded-lg border border-zinc-200 px-2 text-sm outline-none focus:border-zinc-400 sm:col-span-2 sm:h-11 sm:rounded-xl sm:px-3"
      />

      <select
        name="unit"
        className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm outline-none focus:border-zinc-400 sm:col-span-2 sm:h-11 sm:rounded-xl sm:px-3"
        defaultValue=""
      >
        <option value="">Einheit</option>
        {units.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>

      <button
        type="submit"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-900 text-sm font-semibold text-white hover:bg-zinc-800 sm:col-span-1 sm:h-11 sm:w-11 sm:rounded-xl"
        aria-label="Position hinzufügen"
        title="Position hinzufügen"
      >
        +
      </button>
    </form>
  );
}
