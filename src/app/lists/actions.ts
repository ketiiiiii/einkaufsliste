"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/require-user";

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function getLastString(formData: FormData, key: string): string {
  const values = formData.getAll(key);
  const last = values.at(-1);
  return typeof last === "string" ? last : "";
}

export async function createList(formData: FormData) {
  const userId = await requireUserId();
  const name = getString(formData, "name").trim() || "Neue Liste";

  const list = await prisma.shoppingList.create({
    data: {
      name,
      ownerId: userId,
    },
    select: { id: true },
  });

  revalidatePath("/lists");
  redirect(`/lists/${list.id}`);
}

export async function renameList(formData: FormData) {
  const userId = await requireUserId();
  const listId = getString(formData, "listId");
  const name = getString(formData, "name").trim() || "Neue Liste";

  const list = await prisma.shoppingList.findFirst({
    where: { id: listId, ownerId: userId },
    select: { id: true },
  });

  if (!list) {
    redirect("/lists");
  }

  await prisma.shoppingList.update({
    where: { id: list.id },
    data: { name },
  });

  revalidatePath(`/lists/${listId}`);
  revalidatePath("/lists");
}

export async function deleteList(formData: FormData) {
  const userId = await requireUserId();
  const listId = getString(formData, "listId");

  const list = await prisma.shoppingList.findFirst({
    where: { id: listId, ownerId: userId },
    select: { id: true },
  });

  if (!list) {
    redirect("/lists");
  }

  await prisma.shoppingList.delete({
    where: { id: list.id },
  });

  revalidatePath("/lists");
  redirect("/lists");
}

export async function addItem(formData: FormData) {
  const userId = await requireUserId();
  const listId = getString(formData, "listId");

  const title = getString(formData, "title").trim();
  if (!title) {
    revalidatePath(`/lists/${listId}`);
    return;
  }

  const quantity = getString(formData, "quantity").trim();
  const unit = getString(formData, "unit").trim();

  const list = await prisma.shoppingList.findFirst({
    where: { id: listId, ownerId: userId },
    select: { id: true },
  });

  if (!list) {
    redirect("/lists");
  }

  await prisma.shoppingItem.create({
    data: {
      listId,
      title,
      quantity: quantity || null,
      unit: unit || null,
    },
  });

  revalidatePath(`/lists/${listId}`);
}

export async function toggleItemDone(formData: FormData) {
  const userId = await requireUserId();
  const itemId = getString(formData, "itemId");
  const listId = getString(formData, "listId");

  const item = await prisma.shoppingItem.findFirst({
    where: {
      id: itemId,
      list: {
        ownerId: userId,
      },
    },
    select: { id: true, done: true },
  });

  if (!item) {
    redirect("/lists");
  }

  await prisma.shoppingItem.update({
    where: { id: item.id },
    data: { done: !item.done },
  });

  revalidatePath(`/lists/${listId}`);
}

export async function updateItem(formData: FormData) {
  const userId = await requireUserId();
  const itemId = getString(formData, "itemId");
  const listId = getString(formData, "listId");

  const title = getString(formData, "title").trim();
  const quantity = getString(formData, "quantity").trim();
  const unit = getString(formData, "unit").trim();
  const doneRaw = getLastString(formData, "done");
  const done = doneRaw === "1";

  if (!title) {
    revalidatePath(`/lists/${listId}`);
    return;
  }

  const item = await prisma.shoppingItem.findFirst({
    where: {
      id: itemId,
      listId,
      list: {
        ownerId: userId,
      },
    },
    select: { id: true },
  });

  if (!item) {
    redirect("/lists");
  }

  await prisma.shoppingItem.update({
    where: { id: item.id },
    data: {
      title,
      quantity: quantity || null,
      unit: unit || null,
      done,
    },
  });

  revalidatePath(`/lists/${listId}`);
}
