import Link from "next/link";

import { requireUserId } from "@/lib/require-user";

import { TasksPageClient } from "./TasksPageClient";

export default async function TasksPage() {
  await requireUserId();

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="px-3 py-6 sm:px-6 sm:py-10">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Boards</p>
            <h1 className="text-3xl font-semibold tracking-tight">Tasks & Flows</h1>
            <p className="mt-1 text-sm text-zinc-600">
              Freies Board fuer Todos, Positionsideen und schnelle Cluster.
            </p>
          </div>
          <Link
            href="/lists"
            prefetch={false}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-sm font-semibold text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
            aria-label="Zurueck zu den Listen"
            title="Zurueck zu den Listen"
          >
            ←
          </Link>
        </header>

        <section className="mt-4 sm:mt-6">
          <TasksPageClient />
        </section>
      </div>
    </div>
  );
}
