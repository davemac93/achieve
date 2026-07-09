---
name: search-vault
description: Semantic search over the vault's non-private notes and projects, via a local, file-based vector index (no server, no API key). Use when tag/keyword search or file navigation might miss something relevant — e.g. "what have I written about X", "find notes related to Y". Never reads the diary or private notes; returns nothing if the index hasn't been built yet.
---

# /search-vault — semantic search over notes and projects

Optional retrieval on top of plain file navigation. Once the vault has grown
past what tag/grep lookup comfortably covers, this finds relevant chunks by
meaning, not just keyword match. The core product never depends on this —
if the index doesn't exist yet, say so and fall back to normal file reads.

## What this searches

- `notes/*.md` **except** `type: private`.
- `projects/*.md` **except** `status: private`.
- Never `diary/` — it is not indexed, ever, by construction.

## How to use it

1. Check the index exists: `vault/.search-index/vault.db`. If it's missing or
   looks stale (you added/edited notes or projects since the last build),
   run `npm run index` first (first run downloads a small local embedding
   model — no API key, and every run after that is offline).
2. Query it:
   ```
   node scripts/search-vault.ts "<natural-language query>" [--k 5]
   ```
   This prints JSON: `[{ source, slug, title, text, distance }]`, most
   relevant first (lowest `distance`).
3. Use `slug` + `source` to open the full file (`notes/<slug>.md` or
   `projects/<slug>.md`) if you need more than the returned chunk.

## Boundaries

- Read-only — this skill never writes anything.
- `diary/` is categorically off-limits and is never indexed or searchable.
- `type: private` notes and `status: private` projects are excluded from the
  index at build time; if you ever see one of these slugs in a result, treat
  it as a bug and stop — do not read or quote it.
- If the index is absent, tell the user and offer to build it (`npm run
  index`) rather than silently failing — this is an optional add-on, not a
  required step.
