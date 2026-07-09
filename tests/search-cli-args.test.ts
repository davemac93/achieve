import { describe, expect, it } from 'vitest'

import { parseSearchArgs } from '../lib/search/cli-args.ts'

describe('parseSearchArgs', () => {
  it('joins a multi-word query with no flags', () => {
    expect(parseSearchArgs(['how', 'do', 'I', 'scale', 'pods'])).toEqual({
      query: 'how do I scale pods',
    })
  })

  it('parses a single quoted-argument query with no flags', () => {
    expect(parseSearchArgs(['how do I scale pods'])).toEqual({
      query: 'how do I scale pods',
    })
  })

  it('extracts --k and leaves it out of the query', () => {
    expect(parseSearchArgs(['kubernetes', 'pods', '--k', '3'])).toEqual({
      query: 'kubernetes pods',
      k: 3,
    })
  })

  it('handles --k appearing before the query text', () => {
    expect(parseSearchArgs(['--k', '2', 'kubernetes'])).toEqual({
      query: 'kubernetes',
      k: 2,
    })
  })

  it('returns an empty query for empty argv', () => {
    expect(parseSearchArgs([])).toEqual({ query: '' })
  })
})
