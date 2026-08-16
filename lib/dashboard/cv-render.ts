/**
 * CV rendering — markdown to the printable HTML both output paths share.
 *
 * There is exactly one renderer on purpose. `npm run cv:pdf` prints this HTML
 * headlessly through an installed browser, and the dashboard's print view
 * ([app/jobs/[slug]/cv/page.tsx](../../app/jobs/%5Bslug%5D/cv/page.tsx)) shows
 * the same markup with the same stylesheet — so the fallback the script points
 * at when no browser is installed produces the same document, not a different
 * one that happens to look similar.
 *
 * Framework-free (no `server-only`, no dependencies) like the other
 * `*-content.ts` modules: the CLI script, the server and the tests all use it.
 * The markdown subset is deliberately the subset a CV needs — headings, lists,
 * emphasis, links, rules — rather than a general markdown engine we would have
 * to vendor.
 */

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (ch) => ESCAPES[ch]!)
}

/** Inline markdown: links, bold, italic, code. Escaped first, so no HTML passes through. */
function inline(text: string): string {
  return escapeHtml(text)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, href: string) =>
      // Only http(s) and mailto: survive — a CV never needs anything else, and
      // `javascript:` in a document you print is nothing but a hazard.
      /^(https?:|mailto:)/i.test(href)
        ? `<a href="${href}">${label}</a>`
        : label,
    )
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
}

/** Drop a leading YAML frontmatter block — metadata is not part of the document. */
export function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "")
}

/**
 * Render CV markdown to an HTML fragment (no `<html>` wrapper), for embedding
 * in the print document below or in the dashboard page.
 */
export function renderCvBody(markdown: string): string {
  const lines = stripFrontmatter(markdown).replace(/\r\n/g, "\n").split("\n")
  const out: string[] = []
  let list: "ul" | "ol" | null = null
  let paragraph: string[] = []

  const closeList = (): void => {
    if (list) out.push(`</${list}>`)
    list = null
  }
  const closeParagraph = (): void => {
    if (paragraph.length > 0) out.push(`<p>${inline(paragraph.join(" "))}</p>`)
    paragraph = []
  }
  const openList = (kind: "ul" | "ol"): void => {
    if (list === kind) return
    closeList()
    out.push(`<${kind}>`)
    list = kind
  }

  for (const line of lines) {
    const text = line.trim()

    if (text === "") {
      closeParagraph()
      closeList()
      continue
    }

    const heading = /^(#{1,4})\s+(.*\S)\s*$/.exec(text)
    if (heading) {
      closeParagraph()
      closeList()
      const level = heading[1]!.length
      out.push(`<h${level}>${inline(heading[2]!)}</h${level}>`)
      continue
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(text)) {
      closeParagraph()
      closeList()
      out.push("<hr />")
      continue
    }

    const bullet = /^[-*]\s+(.*\S)\s*$/.exec(text)
    if (bullet) {
      closeParagraph()
      openList("ul")
      out.push(`<li>${inline(bullet[1]!)}</li>`)
      continue
    }

    const numbered = /^\d+[.)]\s+(.*\S)\s*$/.exec(text)
    if (numbered) {
      closeParagraph()
      openList("ol")
      out.push(`<li>${inline(numbered[1]!)}</li>`)
      continue
    }

    closeList()
    paragraph.push(text)
  }

  closeParagraph()
  closeList()
  return out.join("\n")
}

/**
 * The print stylesheet: A4, conservative margins, and page-break rules that
 * keep a role's heading with its bullets. Plain CSS with no custom properties,
 * because it is served both inside the dashboard and to a headless browser that
 * loads nothing else.
 *
 * Every property a browser would normally supply by default (heading weights,
 * list markers) is stated explicitly. Otherwise the two paths diverge: Tailwind's
 * preflight strips them inside the dashboard while the headless browser keeps
 * them, and the "same document" promise quietly stops being true.
 */
export const CV_PRINT_CSS = `
.cv-document {
  color: #111;
  background: #fff;
  font-family: ui-sans-serif, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
  font-size: 10.5pt;
  line-height: 1.45;
  max-width: 21cm;
  margin: 0 auto;
  padding: 1.6cm 1.8cm;
}
.cv-document h1 { font-size: 19pt; font-weight: 700; margin: 0 0 2pt; letter-spacing: -0.01em; }
.cv-document h2 {
  font-size: 11.5pt;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin: 16pt 0 6pt;
  padding-bottom: 3pt;
  border-bottom: 0.6pt solid #999;
}
.cv-document h3 { font-size: 11pt; font-weight: 700; margin: 10pt 0 2pt; }
.cv-document h4 { font-size: 10.5pt; font-weight: 600; margin: 8pt 0 2pt; }
.cv-document p { margin: 0 0 6pt; }
.cv-document ul { list-style: disc outside; }
.cv-document ol { list-style: decimal outside; }
.cv-document ul, .cv-document ol { margin: 0 0 8pt; padding-left: 16pt; }
.cv-document li { margin: 0 0 2pt; }
.cv-document strong { font-weight: 700; }
.cv-document em { font-style: italic; }
.cv-document a { color: inherit; text-decoration: underline; }
.cv-document code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 9.5pt; }
.cv-document hr { border: 0; border-top: 0.6pt solid #ccc; margin: 10pt 0; }
.cv-document h2, .cv-document h3, .cv-document h4 { break-after: avoid; page-break-after: avoid; }
.cv-document li, .cv-document p { break-inside: avoid; page-break-inside: avoid; }
@page { size: A4; margin: 0; }
`

/**
 * A complete, standalone HTML document — what the headless browser prints.
 * Self-contained by necessity: no network, no fonts, no scripts.
 */
export function renderCvDocument(markdown: string, title: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
html, body { margin: 0; padding: 0; background: #fff; }
${CV_PRINT_CSS}
</style>
</head>
<body>
<article class="cv-document">
${renderCvBody(markdown)}
</article>
</body>
</html>
`
}
