"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/" })}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-sm font-semibold hover:bg-zinc-100"
      aria-label="Abmelden"
      title="Abmelden"
    >
      ⎋
    </button>
  );
}
