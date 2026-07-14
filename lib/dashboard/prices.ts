import "server-only"

import fs from "node:fs/promises"
import path from "node:path"

import { defaultVaultRoot } from "@/lib/vault"
import type { Holding } from "@/lib/dashboard/types"
import type { PriceData } from "@/lib/dashboard/valuation"

/**
 * Live market prices for the investments tab, from Yahoo Finance's chart
 * endpoint (the same no-key API yfinance uses; Stooq's CSV endpoint — the
 * original plan — is now behind an anti-bot wall). Holdings' tickers are Yahoo
 * symbols: `VWCE.DE` (Xetra), `PKN.WA` (GPW), `AAPL` (US); FX pairs are
 * `EURPLN=X`. Stale-while-revalidate with a three-layer degradation chain so
 * the page never breaks:
 *
 *   in-memory (TTL) → live fetch → on-disk snapshot → none (cost basis)
 *
 * The snapshot is derived external data, NOT vault content: it lives under
 * `vault/.cache/` (excluded from the vault's git history), is overwritten with
 * a plain atomic write after every successful fetch, and never produces a
 * vault commit — a page view must not pollute the vault's audit trail.
 */

const TTL_MS = 5 * 60 * 1000
const FETCH_TIMEOUT_MS = 8_000
const CACHE_DIR = ".cache"
const SNAPSHOT_FILE = "prices.json"

// Yahoo rejects default fetch user agents; identify as a browser.
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

interface Snapshot {
  /** The symbols this snapshot answers for (tickers + FX pairs). */
  symbols: string[]
  quotes: Record<string, number>
  fxToPln: Record<string, number>
  asOf: string
}

/**
 * After a failed live fetch, don't try again for this long — retrying on
 * every page view during an outage hammers (and, against a 429 rate limiter,
 * actively prolongs) the block. Fallbacks serve instantly meanwhile.
 */
const FAILURE_BACKOFF_MS = 10 * 60 * 1000

let memory: { snapshot: Snapshot; at: number } | null = null
let lastFailureAt: number | null = null

/** Drop the in-memory price cache (tests only — module state persists). */
export function resetPriceCache(): void {
  memory = null
  lastFailureAt = null
}

/**
 * Extract the last price from a Yahoo chart response
 * (`/v8/finance/chart/<symbol>`). Returns null for error payloads, unknown
 * symbols, or non-positive prices.
 */
export function parseChartPrice(payload: unknown): number | null {
  const meta = (
    payload as {
      chart?: { result?: Array<{ meta?: { regularMarketPrice?: unknown } }> }
    }
  )?.chart?.result?.[0]?.meta
  const price = meta?.regularMarketPrice
  return typeof price === "number" && Number.isFinite(price) && price > 0
    ? price
    : null
}

function chartUrl(symbol: string): string {
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`
}

async function fetchPrice(symbol: string): Promise<number | null> {
  const res = await fetch(chartUrl(symbol), {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  })
  if (!res.ok) return null
  return parseChartPrice(await res.json())
}

/** The FX pairs needed to convert the holdings' quote currencies to PLN. */
function fxSymbolsFor(holdings: Holding[]): Map<string, string> {
  const pairs = new Map<string, string>() // ccy → Yahoo symbol
  for (const h of holdings) {
    if (h.quoteCurrency !== "PLN" && !pairs.has(h.quoteCurrency)) {
      pairs.set(h.quoteCurrency, `${h.quoteCurrency}PLN=X`)
    }
  }
  return pairs
}

function snapshotPath(): string {
  return path.join(defaultVaultRoot(), CACHE_DIR, SNAPSHOT_FILE)
}

async function writeSnapshot(snapshot: Snapshot): Promise<void> {
  const dir = path.dirname(snapshotPath())
  await fs.mkdir(dir, { recursive: true })
  // Self-gitignore the cache dir so vaults scaffolded before template/.gitignore
  // gained `/.cache/` never commit derived price data to their audit trail.
  const ignore = path.join(dir, ".gitignore")
  await fs.writeFile(ignore, "*\n", { flag: "wx" }).catch(() => {})
  const tmp = path.join(dir, `.${SNAPSHOT_FILE}.${process.pid}.tmp`)
  await fs.writeFile(tmp, JSON.stringify(snapshot))
  await fs.rename(tmp, snapshotPath())
}

async function readSnapshot(): Promise<Snapshot | null> {
  try {
    return JSON.parse(await fs.readFile(snapshotPath(), "utf8")) as Snapshot
  } catch {
    return null
  }
}

function toPriceData(snapshot: Snapshot, source: PriceData["source"]): PriceData {
  return {
    quotes: snapshot.quotes,
    fxToPln: snapshot.fxToPln,
    asOf: snapshot.asOf,
    source,
  }
}

/**
 * Market data for the given holdings, degrading gracefully: fresh memory →
 * live fetch (updates memory + snapshot) → last on-disk snapshot →
 * `source: "none"` (the caller falls back to cost basis). Never throws.
 */
export async function getPriceData(holdings: Holding[]): Promise<PriceData> {
  if (holdings.length === 0) {
    return { quotes: {}, fxToPln: {}, asOf: null, source: "none" }
  }

  const tickers = [...new Set(holdings.map((h) => h.ticker))]
  const fxPairs = fxSymbolsFor(holdings)
  const requested = [...tickers, ...fxPairs.values()]

  if (
    memory &&
    Date.now() - memory.at < TTL_MS &&
    requested.every((s) => memory!.snapshot.symbols.includes(s))
  ) {
    return toPriceData(memory.snapshot, "live")
  }

  // Inside the failure backoff window: don't touch the network at all.
  if (lastFailureAt !== null && Date.now() - lastFailureAt < FAILURE_BACKOFF_MS) {
    return serveFallback()
  }

  try {
    const results = await Promise.all(
      requested.map(async (symbol) => {
        try {
          return [symbol, await fetchPrice(symbol)] as const
        } catch {
          return [symbol, null] as const
        }
      }),
    )
    const bySymbol = new Map(results)

    const quotes: Record<string, number> = {}
    for (const t of tickers) {
      const price = bySymbol.get(t)
      if (price != null) quotes[t.toLowerCase()] = price
    }
    const fxToPln: Record<string, number> = {}
    for (const [ccy, symbol] of fxPairs) {
      const rate = bySymbol.get(symbol)
      if (rate != null) fxToPln[ccy] = rate
    }

    // All symbols failing (offline, rate-limited) is a failed fetch, not a
    // live-but-empty result — fall through to the snapshot.
    if (Object.keys(quotes).length === 0) throw new Error("no quotes")

    const snapshot: Snapshot = {
      symbols: requested,
      quotes,
      fxToPln,
      asOf: new Date().toISOString(),
    }
    memory = { snapshot, at: Date.now() }
    lastFailureAt = null
    await writeSnapshot(snapshot)
    return toPriceData(snapshot, "live")
  } catch {
    // Offline or the API is unavailable — start the backoff window so page
    // views stop hammering the provider, and serve the fallback.
    lastFailureAt = Date.now()
    return serveFallback()
  }
}

/** The no-network answer: last on-disk snapshot, else cost-basis (`none`). */
async function serveFallback(): Promise<PriceData> {
  const snapshot = await readSnapshot()
  if (snapshot) return toPriceData(snapshot, "snapshot")
  return { quotes: {}, fxToPln: {}, asOf: null, source: "none" }
}
