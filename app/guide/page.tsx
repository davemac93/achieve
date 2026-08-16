import Link from "next/link"
import { CheckCircle2, Circle } from "lucide-react"

import { getGuideProgress } from "@/lib/dashboard/guide"
import { getEnabledModuleIds } from "@/lib/dashboard/config"
import { guideStepsFor, type GuideStepKey } from "@/lib/modules/registry"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

interface Step {
  title: string
  /** What this step is and why it matters. */
  what: React.ReactNode
  /** Exactly how to do it — dashboard action or Claude Code command. */
  how: React.ReactNode
}

function K({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-accent rounded px-1 py-0.5 text-xs">{children}</code>
  )
}

function TabLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="underline underline-offset-2">
      {children}
    </Link>
  )
}

/** The prose for every step the registry can ask for. Typed as an exhaustive
 * record, so a new module's step cannot ship without its instructions. */
const STEPS: Record<GuideStepKey, Step> = {
  vaultReady: {
    title: "Scaffold your vault",
    what: (
      <>
        Everything you see in this dashboard lives as plain files in{" "}
        <K>vault/</K> on your disk — your data never leaves your machine, and
        every change is one git commit you can audit or revert.
      </>
    ),
    how: (
      <>
        Run <K>npm install</K>, then <K>npm run setup</K>, then{" "}
        <K>npm run dev</K>. If you can read this page, this step is likely
        already done.
      </>
    ),
  },
  profileFilled: {
    title: "Tell Claude who you are",
    what: (
      <>
        <K>vault/user.md</K> is loaded into every Claude Code session in the
        vault — it is how every skill knows who you are, what you're working
        toward, and how you like to be helped.
      </>
    ),
    how: (
      <>
        Edit it on the <TabLink href="/profile">Profile</TabLink> page (or by
        hand), replacing the placeholder lines. Later, <K>/profile</K> in
        Claude Code can refresh it from your goals, projects, and notes —
        always with your approval.
      </>
    ),
  },
  hasGoals: {
    title: "Decompose your goals",
    what: (
      <>
        The goal tree — 3-year → yearly → monthly → weekly — is the spine of
        the whole system: tasks link to weekly goals, and skills read it for
        context.
      </>
    ),
    how: (
      <>
        Run <K>/goals</K> in Claude Code (from the vault directory) and
        describe your vision; it proposes the tree and writes it only after
        you approve. The <TabLink href="/goals">Goals</TabLink> tab renders it
        read-only — click a status there to advance it.
      </>
    ),
  },
  hasTasks: {
    title: "Track your first task",
    what: (
      <>
        Daily to-dos live on the <TabLink href="/">Dashboard</TabLink>. Linking
        a task to a weekly goal is what makes the tree honest — actions trace
        to goals.
      </>
    ),
    how: (
      <>
        Add a task in the To-do card and pick a weekly goal from the dropdown
        (it appears once goals exist).
      </>
    ),
  },
  hasQuote: {
    title: "Start your quote rotation",
    what: (
      <>
        A quote of the day on the dashboard, rotated from your own collection.
      </>
    ),
    how: (
      <>
        Add one via the Quote card on the{" "}
        <TabLink href="/">Dashboard</TabLink>; <K>npm run rotate</K> advances
        the daily pick.
      </>
    ),
  },
  hasDiaryEntry: {
    title: "Write a diary entry",
    what: (
      <>
        The <TabLink href="/diary">Diary</TabLink> is the one corner of the
        vault that is yours alone: no AI agent or skill may ever read it — the
        vault even ships a hard permission deny rule for it.
      </>
    ),
    how: <>Open the Diary tab and write today's entry. That's it.</>,
  },
  hasNotes: {
    title: "Capture a note",
    what: (
      <>
        <TabLink href="/notes">Notes</TabLink> are typed (<K>working</K>,{" "}
        <K>learning</K>, <K>validation</K>, <K>private</K> — private ones are
        human-only). <K>learning</K> notes feed <K>/teach</K>, which quizzes
        you on your own material.
      </>
    ),
    how: (
      <>
        Run <K>/note</K> in Claude Code with whatever you want to capture; it
        summarizes, categorizes, and files it as one labeled commit.
      </>
    ),
  },
  hasProjects: {
    title: "Start a project",
    what: (
      <>
        <TabLink href="/projects">Projects</TabLink> are markdown files under{" "}
        <K>vault/projects/</K> — you write them by hand; skills read them for
        context.
      </>
    ),
    how: (
      <>
        Create <K>vault/projects/&lt;name&gt;.md</K> with a title heading and
        whatever structure suits you.
      </>
    ),
  },
  hasHoldings: {
    title: "Add your investments",
    what: (
      <>
        The <TabLink href="/investments">Investments</TabLink> tab tracks your
        holdings at cost basis in PLN and values them live (quotes + FX
        converted to PLN, cached, degrading gracefully offline).
      </>
    ),
    how: (
      <>
        Use the form on the Investments tab. Tickers are Yahoo Finance
        symbols: <K>VWCE.DE</K> (Xetra), <K>PKN.WA</K> (GPW), <K>AAPL</K>{" "}
        (US).
      </>
    ),
  },
  hasStrategy: {
    title: "Define your investment strategy",
    what: (
      <>
        A living document — <K>investments/strategy.md</K> — with your horizon,
        risk tolerance, contributions, IKE/IKZE plan, and target allocation.
        It is the yardstick company research is judged against.
      </>
    ),
    how: (
      <>
        Run <K>/invest-strategy</K> in Claude Code: it interviews you, verifies
        IKE/IKZE limits on the live web with citations, and writes only after
        you approve. Revise it any time the same way.
      </>
    ),
  },
  hasResearch: {
    title: "Research a candidate",
    what: (
      <>
        Dated, cited, scored reports under <K>investments/research/</K>, each
        ending in a strategy-fit verdict (<K>fits-strategy</K> …{" "}
        <K>avoid</K>) — never a buy/sell call. Reports share one fixed
        framework, so any two are comparable.
      </>
    ),
    how: (
      <>
        Run <K>/research-company &lt;ticker&gt;</K>; it fans out parallel
        research agents (business, financials, valuation, moat, risks) and
        judges the findings against your strategy. Requires the strategy step
        first.
      </>
    ),
  },
}

