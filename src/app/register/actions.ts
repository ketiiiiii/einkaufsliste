"use server";

import { hash } from "bcryptjs";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function registerUser(formData: FormData) {
  const emailRaw = getString(formData, "email");
  const password = getString(formData, "password");
  const name = getString(formData, "name").trim();

  const email = emailRaw.trim().toLowerCase();

  if (!email || !password) {
    redirect("/register?error=missing");
  }

  if (password.length < 6) {
    redirect("/register?error=weak");
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existing) {
    redirect("/register?error=exists");
  }

  const passwordHash = await hash(password, 10);

  await prisma.user.create({
    data: {
      email,
      name: name || null,
      passwordHash,
    },
  });

  redirect("/?registered=1");
}
