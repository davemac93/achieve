import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getPriceData, parseChartPrice, resetPriceCache } from '../lib/dashboard/prices.ts'
import { priceHoldings, summarize } from '../lib/dashboard/valuation.ts'
import type { PriceData } from '../lib/dashboard/valuation.ts'
import type { Holding } from '../lib/dashboard/types.ts'

const vwce: Holding = {
  id: 'h1',
  ticker: 'VWCE.DE',
  name: 'Vanguard FTSE All-World',
  assetType: 'etf',
  account: 'IKE',
  shares: 10,
  avgCost: 500, // PLN per share as paid → cost basis 5000 PLN
  quoteCurrency: 'EUR',
}

const gpw: Holding = {
  id: 'h2',
  ticker: 'PKN',
  name: 'Orlen',
  assetType: 'stock',
  account: 'IKE',
  shares: 100,
  avgCost: 60,
  quoteCurrency: 'PLN',
}

function chartPayload(price: number): unknown {
  return { chart: { result: [{ meta: { regularMarketPrice: price } }] } }
}

/** Prices by Yahoo symbol; a fetch-stub serving the chart endpoint. */
function stubYahoo(prices: Record<string, number>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input)
    const symbol = decodeURIComponent(
      url.split('/v8/finance/chart/')[1]!.split('?')[0]!,
    )
    const price = prices[symbol]
    if (price === undefined) {
      return Response.json({ chart: { result: null, error: { code: 'Not Found' } } })
    }
    return Response.json(chartPayload(price))
  }) as typeof fetch
}

const MARKET = { 'VWCE.DE': 125, PKN: 66, 'EURPLN=X': 4.4 }

describe('parseChartPrice', () => {
  it('extracts the regular market price', () => {
    expect(parseChartPrice(chartPayload(125))).toBe(125)
  })

  it('returns null for error payloads and junk', () => {
    expect(parseChartPrice({ chart: { result: null, error: {} } })).toBeNull()
    expect(parseChartPrice({})).toBeNull()
    expect(parseChartPrice(chartPayload(0))).toBeNull()
    expect(parseChartPrice(chartPayload(NaN))).toBeNull()
  })
})

describe('valuation math (PLN conversion)', () => {
  const data: PriceData = {
    quotes: { 'vwce.de': 125, pkn: 66 },
    fxToPln: { EUR: 4.4 },
    asOf: '2026-07-10T15:35:12.000Z',
    source: 'live',
  }

  it('converts foreign quotes via FX and computes P/L', () => {
    const [h] = priceHoldings([vwce], data)
    expect(h!.costPln).toBe(5000)
    expect(h!.valuePln).toBe(10 * 125 * 4.4) // 5500 PLN
    expect(h!.plPln).toBe(500)
    expect(h!.plPct).toBeCloseTo(10)
  })

  it('values PLN-quoted holdings without FX', () => {
    const [h] = priceHoldings([gpw], data)
    expect(h!.valuePln).toBe(6600)
    expect(h!.plPln).toBe(600)
  })

  it('missing quote or FX rate yields null value, never NaN', () => {
    const noFx: PriceData = { ...data, fxToPln: {} }
    const [h] = priceHoldings([vwce], noFx)
    expect(h!.price).toBe(125) // quote known…
    expect(h!.valuePln).toBeNull() // …but unconvertible
    expect(h!.plPln).toBeNull()
  })

  it('summarize counts unpriced holdings at cost and reports coverage', () => {
    const partial: PriceData = { ...data, quotes: { pkn: 66 } }
    const summary = summarize(priceHoldings([vwce, gpw], partial))
    expect(summary.costPln).toBe(11000)
    expect(summary.valuePln).toBe(5000 + 6600) // vwce at cost, pkn live
    expect(summary.pricedCount).toBe(1)
    expect(summary.totalCount).toBe(2)
  })
})

