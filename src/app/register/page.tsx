import Link from "next/link";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth-options";
import { registerUser } from "./actions";

type PageProps = {
  searchParams?: Promise<{ error?: string }>;
};

export default async function RegisterPage({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    redirect("/lists");
  }

  const sp = (await searchParams) ?? {};
  const error = sp.error;

  const message =
    error === "missing"
      ? "Bitte Email und Passwort eingeben."
      : error === "weak"
        ? "Passwort ist zu kurz (mind. 6 Zeichen)."
        : error === "exists"
          ? "Diese Email ist schon registriert."
          : null;

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-4 py-16">
        <div className="rounded-2xl border border-zinc-200 bg-white p-8">
          <h1 className="text-2xl font-semibold tracking-tight">Registrieren</h1>
          <p className="mt-2 text-sm text-zinc-600">Einfach Account anlegen und loslegen.</p>

          {message ? (
            <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
              {message}
            </div>
          ) : null}

          <form action={registerUser} className="mt-6 space-y-3">
            <input
              name="name"
              placeholder="Name (optional)"
              className="h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-400"
            />
            <input
              name="email"
              type="email"
              placeholder="Email"
              className="h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-400"
              required
            />
            <input
              name="password"
              type="password"
              placeholder="Passwort (mind. 6 Zeichen)"
              className="h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-400"
              required
            />
            <button
              type="submit"
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800 sm:w-11"
              aria-label="Account erstellen"
              title="Account erstellen"
            >
              ✓
            </button>
          </form>

          <div className="mt-6 text-sm">
            <Link
              href="/"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white font-semibold text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
              aria-label="Zurück zum Login"
              title="Zurück zum Login"
            >
              ←
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
