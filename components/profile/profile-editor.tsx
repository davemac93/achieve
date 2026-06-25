"use client"

import * as React from "react"

import { saveProfileAction } from "@/app/actions"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

/**
 * Edits `user.md` directly (the human write path). Writes through the server
 * action — the browser never touches disk. The `/profile` skill is the other,
 * approve-gated writer.
 */
export function ProfileEditor({ content }: { content: string }) {
  const [isPending, startTransition] = React.useTransition()
  const [saved, setSaved] = React.useState(false)

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          await saveProfileAction(formData)
          setSaved(true)
        })
      }}
      className="flex flex-col gap-3"
    >
      <Textarea
        name="content"
        defaultValue={content}
        onChange={() => setSaved(false)}
        placeholder="# User profile&#10;&#10;Tell Claude Code who you are…"
        className="min-h-96 font-mono text-sm"
        spellCheck={false}
        required
      />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save profile"}
        </Button>
        {saved && !isPending ? (
          <span className="text-muted-foreground text-sm">Saved</span>
        ) : null}
      </div>
    </form>
  )
}
