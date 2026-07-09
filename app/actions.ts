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
import {
  addHolding,
  deleteHolding,
  updateHolding,
  type HoldingInput,
} from "@/lib/dashboard/investments"
import { addQuote } from "@/lib/dashboard/quotes"
import { setGoalStatus } from "@/lib/dashboard/goals"
import { saveDiaryEntry } from "@/lib/dashboard/diary"
import { saveProfile } from "@/lib/dashboard/profile"
import type { GoalStatus } from "@/lib/dashboard/types"

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

export async function setGoalStatusAction(
  id: string,
  status: GoalStatus["status"],
): Promise<void> {
  await setGoalStatus(id, status)
  revalidatePath("/")
  revalidatePath("/goals")
}

export async function addQuoteAction(formData: FormData): Promise<void> {
  const text = String(formData.get("text") ?? "")
  const author = String(formData.get("author") ?? "").trim()
  if (!text.trim()) return
  await addQuote(text, author || undefined)
  revalidatePath("/")
}

/**
 * Parse a holding from form fields. Returns null when required fields are
 * missing or non-numeric — the actions below ignore such submissions (no
 * write, no commit), mirroring how an empty task title is ignored. Value
 * normalization (trim, case, enum, range) lives in the data layer.
 */
function holdingInputFromForm(formData: FormData): HoldingInput | null {
  const ticker = String(formData.get("ticker") ?? "").trim()
  const name = String(formData.get("name") ?? "").trim()
  const assetType = String(formData.get("assetType") ?? "")
  const account = String(formData.get("account") ?? "").trim()
  const shares = Number(formData.get("shares"))
  const avgCost = Number(formData.get("avgCost"))
  const quoteCurrency = String(formData.get("quoteCurrency") ?? "").trim()
  if (!ticker || !name || !account || !quoteCurrency) return null
  if (!Number.isFinite(shares) || shares <= 0) return null
  if (!Number.isFinite(avgCost) || avgCost < 0) return null
  return { ticker, name, assetType, account, shares, avgCost, quoteCurrency }
}

export async function addHoldingAction(formData: FormData): Promise<void> {
  const input = holdingInputFromForm(formData)
  if (!input) return
  await addHolding(input)
  revalidatePath("/investments")
}

export async function updateHoldingAction(
  id: string,
  formData: FormData,
): Promise<void> {
  const input = holdingInputFromForm(formData)
  if (!input) return
  await updateHolding(id, input)
  revalidatePath("/investments")
}

export async function deleteHoldingAction(id: string): Promise<void> {
  await deleteHolding(id)
  revalidatePath("/investments")
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
