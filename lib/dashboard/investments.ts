import "server-only"

import { randomUUID } from "node:crypto"

import { openVault } from "@/lib/vault"
import { ASSET_TYPES, type AssetType, type Holding } from "@/lib/dashboard/types"

const REL = "investments.yaml"

interface InvestmentsFile {
  holdings: Holding[]
}

/** Read all holdings. Returns an empty list if the file is missing or empty. */
export async function getHoldings(): Promise<Holding[]> {
  const vault = openVault()
  if (!(await vault.exists(REL))) return []
  const data = await vault.readYaml<InvestmentsFile | null>(REL)
  return data?.holdings ?? []
}

async function writeHoldings(holdings: Holding[], message: string): Promise<void> {
  const vault = openVault()
  await vault.writeYaml(REL, { holdings }, { message })
}

/** The user-editable fields of a holding (everything but the id). */
export interface HoldingInput {
  ticker: string
  name: string
  assetType: string
  account: string
  shares: number
  avgCost: number
  quoteCurrency: string
}

function normalizeHolding(input: HoldingInput): Omit<Holding, "id"> {
  const ticker = input.ticker.trim().toUpperCase()
  if (!ticker) throw new Error("Ticker must not be empty.")
  const name = input.name.trim()
  if (!name) throw new Error("Name must not be empty.")
  if (!ASSET_TYPES.includes(input.assetType as AssetType)) {
    throw new Error(`Asset type must be one of: ${ASSET_TYPES.join(", ")}.`)
  }
  const account = input.account.trim()
  if (!account) throw new Error("Account must not be empty.")
  if (!Number.isFinite(input.shares) || input.shares <= 0) {
    throw new Error("Shares must be a positive number.")
  }
  if (!Number.isFinite(input.avgCost) || input.avgCost < 0) {
    throw new Error("Average cost must be a non-negative number.")
  }
  const quoteCurrency = input.quoteCurrency.trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(quoteCurrency)) {
    throw new Error("Quote currency must be a 3-letter ISO code, e.g. PLN or EUR.")
  }
  return {
    ticker,
    name,
    assetType: input.assetType as AssetType,
    account,
    shares: input.shares,
    avgCost: input.avgCost,
    quoteCurrency,
  }
}

/** Add a holding. Returns the created holding. */
export async function addHolding(input: HoldingInput): Promise<Holding> {
  const holding: Holding = { id: randomUUID(), ...normalizeHolding(input) }
  const holdings = await getHoldings()
  await writeHoldings([...holdings, holding], "dashboard: add holding")
  return holding
}

/** Replace the editable fields of an existing holding. */
export async function updateHolding(id: string, input: HoldingInput): Promise<void> {
  const next = normalizeHolding(input)
  const holdings = await getHoldings()
  if (!holdings.some((h) => h.id === id)) {
    throw new Error(`No holding with id ${id}.`)
  }
  await writeHoldings(
    holdings.map((h) => (h.id === id ? { id, ...next } : h)),
    "dashboard: update holding"
  )
}

/** Delete a holding. */
export async function deleteHolding(id: string): Promise<void> {
  const holdings = await getHoldings()
  await writeHoldings(
    holdings.filter((h) => h.id !== id),
    "dashboard: delete holding"
  )
}
