import type { EvidenceRecord } from "@/lib/dashboard/types"

/** Date only — the time of day adds nothing to a completion trail. */
function day(when: string): string {
  return when.slice(0, 10)
}

/**
 * The append-only evidence log, newest first. The dashboard is its only writer
 * (a ticked, skill-tagged step appends one record); `/profile` reads it to
 * propose promotions. Nothing here edits or removes a record — the trail is the
 * point.
 */
export function EvidenceList({ evidence }: { evidence: EvidenceRecord[] }) {
  return (
    <ul className="divide-border divide-y">
      {evidence.map((record) => (
        <li
          key={record.id}
          className="flex items-baseline justify-between gap-4 py-2 first:pt-0 last:pb-0"
        >
          <div className="flex flex-col">
            <span className="text-sm">{record.what}</span>
            <span className="text-muted-foreground text-xs">
              {record.skill} · {record.source}
            </span>
          </div>
          <span className="text-muted-foreground shrink-0 text-xs">
            {day(record.when)}
          </span>
        </li>
      ))}
    </ul>
  )
}
