import { getHoldings } from "@/lib/dashboard/investments"
import { getPriceData } from "@/lib/dashboard/prices"
import { priceHoldings, summarize } from "@/lib/dashboard/valuation"
import { HoldingsTable } from "@/components/investments/holdings-table"
import { SummaryCards } from "@/components/investments/summary-cards"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

// Prices are fetched per request (with their own TTL cache) — never prerender.
export const dynamic = "force-dynamic"

export default async function InvestmentsPage() {
  const holdings = await getHoldings()
  const prices = await getPriceData(holdings)
  const priced = priceHoldings(holdings, prices)
  const summary = summarize(priced)

  return (
    <>
      {holdings.length > 0 ? (
        <SummaryCards
          summary={summary}
          source={prices.source}
          asOf={prices.asOf}
        />
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Holdings</CardTitle>
          <CardDescription>
            Cost basis in PLN as paid; live quotes converted to PLN. Tickers
            are Yahoo Finance symbols (VWCE.DE, PKN.WA, AAPL).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HoldingsTable holdings={priced} />
        </CardContent>
      </Card>
    </>
  )
}
