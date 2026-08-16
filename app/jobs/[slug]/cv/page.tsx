import Link from "next/link"
import { notFound } from "next/navigation"

import { getApplication } from "@/lib/dashboard/jobs"
import { CV_PRINT_CSS, renderCvBody } from "@/lib/dashboard/cv-render"

/**
 * The print-styled CV view — and the fallback `npm run cv:pdf` names when no
 * Chrome, Edge, Brave or Chromium is installed. It renders the same markup with
 * the same stylesheet the headless print uses
 * ([lib/dashboard/cv-render.ts](../../../../lib/dashboard/cv-render.ts)), so
 * Cmd-P here produces the same document, not a lookalike. The app chrome is
 * dropped at print time by the `@media print` rules in `globals.css`.
 *
 * `renderCvBody` escapes everything before it emits any tag, so the markdown
 * from the vault can never inject HTML here.
 */
export default async function CvPrintPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const application = await getApplication(slug)
  if (!application?.hasCv) notFound()

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CV_PRINT_CSS }} />
      <div className="text-muted-foreground flex items-center gap-4 text-xs print:hidden">
        <Link href={`/jobs/${slug}`} className="hover:underline">
          ← Back to {application.company}
        </Link>
        <span>
          Print to PDF with Cmd-P / Ctrl-P, or run{" "}
          <code>npm run cv:pdf jobs/{slug}</code>.
        </span>
      </div>
      <article
        className="cv-document rounded-md shadow-sm print:rounded-none print:shadow-none"
        dangerouslySetInnerHTML={{ __html: renderCvBody(application.cv) }}
      />
    </>
  )
}
