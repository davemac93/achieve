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
import { setStepDone } from "@/lib/dashboard/goals"
import { saveDiaryEntry } from "@/lib/dashboard/diary"
import { saveProfile } from "@/lib/dashboard/profile"
import { appendEvidence, type EvidenceInput } from "@/lib/dashboard/evidence"

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

/**
 * Tick or untick a leaf goal step. Two writes can follow one click, each its
 * own labeled commit: the step's state, and — when the step carries a `skill:`
 * tag — a record in the append-only evidence log that a real piece of work
 * backs that skill.
 *
 * Unticking never retracts evidence: the log is append-only, and the work did
 * happen even if the step is reopened. `appendEvidence` is idempotent on
 * `(source, skill)`, so a re-tick never inflates a count either.
 */
export async function setStepDoneAction(id: string, done: boolean): Promise<void> {
  const step = await setStepDone(id, done)
  if (done && step.skill) {
    await appendEvidence({
      skill: step.skill,
      what: step.title,
      source: `goals:${step.id}`,
    })
    revalidatePath("/profile")
  }
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

/**
 * Append one record to the evidence log — the dashboard's half of the profile
 * writer split (the `/profile` skill owns `skills.yaml` and never writes here).
 *
 * This is the API tagged goal steps call when they are ticked (#77). Idempotent
 * on `(source, skill)`, so re-ticking a step never inflates the count.
 */
export async function recordEvidenceAction(input: EvidenceInput): Promise<void> {
  await appendEvidence(input)
  revalidatePath("/profile")
}
