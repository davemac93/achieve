"use client"

import * as React from "react"

import { saveDiaryEntryAction } from "@/app/actions"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

/**
 * The dated-entry editor. Writes through the server action — the browser never
 * touches disk. `key={date}` on the textarea resets its content when the active
 * day changes (e.g. selecting a past entry).
 */
export function DiaryEditor({ date, content }: { date: string; content: string }) {
  const [isPending, startTransition] = React.useTransition()
  const [saved, setSaved] = React.useState(false)

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          await saveDiaryEntryAction(formData)
          setSaved(true)
        })
      }}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="date" value={date} />
      <Textarea
        key={date}
        name="content"
        defaultValue={content}
        onChange={() => setSaved(false)}
        placeholder="Write today's entry…"
        className="min-h-64"
        autoFocus
      />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save entry"}
        </Button>
        {saved && !isPending ? (
          <span className="text-muted-foreground text-sm">Saved</span>
        ) : null}
      </div>
    </form>
  )
}
