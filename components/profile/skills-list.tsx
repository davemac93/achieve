import type { ProfileSkill, SkillLevel } from "@/lib/dashboard/types"

/**
 * Skills as the `/profile` skill maintains them — read-only here. The dashboard
 * never writes `profile/skills.yaml`; it only appends the evidence that earns a
 * promotion, which `/profile` then proposes and the user approves.
 */

/** Darker chip the further up the ladder, so the shape of a profile reads fast. */
const LEVEL_CLASS: Record<SkillLevel, string> = {
  basic: "border-border text-muted-foreground border",
  working: "bg-accent text-accent-foreground",
  strong: "bg-primary/80 text-primary-foreground",
  expert: "bg-primary text-primary-foreground",
}

export function SkillsList({ skills }: { skills: ProfileSkill[] }) {
  return (
    <ul className="divide-border divide-y">
      {skills.map((skill) => (
        <li
          key={skill.skill}
          className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0"
        >
          <div className="flex flex-col">
            <span className="text-sm">{skill.skill}</span>
            <span className="text-muted-foreground text-xs">
              {skill.evidenceCount} evidence
              {skill.evidenceCount === 1 ? " record" : " records"}
              {skill.lastUsed ? ` · last used ${skill.lastUsed}` : ""}
            </span>
          </div>
          <span
            className={`${LEVEL_CLASS[skill.level]} rounded-full px-2 py-0.5 text-xs`}
          >
            {skill.level}
          </span>
        </li>
      ))}
    </ul>
  )
}
