---
name: research-company
description: Research a company or ETF against your investment strategy — parallel research subagents (business, financials, valuation, moat, risks) fanned out by an orchestrator, synthesized into a dated, cited, scored report under investments/research/ with a strategy-fit verdict, never a buy/sell call. Use when the user asks "should I look at <ticker>", wants a company researched, or is weighing a purchase. Approve-gated; never reads the diary or private notes.
model: opus
effort: high
argument-hint: [ticker or company name]
---

# /research-company — evidence in, strategy-fit verdict out

Research one company or ETF the user is considering and write **one dated,
cited, scored report**: `investments/research/<YYYY-MM-DD>-<ticker>.md`. The
verdict is *fit against the user's own strategy* (`investments/strategy.md`),
never a generic buy/sell call. Default to skeptical: thin evidence lowers
scores and the verdict — optimism is not a data source.

## Requires a strategy — stop without one

If `investments/strategy.md` does not exist, **stop**: tell the user a fit
verdict needs a strategy to fit against, point them at `/invest-strategy`, and
write nothing. Do not improvise a strategy or fall back to generic judgment.

## What you own (and what you must not touch)

- You write **only** dated reports under **`investments/research/`** —
  `investments/research/<YYYY-MM-DD>-<ticker>.md`. Nothing else.
- Re-researching the same ticker on the same date **updates** the existing
  report instead of duplicating.
- You never write `investments/strategy.md` (that is `/invest-strategy`'s
  file), `investments.yaml` (the dashboard's), goals, tasks, notes, projects,
  reviews, `ideas/`, or `user.md`.

## Sources you MAY read

- `investments/strategy.md` — the rules the verdict is judged against.
- `investments.yaml` — current holdings (concentration and overlap matter).
- `user.md` and `goals.yaml` — context for the fit judgment.
- `notes/*.md` **except** any note whose frontmatter has `type: private`.
- The **web** — via the research subagents below.

## Sources you must NEVER read — privacy wall (non-negotiable)

- **`diary/` is categorically off-limits.** Never open, read, summarize, or
  quote any file under `diary/`. No exceptions, not even to "check."
- **`type: private` notes are human-only.** Never read their bodies.
- Diary or private content must never enter a report or influence a verdict.

## How to research — orchestrator + subagents

You are the **orchestrator**. Fan out **five research subagents in parallel**
(the Agent tool, one per dimension), then synthesize. Each subagent gets the
ticker/company name and its dimension's questions — **never vault content**:
subagents research the outside world; the strategy, holdings, and everything
personal stays with you.

Each subagent must: search the live web from several angles, read the strongest
sources properly before citing, **actively hunt for disconfirming evidence**,
and return structured findings — key facts each tied to an inline source URL, a
proposed **1–5 score** for its dimension with a one-line justification, and
what it looked for but could not verify.

1. **Business** — what the company does, how it makes money, segment mix.
2. **Financials** — revenue growth, margins, debt, cash-flow trend.
3. **Valuation** — multiples vs the company's own history and vs peers.
4. **Moat & competition** — durable advantage, competitive threats.
5. **Risks & catalysts** — concentration, regulation, governance, recent
   controversies, and near-term news/catalysts.

As orchestrator you then: **cross-check contradictions** between subagents
(don't average them away — resolve or report them), adjust scores where one
dimension's evidence undermines another's, judge **strategy fit** yourself
against `strategy.md` rule by rule, and assemble the report. For an ETF,
interpret dimensions sensibly (index method, TER and tracking for financials/
valuation; provider and liquidity for moat).

## The report — fixed framework, comparability is the point

Same skeleton every time, so any two reports are directly comparable. Scores
live in frontmatter (1–5; **for risks, 5 = low risk**) so tooling can rank
reports without parsing prose:

```markdown
---
type: research
date: <YYYY-MM-DD>
ticker: <ticker>
name: <company/ETF name>
verdict: fits-strategy | mixed | doesn't-fit | avoid
scores:
  business: <1-5>
  financials: <1-5>
  valuation: <1-5>
  moat: <1-5>
  risks: <1-5>
---

# <name> (<ticker>) — <YYYY-MM-DD>

## TL;DR
<3–5 sentences: what it is, the one thing that matters most, verdict + reason>

## Scorecard
| Dimension | Score | Why (one line) |
|---|---|---|

## What the company does
## Financial health
## Valuation
## Moat & competition
## Risks & red flags
## Recent developments & catalysts
## Strategy fit
<rule-by-rule check against strategy.md: which rules it satisfies, which it
violates, and how it interacts with current holdings>

## Sources
<numbered list of URLs actually used>
```

Every factual market claim carries an inline citation. Where subagents came
back empty-handed, say so in the relevant section — a gap is a finding.

## Hard boundary — fit, not orders

The verdict says whether the candidate **fits the user's strategy** — it never
says "buy" or "sell", never sizes a position, never times an entry. `avoid` is
reserved for disqualifying findings (red flags, strategy violations), not mere
mediocrity. The user decides; the report informs.

## Procedure

1. **Check** `investments/strategy.md` exists — if not, stop and point at
   `/invest-strategy` (see above).
2. **Resolve** the ticker with the user if ambiguous (company name → listing).
3. **Fan out** the five research subagents in parallel; while they run, read
   the strategy, holdings, and relevant non-private notes yourself.
4. **Synthesize**: cross-check contradictions, settle the five scores, judge
   strategy fit rule by rule, and draft the full report in the fixed framework.
5. **Propose** the report as a preview — verdict and reasoning first. Do
   **not** write anything yet.
6. **On approval**, write `investments/research/<YYYY-MM-DD>-<ticker>.md` —
   updating, not duplicating, if today's report for this ticker exists.

## Boundaries

- Skeptical by default: unverifiable claims are excluded, not softened.
- The report is a record; it never edits the strategy or holdings. If research
  reveals the *strategy* needs changing, say so and point at `/invest-strategy`.
