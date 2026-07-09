/**
 * Pure valuation math for the investments tab. No I/O here — price data comes
 * from lib/dashboard/prices.ts and holdings from investments.ts; this module
 * joins them and converts everything to PLN. Kept side-effect free so the
 * conversion and P/L rules are trivially testable.
 */

import type { Holding } from "@/lib/dashboard/types"

/** Market data used to value holdings. */
export interface PriceData {
  /** Last price per lowercase ticker, in the instrument's quote currency. */
  quotes: Record<string, number>
  /** PLN per unit of foreign currency, keyed by ISO code (e.g. EUR → 4.3). */
  fxToPln: Record<string, number>
  /** ISO timestamp of when the quotes were fetched, null when unavailable. */
  asOf: string | null
  /** Where the data came from: a live fetch, the on-disk snapshot, or nowhere. */
  source: "live" | "snapshot" | "none"
}

export interface PricedHolding extends Holding {
  /** Last price in the instrument's quote currency, null when unavailable. */
  price: number | null
  costPln: number
  valuePln: number | null
  plPln: number | null
  plPct: number | null
}

export interface PortfolioSummary {
  costPln: number
  /** Total current value; holdings without a price are counted at cost. */
  valuePln: number
  plPln: number
  plPct: number | null
  pricedCount: number
  totalCount: number
}

/** PLN per unit of `quoteCurrency`, or null when the rate is unknown. */
export function plnRate(
  quoteCurrency: string,
  fxToPln: Record<string, number>,
): number | null {
  if (quoteCurrency === "PLN") return 1
  return fxToPln[quoteCurrency] ?? null
}

/** Join holdings with market data. Missing quote or FX rate → null value/P&L. */
export function priceHoldings(
  holdings: Holding[],
  data: PriceData,
): PricedHolding[] {
  return holdings.map((h) => {
    const price = data.quotes[h.ticker.toLowerCase()] ?? null
    const rate = plnRate(h.quoteCurrency, data.fxToPln)
    const costPln = h.shares * h.avgCost
    const valuePln =
      price !== null && rate !== null ? h.shares * price * rate : null
    const plPln = valuePln !== null ? valuePln - costPln : null
    const plPct =
      plPln !== null && costPln > 0 ? (plPln / costPln) * 100 : null
    return { ...h, price, costPln, valuePln, plPln, plPct }
  })
}

export function summarize(priced: PricedHolding[]): PortfolioSummary {
  const costPln = priced.reduce((sum, h) => sum + h.costPln, 0)
  const valuePln = priced.reduce((sum, h) => sum + (h.valuePln ?? h.costPln), 0)
  const plPln = valuePln - costPln
  return {
    costPln,
    valuePln,
    plPln,
    plPct: costPln > 0 ? (plPln / costPln) * 100 : null,
    pricedCount: priced.filter((h) => h.valuePln !== null).length,
    totalCount: priced.length,
  }
}
