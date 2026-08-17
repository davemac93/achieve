import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

/**
 * The skill text with its line wrapping collapsed, so a contract can be matched
 * as the sentence it is rather than as the column the file happened to wrap at.
 */
async function fitnessSkill(): Promise<string> {
  const raw = await fs.readFile(
    path.join(repoRoot, 'template', '.claude', 'skills', 'fitness', 'SKILL.md'),
    'utf8',
  )
  return raw.replace(/\s*\n\s*/g, ' ')
}

/**
 * The `/fitness` skill is Claude-read prose, not code we can intercept — so its
 * hard contracts are guarded at the text level, exactly as `/invest-strategy`'s
 * refusal to give buy/sell orders is. Two of them are the reason this module
 * needed a decision rather than just an implementation:
 *
 *   1. **No medical or clinical advice.** Injuries, pain, medications and
 *      conditions go to a doctor or physiotherapist, every time.
 *   2. **Nutrition is out of v1.** No macros, no meal plans, no calorie targets.
 *
 * The rest — intake before plan, approve-gating, the write path, the photo and
 * diary walls — pins the shape the plan (decisions 20–23) locked in.
 */
describe('the /fitness skill states the medical boundary', () => {
  it('defers injuries, pain, medications and conditions to a professional', async () => {
    const skill = await fitnessSkill()
    expect(skill).toMatch(/no medical or clinical advice/i)
    expect(skill).toMatch(/doctor or (a )?physiotherapist/i)
    expect(skill).toMatch(/never clear anyone to train/i)
    // Recorded verbatim, never interpreted — the intake stores words, not a
    // diagnosis.
    expect(skill).toMatch(/Record limitations, don't interpret them/i)
    // …and the promise is repeated where the reader will actually be tempted.
    expect(skill).toMatch(/doctor's or physio's call/i)
  })

  it('says so in its description, where the / menu shows it', async () => {
    const skill = await fitnessSkill()
    expect(skill).toMatch(/never gives medical advice/i)
  })
})

describe('the /fitness skill excludes nutrition from v1', () => {
  it('rules out macros, calorie targets and meal plans by name', async () => {
    const skill = await fitnessSkill()
    expect(skill).toMatch(/Nutrition is out of scope in v1/i)
    expect(skill).toMatch(/No macros, no calorie targets, no meal plans/i)
    expect(skill).toMatch(/never tell the user what to eat/i)
    expect(skill).toMatch(/no nutrition/i) // in the description too
  })
})

describe('the /fitness skill runs the intake before it writes a plan', () => {
  it('names the six intake topics and says no plan comes first', async () => {
    const skill = await fitnessSkill()
    expect(skill).toMatch(/\*\*No plan is written before the intake exists\.\*\*/)
    for (const topic of [
      /Training history/i,
      /Limitations/i,
      /Equipment/i,
      /Days a week/i,
      /Level/i,
      /Time of day/i,
    ]) {
      expect(skill).toMatch(topic)
    }
  })

  it('persists the answers so the interview happens once', async () => {
    const skill = await fitnessSkill()
    expect(skill).toMatch(/fitness\/intake\.yaml/)
    expect(skill).toMatch(/skip anything the vault already answers/i)
    expect(skill).toMatch(/That is what "asked once" means/i)
  })

  it('never schedules more days than the intake allows', async () => {
    const skill = await fitnessSkill()
    expect(skill).toMatch(/may be lower than the intake's, never higher/i)
  })
})

describe('the /fitness skill is approve-gated and owns two files', () => {
  it('proposes first and writes only on approval', async () => {
    const skill = await fitnessSkill()
    expect(skill).toMatch(/Do \*\*not\*\* write anything yet/i)
    expect(skill).toMatch(/Never write without approval/i)
    expect(skill).toMatch(/Approve-gated/i) // in the description
  })

  it('writes intake.yaml and plan.md through the write script, nothing else', async () => {
    const skill = await fitnessSkill()
    expect(skill).toMatch(/exactly two files/i)
    expect(skill).toMatch(/scripts\/write-fitness\.ts/)
    expect(skill).toMatch(/never hand-edit `fitness\/`/i)
    // The logs are the dashboard's, the same rule that keeps /teach out of
    // learn/status.yaml: what happened is the user's claim, not the AI's.
    expect(skill).toMatch(/are the dashboard's/i)
    expect(skill).toMatch(/never log a session on the user's behalf/i)
    expect(skill).toMatch(/[Nn]ever write an adherence or progress number/)
  })
})

describe('the /fitness skill declares both privacy walls', () => {
  it('marks fitness/photos/ categorically off-limits, and says why', async () => {
    const skill = await fitnessSkill()
    expect(skill).toMatch(/`fitness\/photos\/` is categorically off-limits/i)
    expect(skill).toMatch(/gitignored \*and\* carries a permission deny rule/i)
    expect(skill).toMatch(/they\*\* attach the photo in the conversation/i)
    expect(skill).toMatch(/never gives medical advice|never reads the diary, private notes or progress photos/i)
  })

  it('marks the diary and private notes off-limits, in body and description', async () => {
    const skill = await fitnessSkill()
    expect(skill).toMatch(/`diary\/` is categorically off-limits/i)
    expect(skill).toMatch(/`type: private` notes are human-only/i)
    expect(skill).toMatch(/never reads the diary, private notes or progress photos/i)
  })
})
