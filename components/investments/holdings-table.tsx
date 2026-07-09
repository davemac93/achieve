"use client"

import * as React from "react"
import { Pencil, Trash2 } from "lucide-react"

import {
  addHoldingAction,
  deleteHoldingAction,
  updateHoldingAction,
} from "@/app/actions"
import type { Holding } from "@/lib/dashboard/types"
import { ASSET_TYPES } from "@/lib/dashboard/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const pln = new Intl.NumberFormat("pl-PL", {
  style: "currency",
  currency: "PLN",
})

const shareCount = new Intl.NumberFormat("pl-PL", {
  maximumFractionDigits: 6,
})

export function HoldingsTable({ holdings }: { holdings: Holding[] }) {
  const [isPending, startTransition] = React.useTransition()
  const [editing, setEditing] = React.useState<Holding | null>(null)

  const selectClass =
    "border-input bg-transparent text-foreground h-9 rounded-md border px-3 py-1 text-sm shadow-xs"

  return (
    <div className="flex flex-col gap-4">
      {/* One form serves add and edit: picking a row loads it here. The key
          remounts the inputs so defaultValue reflects the selected holding. */}
      <form
        key={editing?.id ?? "add"}
        action={(formData) => {
          startTransition(async () => {
            if (editing) {
              await updateHoldingAction(editing.id, formData)
              setEditing(null)
            } else {
              await addHoldingAction(formData)
            }
          })
        }}
        className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-8"
      >
        <Input
          name="ticker"
          placeholder="Ticker"
          aria-label="Ticker"
          autoComplete="off"
          defaultValue={editing?.ticker}
        />
        <Input
          name="name"
          placeholder="Name"
          aria-label="Name"
          autoComplete="off"
          defaultValue={editing?.name}
          className="col-span-2"
        />
        <select
          name="assetType"
          aria-label="Asset type"
          defaultValue={editing?.assetType ?? "etf"}
          className={selectClass}
        >
          {ASSET_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <Input
          name="account"
          placeholder="Account (e.g. IKE)"
          aria-label="Account"
          autoComplete="off"
          defaultValue={editing?.account ?? "IKE"}
        />
        <Input
          name="shares"
          type="number"
          step="any"
          min="0"
          placeholder="Shares"
          aria-label="Shares"
          defaultValue={editing?.shares}
        />
        <Input
          name="avgCost"
          type="number"
          step="any"
          min="0"
          placeholder="Avg cost (PLN)"
          aria-label="Average cost per share in PLN"
          defaultValue={editing?.avgCost}
        />
        <div className="flex gap-2">
          <Input
            name="quoteCurrency"
            placeholder="Ccy"
            aria-label="Quote currency"
            autoComplete="off"
            maxLength={3}
            defaultValue={editing?.quoteCurrency ?? "PLN"}
            className="w-16"
          />
          <Button type="submit" disabled={isPending} className="flex-1">
            {editing ? "Save" : "Add"}
          </Button>
          {editing ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEditing(null)}
            >
              Cancel
            </Button>
          ) : null}
        </div>
      </form>

      {holdings.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No holdings yet. Add your first position above.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="px-2 py-2 font-medium">Ticker</th>
                <th className="px-2 py-2 font-medium">Name</th>
                <th className="px-2 py-2 font-medium">Type</th>
                <th className="px-2 py-2 font-medium">Account</th>
                <th className="px-2 py-2 text-right font-medium">Shares</th>
                <th className="px-2 py-2 text-right font-medium">
                  Avg cost (PLN)
                </th>
                <th className="px-2 py-2 text-right font-medium">
                  Cost basis (PLN)
                </th>
                <th className="px-2 py-2" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => (
                <tr key={h.id} className="group hover:bg-accent/50 border-b">
                  <td className="px-2 py-2 font-medium">{h.ticker}</td>
                  <td className="px-2 py-2">{h.name}</td>
                  <td className="text-muted-foreground px-2 py-2">
                    {h.assetType}
                  </td>
                  <td className="px-2 py-2">
                    <span className="bg-accent text-muted-foreground rounded px-1.5 py-0.5 text-xs">
                      {h.account}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {shareCount.format(h.shares)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {pln.format(h.avgCost)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {pln.format(h.shares * h.avgCost)}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label={`Edit ${h.ticker}`}
                        onClick={() => setEditing(h)}
                      >
                        <Pencil className="text-muted-foreground size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label={`Delete ${h.ticker}`}
                        onClick={() =>
                          startTransition(() => deleteHoldingAction(h.id))
                        }
                      >
                        <Trash2 className="text-muted-foreground size-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
