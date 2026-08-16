<!--
CV template — primary writer: YOU. The /cv skill reads this file and fills it;
it never rewrites it.

This is the one place your CV's format is decided: the sections below, their
order, and the wording style of each. Change a heading, drop a section, add one
of your own — the next CV follows, and no skill code changes. Keep more than one
format by copying this file (cv-template-ats.md, cv-template-designed.md) and
telling /cv which to use.

How it is filled:
  - Every `{{placeholder}}` is replaced with a real fact from profile/ and
    profile/evidence.yaml. Nothing else is a source, and nothing is invented.
  - Repeatable blocks (roles, projects) are marked `<!-- repeat: ... -->` — the
    skill emits one per real entry, in the order the job description makes most
    relevant, and drops the block entirely when there is nothing to fill it.
  - These comments never appear in the produced cv.md.
  - A section with no honest content is dropped, not padded.
-->

# {{full name}}

{{title the profile actually supports}} · {{city}} · {{email}} · {{phone}} · {{links}}

## Personal summary

<!-- 3–4 sentences, re-weighted for this job: the experience the description
     asks for first, in the user's own register. Every claim traceable to a
     profile/ file. No adjectives the evidence does not earn. -->

{{summary}}

## Education

<!-- repeat: one per entry in profile/education.yaml, most recent first -->

**{{qualification}}**, {{institution}} — {{start}}–{{end}}

## Professional experience

<!-- repeat: one per file in profile/experience/, most recent first. Bullets are
     the achievements already written there, re-ordered and re-worded for this
     role — never new claims, never new numbers. -->

### {{title}}, {{company}} — {{start}}–{{end}}

- {{achievement most relevant to this job}}
- {{achievement}}
- {{achievement}}

*{{tech from the role's frontmatter, the job's stack first}}*

## Technical projects

<!-- repeat: projects that appear in profile/ (experience narratives) or in the
     vault's projects/ notes. Drop the section if there are none. -->

**{{project}}** — {{one line: what it is and what it demonstrates}}

## Core skills

<!-- From profile/skills.yaml only, strongest and most relevant first. Levels
     are the ones recorded there; the evidence log is what earned them. -->

{{skill}} · {{skill}} · {{skill}}
