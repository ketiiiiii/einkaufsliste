"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(formData: FormData) {
    setError(null);
    setLoading(true);

    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl: "/lists",
    });

    setLoading(false);

    if (res?.error) {
      setError("Login fehlgeschlagen.");
      return;
    }

    window.location.href = res?.url ?? "/lists";
  }

  return (
    <form action={onSubmit} className="mt-6 space-y-3">
      {error ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
          {error}
        </div>
      ) : null}
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
        placeholder="Passwort"
        className="h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-400"
        required
      />
      <button
        type="submit"
        disabled={loading}
        className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60 sm:w-11"
        aria-label="Einloggen"
        title="Einloggen"
      >
        {loading ? "…" : "→"}
      </button>
    </form>
  );
}
