import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth-options";
import { LoginForm } from "./LoginForm";

type PageProps = {
  searchParams?: Promise<{ error?: string; registered?: string }>;
};

export default async function Home({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    redirect("/lists");
  }

  const sp = (await searchParams) ?? {};
  const error = sp.error;
  const registered = sp.registered === "1";

  const message =
    registered
      ? "Account erstellt. Bitte einloggen."
      : error
        ? "Login fehlgeschlagen."
        : null;

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-4 py-16">
        <div className="rounded-2xl border border-zinc-200 bg-white p-8">
          <h1 className="text-3xl font-semibold tracking-tight">Einkaufsliste</h1>
          <p className="mt-3 text-sm text-zinc-600">
            Minimal, schnell, mehrere Listen. Nur deine Listen sind sichtbar.
          </p>

          {message ? (
            <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
              {message}
            </div>
          ) : null}

          <LoginForm />

          <div className="mt-6 flex items-center justify-between text-sm">
            <Link
              href="/register"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white font-semibold text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
              aria-label="Registrieren"
              title="Registrieren"
            >
              +
            </Link>
            <Link
              href="/lists"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white font-semibold text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
              aria-label="Zu den Listen"
              title="Zu den Listen"
            >
              →
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
