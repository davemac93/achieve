/**
 * Quote import — turning a user-supplied quote database (CSV, JSON or YAML)
 * into entries in the `quotes.yaml` pool.
 *
 * The pool is *curated by the user*, never fetched from an API and never
 * AI-generated: attributing a generated line to a real person is fabrication.
 * So the only way new quotes arrive is this importer and the dashboard's add
 * form, and both land in the same list — an import appends, so quotes typed in
 * the dashboard survive every import.
 *
 * Framework-free and side-effect free (no `server-only`, no disk access on its
 * own) so the `npm run quotes:import` script, the data layer and the tests can
 * all share it. `importQuotes` takes an already-opened `Vault` and routes the
 * mutation through it, inheriting the atomic-write + one-labeled-commit
 * guarantee rather than reimplementing it.
 *
 * Parsing is deliberately liberal about what real exports look like (BOM, CRLF,
 * any header order, quoted fields containing the delimiter) and strict about
 * what a quote *is*: every entry is validated before anything is written, so a
 * malformed file is rejected whole and leaves the pool untouched.
 */

import { parse } from "yaml"
import type { Vault } from "@/lib/vault"
import type { Quote } from "@/lib/dashboard/types"

const REL = "quotes.yaml"

/** The file formats a quote database may arrive in. */
export const QUOTE_FORMATS = ["csv", "json", "yaml"] as const

/** One of {@link QUOTE_FORMATS}. */
export type QuoteFormat = (typeof QUOTE_FORMATS)[number]

/** What an import did, for the script to report. */
export interface ImportResult {
  /** Entries actually appended to the pool. */
  added: number
  /** Entries skipped because their normalized text was already in the pool. */
  duplicates: number
  /** Size of the pool afterwards. */
  total: number
}

/**
 * Pick the format from a file extension. `.yml` is `.yaml`; anything else is
 * refused by name rather than guessed at, since guessing wrong would silently
 * import nonsense.
 */
export function formatForPath(filePath: string): QuoteFormat {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase()
  if (ext === ".csv") return "csv"
  if (ext === ".json") return "json"
  if (ext === ".yaml" || ext === ".yml") return "yaml"
  throw new Error(
    `Unsupported quote file ${JSON.stringify(filePath)}. Expected .csv, .json, .yaml or .yml.`,
  )
}

/**
 * Parse a quote database into validated entries. Throws on anything malformed —
 * the caller writes nothing when this throws, which is what makes a failed
 * import a no-op rather than a half-written pool.
 */
export function parseQuoteDatabase(raw: string, format: QuoteFormat): Quote[] {
  const entries = format === "csv" ? parseCsvEntries(raw) : parseDataEntries(raw, format)
  if (entries.length === 0) throw new Error("No quotes found in the file.")
  return entries
}

/**
 * The dedupe key: what makes two lines "the same quote" across databases that
 * differ only in typography. Curly quotes, apostrophes and dashes are folded to
 * ASCII, whitespace is collapsed, wrapping quotation marks are dropped and case
 * is ignored. Wording and punctuation beyond that stay significant — two
 * genuinely different renderings of a line are two quotes, not a false dupe.
 */
export function normalizeQuoteText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .trim()
    .toLowerCase()
}

/**
 * Append `incoming` to `existing`, dropping entries whose normalized text is
 * already present — in the pool or earlier in the same batch. Existing entries
 * are never rewritten: the pool's own copy of a quote (possibly hand-edited in
 * the dashboard) wins over the imported one.
 */
export function mergeQuotes(
  existing: Quote[],
  incoming: Quote[],
): { quotes: Quote[]; added: number; duplicates: number } {
  const seen = new Set(
    existing
      .map((q) => normalizeQuoteText(typeof q?.text === "string" ? q.text : ""))
      .filter(Boolean),
  )

  const quotes = [...existing]
  let duplicates = 0
  for (const quote of incoming) {
    const key = normalizeQuoteText(quote.text)
    if (seen.has(key)) {
      duplicates++
      continue
    }
    seen.add(key)
    quotes.push(quote)
  }

  return { quotes, added: quotes.length - existing.length, duplicates }
}

/**
 * Merge parsed entries into `quotes.yaml` through the vault I/O layer: one
 * labeled commit, atomically written. When every entry is a duplicate nothing
 * is written at all, so re-importing the same file costs no commit.
 *
 * Only the `quotes` list is touched — the `current` pointer belongs to
 * `npm run rotate`, and every other key is passed through untouched.
 */
export async function importQuotes(vault: Vault, incoming: Quote[]): Promise<ImportResult> {
  const data = (await vault.exists(REL))
    ? ((await vault.readYaml<Record<string, unknown> | null>(REL)) ?? {})
    : {}
  const existing = Array.isArray(data.quotes) ? (data.quotes as Quote[]) : []

  const { quotes, added, duplicates } = mergeQuotes(existing, incoming)
  if (added === 0) return { added: 0, duplicates, total: existing.length }

  await vault.writeYaml(
    REL,
    { ...data, quotes },
    { message: `quotes: import ${added} quote${added === 1 ? "" : "s"}` },
  )
  return { added, duplicates, total: quotes.length }
}

/* ------------------------------------------------------------------ parsing */

