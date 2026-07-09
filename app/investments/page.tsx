import { getHoldings } from "@/lib/dashboard/investments"
import { HoldingsTable } from "@/components/investments/holdings-table"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default async function InvestmentsPage() {
  const holdings = await getHoldings()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Investments</CardTitle>
        <CardDescription>
          Your holdings at cost basis — what you paid, in PLN. Live valuation
          arrives with the prices layer.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <HoldingsTable holdings={holdings} />
      </CardContent>
    </Card>
  )
}
