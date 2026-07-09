/**
 * Pure text chunking — no I/O, no framework imports, so it is shared by the
 * indexing script and the tests without dragging in the vault or a model.
 *
 * Splits on paragraph boundaries and packs paragraphs into chunks up to
 * `maxChars`, hard-splitting any single paragraph that alone exceeds it.
 */

export interface ChunkOptions {
  maxChars?: number
}

const DEFAULT_MAX_CHARS = 800

export function chunkText(text: string, opts: ChunkOptions = {}): string[] {
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)

  const chunks: string[] = []
  let current = ''

  const flush = () => {
    if (current) chunks.push(current)
    current = ''
  }

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph
    if (candidate.length > maxChars && current) {
      flush()
      current = paragraph
    } else {
      current = candidate
    }

    while (current.length > maxChars) {
      chunks.push(current.slice(0, maxChars))
      current = current.slice(maxChars)
    }
  }
  flush()

  return chunks
}