/**
 * Field names an entry may use. `quote` is accepted for `text` because it is
 * the header most public quote dumps ship with; everything else must be named
 * as the schema names it, so a typo surfaces as "missing text" rather than as
 * silently dropped attribution.
 */
const TEXT_KEYS = ["text", "quote"]

/** Strip a UTF-8 BOM, which Excel writes in front of the first header. */
function stripBom(raw: string): string {
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
}

/** JSON and YAML: either a bare array of entries, or `{ quotes: [...] }`. */
function parseDataEntries(raw: string, format: QuoteFormat): Quote[] {
  const text = stripBom(raw)
  let data: unknown
  try {
    data = format === "json" ? JSON.parse(text) : parse(text)
  } catch (err) {
    throw new Error(
      `Could not parse the file as ${format.toUpperCase()}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
  }

  const list = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data.quotes)
      ? data.quotes
      : null
  if (!list) {
    throw new Error(
      `Expected an array of quotes, or an object with a "quotes" array, in the ${format.toUpperCase()} file.`,
    )
  }

  return list.map((entry, i) => toQuote(entry, `entry ${i + 1}`))
}

/** CSV: headers in any order, extra columns ignored, blank lines skipped. */
function parseCsvEntries(raw: string): Quote[] {
  // Normalizing CRLF (and lone CR, from very old exports) up front keeps the
  // scanner below single-newline; a literal CR inside a quoted field would
  // only ever be trailing whitespace we trim anyway.
  const text = stripBom(raw).replace(/\r\n?/g, "\n")
  const rows = readCsvRows(text, sniffDelimiter(text))
  if (rows.length === 0) throw new Error("The CSV file is empty.")

  const headers = rows[0]!.map((h) => h.trim().toLowerCase())
  if (!headers.some((h) => TEXT_KEYS.includes(h))) {
    throw new Error(
      `The CSV has no "text" column (found: ${headers.filter(Boolean).join(", ") || "none"}).`,
    )
  }

  return rows.slice(1).map((cells, i) => {
    const record: Record<string, string> = {}
    headers.forEach((header, col) => {
      if (header) record[header] = cells[col] ?? ""
    })
    // Row numbers are the ones a spreadsheet shows, header included.
    return toQuote(record, `row ${i + 2}`)
  })
}

/**
 * Guess the delimiter from the header line: comma, semicolon (what Excel writes
 * in locales where the comma is the decimal separator) or tab. Counted outside
 * quotes so a quoted `"Doe, John"` in the header cannot vote.
 */
function sniffDelimiter(text: string): string {
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 }
  let quoted = false
  for (const ch of text) {
    if (ch === '"') quoted = !quoted
    else if (ch === "\n" && !quoted) break
    else if (!quoted && ch in counts) counts[ch]!++
  }
  const [best] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]!
  return counts[best]! > 0 ? best : ","
}

/**
 * RFC 4180 scanner: `""` escapes a quote inside a quoted field, and a quoted
 * field may contain the delimiter or a newline. Fully blank rows are dropped.
 */
function readCsvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (quoted) {
      if (ch !== '"') cell += ch
      else if (text[i + 1] === '"') {
        cell += '"'
        i++
      } else quoted = false
      continue
    }
    if (ch === '"' && cell.trim() === "") {
      cell = "" // a field is quoted from its start; leading spaces are noise
      quoted = true
    } else if (ch === delimiter) {
      row.push(cell)
      cell = ""
    } else if (ch === "\n") {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
    } else cell += ch
  }

  if (quoted) throw new Error("The CSV has an unterminated quoted field.")
  row.push(cell)
  rows.push(row)

  return rows.filter((r) => r.some((c) => c.trim() !== ""))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Validate one raw entry into a `Quote`. `text` is required; `author`, `source`
 * and `tags` are kept when present and dropped when blank, so attribution
 * survives the import intact without inventing empty fields.
 */
function toQuote(raw: unknown, where: string): Quote {
  if (!isRecord(raw)) throw new Error(`${where}: expected an object with a "text" field.`)

  const record: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) record[key.trim().toLowerCase()] = value

  const textKey = TEXT_KEYS.find((k) => record[k] !== undefined)
  const text = optionalString(textKey ? record[textKey] : undefined, `${where}: "text"`)
  if (!text) throw new Error(`${where}: missing a non-empty "text" field.`)

  const author = optionalString(record.author, `${where}: "author"`)
  const source = optionalString(record.source, `${where}: "source"`)
  const tags = optionalTags(record.tags, where)

  return {
    text,
    ...(author ? { author } : {}),
    ...(source ? { source } : {}),
    ...(tags.length ? { tags } : {}),
  }
}

function optionalString(value: unknown, where: string): string {
  if (value === undefined || value === null) return ""
  if (typeof value !== "string") throw new Error(`${where} must be text.`)
  return value.trim()
}

/** Tags arrive as a list (JSON/YAML) or as one delimited cell (CSV). */
function optionalTags(value: unknown, where: string): string[] {
  if (value === undefined || value === null) return []
  const list = Array.isArray(value)
    ? value.map((t) => optionalString(t, `${where}: "tags"`))
    : optionalString(value, `${where}: "tags"`).split(/[,;|]/)
  return list.map((t) => t.trim()).filter(Boolean)
}
