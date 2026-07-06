import { getNotes } from "@/lib/dashboard/notes"
import { NotesBrowser } from "@/components/notes/notes-browser"
import { SectionPlaceholder } from "@/components/section-placeholder"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default async function NotesPage() {
  // The dashboard is the human's own surface, so it lists every note —
  // including `type: private`, which is excluded only from *agent* surfaces.
  const notes = await getNotes()

  if (notes.length === 0) {
    return (
      <SectionPlaceholder
        title="Notes"
        description="Your notes from the vault’s notes/ directory."
        note="No notes yet. Run the /note skill in Claude Code to capture one; it shows up here to browse and read."
      />
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notes</CardTitle>
        <CardDescription>
          Written by the /note skill — read-only here. Filter by type, click to read.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <NotesBrowser notes={notes} />
      </CardContent>
    </Card>
  )
}