export default async function GuidePage() {
  const [progress, enabledModules] = await Promise.all([
    getGuideProgress(),
    getEnabledModuleIds(),
  ])
  // Only the enabled modules' steps, in the registry's onboarding order.
  const stepKeys = guideStepsFor(enabledModules)
  const done = stepKeys.filter((key) => progress[key]).length

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Getting started</CardTitle>
          <CardDescription>
            {done} of {stepKeys.length} steps done. Checkmarks are read live from
            your vault — complete a step anywhere (here or in Claude Code) and
            it ticks off on its own. Work top to bottom; each step builds on
            the previous ones.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-5">
            {stepKeys.map((key, i) => {
              const step = STEPS[key]
              const isDone = progress[key]
              return (
                <li key={key} className="flex gap-3">
                  {isDone ? (
                    <CheckCircle2
                      className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-500"
                      aria-label="Done"
                    />
                  ) : (
                    <Circle
                      className="text-muted-foreground/50 mt-0.5 size-5 shrink-0"
                      aria-label="Not done yet"
                    />
                  )}
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-medium">
                      {i + 1}. {step.title}
                    </p>
                    <p className="text-muted-foreground text-sm">{step.what}</p>
                    <p className="text-sm">{step.how}</p>
                  </div>
                </li>
              )
            })}
          </ol>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Going further</CardTitle>
          <CardDescription>
            Beyond the checklist, three more skills work with what you've built
            up.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground flex flex-col gap-2 text-sm">
          <p>
            <K>/teach</K> — an active-recall study session built from your{" "}
            <K>learning</K> notes; what sticks gets written back as a new note.
          </p>
          <p>
            <K>/validate-idea</K> — pressure-tests a business idea against live
            web evidence and files a cited verdict under <K>ideas/</K>.
          </p>
          <p>
            <K>/improve-process</K> — maps one of your workflows from the vault,
            then researches and discusses how to improve it.
          </p>
        </CardContent>
      </Card>
    </>
  )
}