describe('getPriceData degradation chain', () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'achieve-prices-'))
    process.env.ACHIEVE_VAULT_DIR = dir
    resetPriceCache()
  })

  afterEach(async () => {
    delete process.env.ACHIEVE_VAULT_DIR
    vi.unstubAllGlobals()
    vi.useRealTimers()
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('live fetch returns quotes and writes a self-gitignored snapshot', async () => {
    vi.stubGlobal('fetch', vi.fn(stubYahoo(MARKET)))

    const data = await getPriceData([vwce, gpw])

    expect(data.source).toBe('live')
    expect(data.quotes['vwce.de']).toBe(125)
    expect(data.fxToPln['EUR']).toBe(4.4)
    expect(data.asOf).toBeTruthy()

    const snapshot = JSON.parse(
      await fs.readFile(path.join(dir, '.cache', 'prices.json'), 'utf8'),
    )
    expect(snapshot.quotes['vwce.de']).toBe(125)
    // The cache dir must never enter the vault's git history.
    expect(await fs.readFile(path.join(dir, '.cache', '.gitignore'), 'utf8')).toBe('*\n')
  })

  it('serves the in-memory cache without refetching within the TTL', async () => {
    const fetcher = vi.fn(stubYahoo(MARKET))
    vi.stubGlobal('fetch', fetcher)

    await getPriceData([vwce, gpw])
    const calls = fetcher.mock.calls.length
    const again = await getPriceData([vwce, gpw])

    expect(again.source).toBe('live')
    expect(fetcher.mock.calls.length).toBe(calls) // no further requests
  })

  it('falls back to the on-disk snapshot when the fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(stubYahoo(MARKET)))
    const live = await getPriceData([vwce, gpw])

    resetPriceCache() // simulate a server restart: memory gone, snapshot on disk
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))))
    const cached = await getPriceData([vwce, gpw])

    expect(cached.source).toBe('snapshot')
    expect(cached.quotes).toEqual(live.quotes)
    expect(cached.asOf).toBe(live.asOf) // staleness label shows the original fetch time
  })

  it('backs off after a failure: page views inside the window fetch nothing', async () => {
    const fetcher = vi.fn(async () => Promise.reject(new Error('rate limited')))
    vi.stubGlobal('fetch', fetcher)

    await getPriceData([vwce, gpw]) // fails, opens the backoff window
    const calls = fetcher.mock.calls.length
    const during = await getPriceData([vwce, gpw])

    expect(fetcher.mock.calls.length).toBe(calls) // zero new requests
    expect(during.source).toBe('none') // no snapshot in this vault yet
  })

  it('retries after the backoff window, and success clears the failure state', async () => {
    vi.useFakeTimers({ now: new Date('2026-07-14T10:00:00Z') })
    const failing = vi.fn(async () => Promise.reject(new Error('rate limited')))
    vi.stubGlobal('fetch', failing)
    await getPriceData([vwce, gpw]) // opens the window at 10:00

    vi.setSystemTime(new Date('2026-07-14T10:11:00Z')) // window (10 min) expired
    const working = vi.fn(stubYahoo(MARKET))
    vi.stubGlobal('fetch', working)

    const after = await getPriceData([vwce, gpw])
    expect(after.source).toBe('live')
    expect(working).toHaveBeenCalled()

    // Success cleared the failure state: within the TTL we serve memory,
    // and nothing counts as being in backoff.
    const again = await getPriceData([vwce, gpw])
    expect(again.source).toBe('live')
  })

  it('returns source "none" with no network and no snapshot', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))))

    const data = await getPriceData([vwce])

    expect(data.source).toBe('none')
    expect(data.quotes).toEqual({})
    // The page then renders cost basis: valuation must not produce NaN.
    const summary = summarize(priceHoldings([vwce], data))
    expect(summary.valuePln).toBe(5000)
    expect(summary.pricedCount).toBe(0)
  })
})
