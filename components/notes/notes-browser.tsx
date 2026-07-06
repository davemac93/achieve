"use client"

import * as React from "react"
import Link from "next/link"

import type { Note } from "@/lib/dashboard/types"
import { Button } from "@/components/ui/button"

/** Just the date part of an ISO timestamp, avoiding locale/hydration drift. */
function day(created?: string): string {
  return created ? created.slice(0, 10) : ""
}

/**
 * Read-only notes browser: filter by `type`, click through to read. Notes are
 * read server-side and passed in as plain data — the browser never touches
 * disk; it only filters in memory.
 */
export function NotesBrowser({ notes }: { notes: Note[] }) {
  const types = React.useMemo(
    () => Array.from(new Set(notes.map((n) => n.type).filter(Boolean))).sort() as string[],
    [notes],
  )
  const [active, setActive] = React.useState<string>("all")

  const shown = active === "all" ? notes : notes.filter((n) => n.type === active)

  return (
    <div className="flex flex-col gap-4">
      {types.length > 0 ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter notes by type">
          <Button
            variant={active === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setActive("all")}
          >
            All
          </Button>
          {types.map((t) => (
            <Button
              key={t}
              variant={active === t ? "default" : "outline"}
              size="sm"
              onClick={() => setActive(t)}
            >
              {t}
            </Button>
          ))}
        </div>
      ) : null}

      {shown.length === 0 ? (
        <p className="text-muted-foreground text-sm">No notes of this type.</p>
      ) : (
        <ul className="divide-border divide-y">
          {shown.map((note) => (
            <li key={note.slug}>
              <Link
                href={`/notes/${note.slug}`}
                className="hover:bg-accent -mx-2 flex items-center justify-between gap-4 rounded-md px-2 py-2"
              >
                <div className="flex flex-col">
                  <span className="text-sm">{note.title}</span>
                  <span className="text-muted-foreground text-xs uppercase">
                    {note.type ?? "untyped"}
                    {note.type === "private" ? " · human-only" : ""}
                  </span>
                </div>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {day(note.created)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
