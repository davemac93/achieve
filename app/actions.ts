"use server"

/**
 * Server actions are the ONLY write path from the dashboard into the vault.
 * The browser never touches disk: client components invoke these, which run on
 * the server and route every mutation through the vault I/O layer (atomic write
 * + one labeled git commit). After a write we revalidate so the UI reflects the
 * new on-disk state.
 */

import { revalidatePath } from "next/cache"

import { addTask, deleteTask, toggleTask } from "@/lib/dashboard/tasks"
import { addQuote } from "@/lib/dashboard/quotes"
import { saveDiaryEntry } from "@/lib/dashboard/diary"
import { saveProfile } from "@/lib/dashboard/profile"

export async function addTaskAction(formData: FormData): Promise<void> {
  const title = String(formData.get("title") ?? "")
  const goal = String(formData.get("goal") ?? "").trim()
  if (!title.trim()) return
  await addTask(title, goal || undefined)
  revalidatePath("/")
}

export async function toggleTaskAction(id: string): Promise<void> {
  await toggleTask(id)
  revalidatePath("/")
}

export async function deleteTaskAction(id: string): Promise<void> {
  await deleteTask(id)
  revalidatePath("/")
}

export async function addQuoteAction(formData: FormData): Promise<void> {
  const text = String(formData.get("text") ?? "")
  const author = String(formData.get("author") ?? "").trim()
  if (!text.trim()) return
  await addQuote(text, author || undefined)
  revalidatePath("/")
}

export async function saveDiaryEntryAction(formData: FormData): Promise<void> {
  const date = String(formData.get("date") ?? "")
  const content = String(formData.get("content") ?? "")
  await saveDiaryEntry(date, content)
  revalidatePath("/diary")
}

export async function saveProfileAction(formData: FormData): Promise<void> {
  const content = String(formData.get("content") ?? "")
  if (!content.trim()) return
  await saveProfile(content)
  revalidatePath("/profile")
}
