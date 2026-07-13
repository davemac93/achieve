import type { PortfolioSummary, PriceData } from "@/lib/dashboard/valuation"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const pln = new Intl.NumberFormat("pl-PL", {
  style: "currency",
  currency: "PLN",
})

const asOfFormat = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "short",
  timeStyle: "short",
})

function freshness(source: PriceData["source"], asOf: string | null): {
  title: string
  detail: string
} {
  if (source === "live" && asOf) {
    return { title: "Live", detail: `as of ${asOfFormat.format(new Date(asOf))}` }
  }
  if (source === "snapshot" && asOf) {
    return {
      title: "Cached",
      detail: `last fetched ${asOfFormat.format(new Date(asOf))} — live quotes unavailable`,
    }
  }
  return { title: "Unavailable", detail: "showing cost basis only" }
}

export function SummaryCards({
  summary,
  source,
  asOf,
}: {
  summary: PortfolioSummary
  source: PriceData["source"]
  asOf: string | null
}) {
  const prices = freshness(source, asOf)
  const gain = summary.plPln >= 0
  const partial =
    summary.pricedCount > 0 && summary.pricedCount < summary.totalCount

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader>
          <CardDescription>Portfolio value</CardDescription>
          <CardTitle className="text-2xl tabular-nums">
            {pln.format(summary.valuePln)}
          </CardTitle>
          <CardDescription>
            cost basis {pln.format(summary.costPln)}
            {partial
              ? ` · ${summary.pricedCount}/${summary.totalCount} holdings priced`
              : null}
          </CardDescription>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>Profit / loss</CardDescription>
          <CardTitle
            className={`text-2xl tabular-nums ${
              gain
                ? "text-emerald-600 dark:text-emerald-500"
                : "text-red-600 dark:text-red-500"
            }`}
          >
            {gain ? "+" : ""}
            {pln.format(summary.plPln)}
          </CardTitle>
          <CardDescription>
            {summary.plPct !== null
              ? `${gain ? "+" : ""}${summary.plPct.toFixed(2)}% on cost`
              : "—"}
          </CardDescription>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>Prices</CardDescription>
          <CardTitle className="text-2xl">{prices.title}</CardTitle>
          <CardDescription>{prices.detail}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
