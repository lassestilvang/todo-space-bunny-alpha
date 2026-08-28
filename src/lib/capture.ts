import type { Label, Project } from '@/types'
import type { ParsedInput } from './nlp'
import { fmtDateKey, fmtTime } from './date'

/**
 * Turning typed text into task metadata, shared by the capture bar and the
 * calendar's inline field.
 *
 * Both surfaces must agree, so the resolution rules live here rather than in
 * whichever component happened to be written first.
 */

export type Chip = { label: string; value: string; color?: string }

/** The reading shown under the input: what the text was understood to mean. */
export function chipList(parsed: ParsedInput): Chip[] {
  const chips: Chip[] = []
  if (parsed.projects.length)
    chips.push({ label: '#', value: parsed.projects.join(', '), color: 'var(--color-c-mint)' })
  if (parsed.labels.length)
    chips.push({ label: '@', value: parsed.labels.join(', '), color: 'var(--color-c-lime)' })
  if (parsed.priority)
    chips.push({ label: 'P', value: String(parsed.priority), color: 'var(--color-c-rose)' })
  if (parsed.due)
    chips.push({
      label: 'date',
      value: fmtDateKey(parsed.due, { weekday: true, year: false }),
      color: 'var(--color-c-aqua)',
    })
  if (parsed.durationMin)
    chips.push({ label: 'for', value: `${parsed.durationMin}m`, color: 'var(--color-c-sand)' })
  if (parsed.dayPart && parsed.dayPart !== 'any')
    chips.push({ label: 'energy', value: parsed.dayPart, color: 'var(--color-c-saffron)' })
  if (parsed.recurrence)
    chips.push({ label: 'repeat', value: 'yes', color: 'var(--color-c-orchid)' })
  if (parsed.scheduledStart !== undefined)
    chips.push({
      label: 'block',
      value: `${fmtTime(parsed.scheduledStart)} – ${fmtTime(parsed.scheduledEnd ?? parsed.scheduledStart)}`,
      color: 'var(--signal)',
    })
  return chips
}

/** Name to id lookups, case-insensitive, for `#project` and `@label`. */
export function nameMaps(
  projects: Record<string, Project>,
  labels: Record<string, Label>,
): { projectByName: Map<string, string>; labelByName: Map<string, string> } {
  const projectByName = new Map<string, string>()
  for (const p of Object.values(projects)) projectByName.set(p.name.toLowerCase(), p.id)
  const labelByName = new Map<string, string>()
  for (const l of Object.values(labels)) labelByName.set(l.name.toLowerCase(), l.id)
  return { projectByName, labelByName }
}

export type ResolvedMeta = {
  title: string
  projectId?: string
  /** A project named in the text that does not exist yet. */
  newProjectName?: string
  labelIds: string[]
  priority: ParsedInput['priority']
  dayPart: ParsedInput['dayPart']
  recurrence: ParsedInput['recurrence']
}

/** The metadata a block gets from what you typed, ignoring anything time-like. */
export function metaFrom(
  parsed: ParsedInput,
  maps: { projectByName: Map<string, string>; labelByName: Map<string, string> },
): ResolvedMeta {
  const found = parsed.projects.map((n) => maps.projectByName.get(n.toLowerCase())).find(Boolean)
  return {
    title: parsed.title,
    projectId: found,
    newProjectName: found || !parsed.projects.length ? undefined : parsed.projects[0],
    labelIds: parsed.labels
      .map((n) => maps.labelByName.get(n.toLowerCase()))
      .filter((x): x is string => !!x),
    priority: parsed.priority,
    dayPart: parsed.dayPart,
    recurrence: parsed.recurrence,
  }
}