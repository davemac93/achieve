import { describe, expect, it } from 'vitest'

import { chunkText } from '../lib/search/chunk.ts'

describe('chunkText', () => {
  it('keeps short text as a single chunk', () => {
    expect(chunkText('One short paragraph.')).toEqual(['One short paragraph.'])
  })

  it('packs multiple short paragraphs into one chunk under the limit', () => {
    const text = 'Para one.\n\nPara two.\n\nPara three.'
    expect(chunkText(text, { maxChars: 100 })).toEqual([
      'Para one.\n\nPara two.\n\nPara three.',
    ])
  })

  it('splits into a new chunk once the running total exceeds maxChars', () => {
    const text = 'a'.repeat(50) + '\n\n' + 'b'.repeat(50)
    const chunks = chunkText(text, { maxChars: 60 })
    expect(chunks).toEqual(['a'.repeat(50), 'b'.repeat(50)])
  })

  it('hard-splits a single paragraph longer than maxChars', () => {
    const text = 'x'.repeat(150)
    const chunks = chunkText(text, { maxChars: 60 })
    expect(chunks).toEqual(['x'.repeat(60), 'x'.repeat(60), 'x'.repeat(30)])
  })

  it('ignores blank paragraphs and empty input', () => {
    expect(chunkText('\n\n\n\n')).toEqual([])
    expect(chunkText('')).toEqual([])
  })
})
