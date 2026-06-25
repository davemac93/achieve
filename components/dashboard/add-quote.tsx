"use client"

import * as React from "react"

import { addQuoteAction } from "@/app/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function AddQuote() {
  const [isPending, startTransition] = React.useTransition()
  const [open, setOpen] = React.useState(false)
  const formRef = React.useRef<HTMLFormElement>(null)

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Add a quote
      </Button>
    )
  }

  return (
    <form
      ref={formRef}
      action={(formData) => {
        startTransition(async () => {
          await addQuoteAction(formData)
          formRef.current?.reset()
          setOpen(false)
        })
      }}
      className="flex w-full flex-col gap-2"
    >
      <Input name="text" placeholder="Quote text" autoComplete="off" required />
      <Input name="author" placeholder="Author (optional)" autoComplete="off" />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          Save
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
