import "server-only"

import { openVault } from "@/lib/vault"
import type { Quote } from "@/lib/dashboard/types"

const REL = "quotes.yaml"

interface QuotesFile {
  quotes: Quote[]
  /** Index into `quotes` shown today; advanced by the rotation script. */
  current: number | null
}

async function readFile(): Promise<QuotesFile> {
  const vault = openVault()
  if (!(await vault.exists(REL))) return { quotes: [], current: null }
  const data = await vault.readYaml<QuotesFile | null>(REL)
  return { quotes: data?.quotes ?? [], current: data?.current ?? null }
}

/** The quote of the day, or null if there are none. */
export async function getCurrentQuote(): Promise<Quote | null> {
  const { quotes, current } = await readFile()
  if (quotes.length === 0) return null
  const index =
    current != null && current >= 0 && current < quotes.length ? current : 0
  return quotes[index] ?? null
}

/** Add a user-supplied quote. Dashboard is the human-add writer. */
export async function addQuote(text: string, author?: string): Promise<void> {
  const trimmed = text.trim()
  if (!trimmed) throw new Error("Quote text must not be empty.")

  const vault = openVault()
  const file = await readFile()
  const quotes = [...file.quotes, { text: trimmed, ...(author ? { author } : {}) }]
  // Point at the new quote if nothing was selected yet.
  const current = file.current ?? quotes.length - 1
  await vault.writeYaml(REL, { quotes, current }, { message: "dashboard: add quote" })
}
