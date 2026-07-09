/** Pure argv parsing for `scripts/search-vault.ts`, isolated so it's unit-testable. */

export interface SearchArgs {
  query: string
  k?: number
}

/** Parse `["<query words...>", "--k", "5"]`-shaped argv into `{ query, k }`. */
export function parseSearchArgs(argv: string[]): SearchArgs {
  const kFlagIndex = argv.indexOf('--k')
  const k = kFlagIndex !== -1 ? Number(argv[kFlagIndex + 1]) : undefined
  const query = argv
    .filter((_, i) => kFlagIndex === -1 || (i !== kFlagIndex && i !== kFlagIndex + 1))
    .join(' ')
    .trim()

  return k !== undefined ? { query, k } : { query }
}
