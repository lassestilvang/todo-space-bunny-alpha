import type { Settings, Task, ID } from '@/types'
import { useStore } from './store'
import { planRange, toBlocks } from './planner'
import { addDays, fmtTime, fromKey, isToday, toKey, WEEKDAYS } from './date'
import { parseInput } from './nlp'
import { sortTasks } from './selectors'
import { proposeRoom, roomReply } from './room'

/**
 * The coach. Works with no network at all — the local planner understands the
 * calendar well enough to answer real questions and make real edits. If you
 * give it a key, the same surface routes through a real model.
 */

export type AssistantAction =
  | { type: 'add'; title: string; due?: string; start?: number; end?: number; priority?: number; project?: string; durationMin?: number }
  | { type: 'schedule'; match: string; when: string; durationMin?: number }
  | { type: 'unschedule'; match: string }
  | { type: 'complete'; match: string }
  | { type: 'delete'; match: string }
  | { type: 'priority'; match: string; priority: number }
  | { type: 'plan'; days?: number }
  /** Move a block to an exact range — used by the "make room" proposals. */
  | { type: 'move'; match: string; start: number; end: number }

/**
 * A choice the assistant offers rather than takes. Serializable, so it survives
 * the chat being persisted, and applying one is a single undoable step.
 */
export type AssistantOption = {
  id: string
  label: string
  detail: string
  action: AssistantAction
}

export type AssistantReply = {
  reply: string
  actions: AssistantAction[]
  /** Ways to carry out a request that is a negotiation, not an instruction. */
  options?: AssistantOption[]
  /** Set when the answer is purely informational. */
  data?: { kind: 'list'; items: { title: string; sub: string; id?: ID }[] }
}

/* ------------------------------------------------------------------ context */

function taskLine(t: Task): string {
  const bits: string[] = []
  bits.push(t.completed ? '[x]' : '[ ]')
  bits.push(`#${t.id}`)
  if (t.priority <= 2) bits.push(`P${t.priority}`)
  if (t.projectId) bits.push(`project=${t.projectId}`)
  bits.push(t.due ? `due=${t.due}` : 'no due date')
  if (t.scheduled) {
    bits.push(`block=${fmtTime(t.scheduled.start)}-${fmtTime(t.scheduled.end)}`)
    bits.push(`blockAt=${t.scheduled.start}`)
  }
  bits.push(`est=${t.durationMin}m`)
  bits.push(`energy=${t.energy}`)
  bits.push(`part=${t.dayPart}`)
  return `${t.title} ${bits.join(' ')}`
}

export function buildContext(): string {
  const s = useStore.getState()
  const projects = Object.values(s.projects)
    .map((p) => `${p.name}=${p.id}`)
    .join(', ')
  const today = toKey(new Date())
  const open = sortTasks(Object.values(s.tasks).filter((t) => !t.completed)).slice(0, 120)
  const events = Object.values(s.events)
    .filter((e) => e.start > Date.now() - 2 * 864e5)
    .sort((a, b) => a.start - b.start)
    .slice(0, 40)
    .map(
      (e) =>
        `${e.title} [${fmtTime(e.start)}-${fmtTime(e.end)} on ${toKey(e.start)}${
          e.locked ? ' locked' : ''
        }${e.tentative ? ' tentative' : ''}] id=${e.id}`,
    )
  const habits = Object.values(s.habits)
    .map((h) => `${h.name} ${h.anchorMin !== null ? `at ${fmtTime(new Date().setHours(0, 0, 0, 0) + h.anchorMin * 60000)}` : ''} id=${h.id}`)
    .join('; ')

  return [
    `Today is ${new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} (${today}).`,
    `Working hours ${fmtTime(new Date().setHours(0, 0, 0, 0) + s.settings.workStart * 60000)}-${fmtTime(
      new Date().setHours(0, 0, 0, 0) + s.settings.workEnd * 60000,
    )}, snap ${s.settings.snapMin}m, longest block ${s.settings.maxBlockMin}m.`,
    `Projects: ${projects || 'none'}`,
    `Habits: ${habits || 'none'}`,
    `Events:\n${events.join('\n') || 'none'}`,
    `Open tasks:\n${open.map(taskLine).join('\n') || 'none'}`,
  ].join('\n')
}

/* ------------------------------------------------------------------ apply */

function findTask(match: string): Task | undefined {
  const s = useStore.getState()
  const m = match.trim().toLowerCase()
  const open = Object.values(s.tasks).filter((t) => !t.completed)
  return (
    open.find((t) => t.title.toLowerCase() === m) ??
    open.find((t) => t.title.toLowerCase().startsWith(m)) ??
    open.find((t) => t.title.toLowerCase().includes(m)) ??
    open.find((t) => t.id === match)
  )
}

function resolveWhen(when: string, durationMin: number): { start: number; end: number } | null {
  const p = parseInput(when)
  if (p.scheduledStart !== undefined) {
    return { start: p.scheduledStart, end: p.scheduledEnd ?? p.scheduledStart + durationMin * 60000 }
  }
  if (p.due) {
    const start = fromKey(p.due).getTime() + 9 * 3600_000
    return { start, end: start + durationMin * 60000 }
  }
  const start = Date.now() + 3600_000
  return { start, end: start + durationMin * 60000 }
}

export function applyActions(actions: AssistantAction[]): string[] {
  const s = useStore.getState()
  const done: string[] = []

  for (const a of actions) {
    switch (a.type) {
      case 'add': {
        const project = a.project
          ? Object.values(s.projects).find((p) => p.name.toLowerCase() === a.project!.toLowerCase())?.id
          : undefined
        s.addTask({
          title: a.title,
          due: a.due ?? (a.start ? toKey(a.start) : undefined),
          dueHasTime: !!a.start,
          scheduled: a.start ? { start: a.start, end: a.end ?? a.start + (a.durationMin ?? 30) * 60000 } : null,
          priority: a.priority as Task['priority'] ?? undefined,
          durationMin: a.durationMin ?? 30,
          projectId: project,
          planLocked: !!a.start,
        })
        done.push(`Added “${a.title}”`)
        break
      }
      case 'schedule': {
        const t = findTask(a.match)
        if (!t) {
          done.push(`No open task matching “${a.match}”`)
          break
        }
        const r = resolveWhen(a.when, a.durationMin ?? t.durationMin)
        if (!r) break
        s.scheduleTask(t.id, r)
        done.push(`“${t.title}” → ${fmtTime(r.start)} on ${toKey(r.start)}`)
        break
      }
      case 'unschedule': {
        const t = findTask(a.match)
        if (!t) {
          done.push(`No open task matching “${a.match}”`)
          break
        }
        s.scheduleTask(t.id, null)
        done.push(`“${t.title}” taken off the calendar`)
        break
      }
      case 'complete': {
        const t = findTask(a.match)
        if (!t) {
          done.push(`No open task matching “${a.match}”`)
          break
        }
        s.toggleTask(t.id)
        done.push(`Completed “${t.title}”`)
        break
      }
      case 'delete': {
        const t = findTask(a.match)
        if (!t) {
          done.push(`No open task matching “${a.match}”`)
          break
        }
        s.deleteTask(t.id)
        done.push(`Deleted “${t.title}”`)
        break
      }
      case 'priority': {
        const t = findTask(a.match)
        if (!t) break
        s.updateTask(t.id, { priority: a.priority as Task['priority'] })
        done.push(`“${t.title}” → P${a.priority}`)
        break
      }
      case 'move': {
        const t = findTask(a.match)
        if (!t) {
          done.push(`No open task matching “${a.match}”`)
          break
        }
        s.scheduleTask(t.id, { start: a.start, end: a.end })
        done.push(`Moved “${t.title}” to ${fmtTime(a.start)}`)
        break
      }
      case 'plan': {
        const days = a.days ?? 1
        const from = toKey(new Date())
        const report = planRange(
          {
            tasks: Object.values(useStore.getState().tasks),
            events: Object.values(useStore.getState().events),
            habits: Object.values(useStore.getState().habits),
            settings: useStore.getState().settings,
          },
          from,
          days,
          { float: true, replan: false, maxPerDay: 8 },
        )
        s.applyPlan(toBlocks(report.placements))
        const min = report.placements
          .filter((p) => p.day === from)
          .reduce((acc, p) => acc + (p.end - p.start), 0)
        done.push(
          `Planned ${report.placements.length} blocks (${Math.floor(min / 60)}h ${
            min % 60
          }m on today)`,
        )
        break
      }
    }
  }
  return done
}

/* ------------------------------------------------------------------ local brain */

const WEEK_RE = /\b(next\s+)?(mon|tue|wed|thu|fri|sat|sun)(?:day|nesday|rsday|urday|nesday)?\b/i

function localRespond(input: string): AssistantReply | null {
  const s = useStore.getState()
  const q = input.trim()
  const lower = q.toLowerCase()
  const all = Object.values(s.tasks)
  const open = sortTasks(all.filter((t) => !t.completed))
  const todayKey = toKey(new Date())

  // "Free up an hour this afternoon" is a question about where to give up time,
  // not an instruction, so it comes back as options rather than a mutation.
  if (/\b(free up|make room|clear (my |the )?(afternoon|morning|evening|calendar)|open up|need an? (hour|slot)|find (me )?(an? )?(hour|slot)|block out an? hour)\b/.test(lower)) {
    const report = proposeRoom(all, Object.values(s.events), Object.values(s.habits), s.settings, Date.now(), q)
    return {
      reply: roomReply(report),
      actions: [],
      options: report.proposals.map((p) => ({ id: p.id, label: p.label, detail: p.detail, action: p.action })),
    }
  }

  if (/^(plan|schedule (my|the) day|autoplan|auto-plan|fit my day)\b/.test(lower)) {
    const report = planRange(
      { tasks: all, events: Object.values(s.events), habits: Object.values(s.habits), settings: s.settings },
      todayKey,
      3,
      { float: true, replan: false, maxPerDay: 8 },
    )
    const todays = report.placements.filter((p) => p.day === todayKey)
    if (!todays.length) {
      return { reply: 'There is no room left today. Something has to move.', actions: [] }
    }
    const min = todays.reduce((a, p) => a + (p.end - p.start), 0)
    return {
      reply: `I found ${todays.length} block${todays.length === 1 ? '' : 's'} that fit today — ${Math.floor(
        min / 60,
      )}h ${min % 60}m of focused work, starting at ${fmtTime(
        fromKey(todayKey).getTime() + todays[0].start * 60000,
      )}. Everything lands in a real gap, leaves a ${s.settings.bufferMin}-minute buffer, and respects your habit anchors.`,
      actions: [{ type: 'plan', days: 1 }],
    }
  }

  if (/\b(what|whats|what's|show|tell me).*(today|on today|now)\b/.test(lower) || lower === 'today') {
    const blocks = all
      .filter((t) => t.scheduled && isToday(t.scheduled.start))
      .sort((a, b) => a.scheduled!.start - b.scheduled!.start)
    const meetings = Object.values(s.events).filter((e) => !e.allDay && isToday(e.start))
    const plannedMin = blocks.reduce((a, t) => a + t.durationMin, 0)
    const freeMin = Math.max(0, s.settings.workEnd - s.settings.workStart - plannedMin)
    return {
      reply: blocks.length
        ? `Today has ${blocks.length} block${blocks.length === 1 ? '' : 's'} (${Math.floor(
            plannedMin / 60,
          )}h ${plannedMin % 60}m) and ${meetings.length} meeting${
            meetings.length === 1 ? '' : 's'
          }. That leaves about ${Math.floor(freeMin / 60)}h ${freeMin % 60}m unplanned. First up is “${
            blocks[0].title
          }” at ${fmtTime(blocks[0].scheduled!.start)}.`
        : `Today is completely open. ${open.length} task${open.length === 1 ? '' : 's'} are waiting — say “plan my day” and I will lay them out.`,
      actions: [],
      data: {
        kind: 'list',
        items: [
          ...blocks.map((t) => ({
            id: t.id,
            title: t.title,
            sub: `${fmtTime(t.scheduled!.start)} – ${fmtTime(t.scheduled!.end)}`,
          })),
          ...meetings.map((e) => ({
            id: e.id,
            title: e.title,
            sub: `${fmtTime(e.start)} – ${fmtTime(e.end)}`,
          })),
        ],
      },
    }
  }

  /* add a task: "add/remember/new …" */
  if (/^(add|remember|new|create|capture|remind me to)\b/.test(lower)) {
    const rest = q.replace(/^(add|remember|new|create|capture|remind me to)\s+/i, '')
    const p = parseInput(rest)
    const start = p.scheduledStart
    return {
      reply: start
        ? `Added “${p.title}” and put it on the calendar at ${fmtTime(start)}.`
        : p.due
          ? `Added “${p.title}” for ${p.due}. It has no time yet — drag it onto the grid or ask me to place it.`
          : `Added “${p.title}” to your inbox.`,
      actions: [
        {
          type: 'add',
          title: p.title,
          due: p.due,
          start,
          end: p.scheduledEnd,
          priority: p.priority,
          durationMin: p.durationMin,
          project: p.projects[0],
        },
      ],
    }
  }

  /* schedule a task */
  const sched = /^(schedule|block|put|move)\s+(.+?)\s+(?:for\s+)?(.*)$/i.exec(q)
  if (sched) {
    const match = sched[2]
    const whenRaw = sched[3] || 'tomorrow at 9am'
    const t = findTask(match)
    if (t) {
      const when = parseInput(whenRaw)
      let whenText = whenRaw
      const wk = WEEK_RE.exec(whenRaw)
      if (wk) {
        const target = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(wk[2].toLowerCase())
        const base = new Date()
        const delta = (target - base.getDay() + 7) % 7
        const d = addDays(base, wk[1] ? delta || 7 : delta)
        whenText = `${toKey(d)} ${when.due ? fmtTime(when.scheduledStart ?? d.getTime() + 9 * 36e5) : 'at 9am'}`
      }
      const p2 = parseInput(whenText)
      return {
        reply: `Moved “${t.title}” to ${p2.scheduledStart ? fmtTime(p2.scheduledStart) : 'the top of the day'}${
          p2.scheduledStart ? ` on ${toKey(p2.scheduledStart)}` : ''
        }, keeping its ${t.durationMin}-minute estimate.`,
        actions: [{ type: 'schedule', match: t.title, when: whenText, durationMin: t.durationMin }],
      }
    }
  }

  /* unschedule / complete / prioritise */
  const verb = /^(unschedule|unblock|remove from calendar|done|complete|finish|delete)\s+(.+)$/i.exec(q)
  if (verb) {
    const t = findTask(verb[2])
    if (t) {
      const v = verb[1].toLowerCase()
      if (v.startsWith('delete')) return { reply: `Deleted “${t.title}”.`, actions: [{ type: 'delete', match: t.title }] }
      if (v.startsWith('done') || v.startsWith('complete') || v.startsWith('finish'))
        return { reply: `Done — “${t.title}” is closed out.`, actions: [{ type: 'complete', match: t.title }] }
      return {
        reply: `“${t.title}” is back on the list. It will show up as not-yet-placed.`,
        actions: [{ type: 'unschedule', match: t.title }],
      }
    }
  }

  const prio = /^p([1-4])\s+(.+)$/i.exec(q)
  if (prio) {
    const t = findTask(prio[2])
    if (t)
      return {
        reply: `“${t.title}” is now P${prio[1]}.`,
        actions: [{ type: 'priority', match: t.title, priority: Number(prio[1]) }],
      }
  }

  /* push everything to tomorrow */
  if (/tomorrow/i.test(lower) && /(everything|all|rest)/i.test(lower)) {
    return {
      reply: 'I can plan tomorrow, but I will not silently reschedule work you have already placed. Say “plan tomorrow” and I will fill the gaps around what is there.',
      actions: [],
    }
  }

  /* search */
  const term = lower.replace(/^(find|search|where is|show me|look for)\s+/, '')
  if (term && term !== lower) {
    const hits = open.filter((t) => t.title.toLowerCase().includes(term)).slice(0, 8)
    if (hits.length) {
      return {
        reply: `${hits.length} match${hits.length === 1 ? '' : 'es'} for “${term}”.`,
        actions: [],
        data: {
          kind: 'list',
          items: hits.map((t) => ({
            id: t.id,
            title: t.title,
            sub: `${t.scheduled ? fmtTime(t.scheduled.start) + ' · ' : ''}${t.due ?? 'no date'} · ${t.durationMin}m`,
          })),
        },
      }
    }
  }

  /* how am I doing */
  if (/(how am i|how.*going|progress|review|stats|overdue)/.test(lower)) {
    const overdue = open.filter((t) => t.due && t.due < todayKey)
    const dueToday = open.filter((t) => t.due === todayKey)
    const unscheduled = open.filter((t) => !t.scheduled)
    const doneToday = all.filter((t) => t.completed && t.completedAt && isToday(t.completedAt))
    const doneMin = doneToday.reduce((a, t) => a + t.durationMin, 0)
    return {
      reply: `You have closed ${doneToday.length} task${doneToday.length === 1 ? '' : 's'} today (${Math.floor(
        doneMin / 60,
      )}h ${doneMin % 60}m). ${overdue.length} overdue, ${dueToday.length} due today, and ${
        unscheduled.length
      } open task${unscheduled.length === 1 ? '' : 's'} still without a time.`,
      actions: [],
      data: {
        kind: 'list',
        items: overdue.slice(0, 6).map((t) => ({ id: t.id, title: t.title, sub: `was due ${t.due}` })),
      },
    }
  }

  /* free form fallback: is there room? */
  if (/(free|room|space|gap)/.test(lower)) {
    const day = WEEK_RE.test(lower) ? addDays(new Date(), 1) : new Date()
    const key = toKey(day)
    const scheduled = all.filter((t) => t.scheduled && toKey(t.scheduled.start) === key)
    const busy = scheduled.reduce((a, t) => a + t.durationMin, 0)
    const meetings = Object.values(s.events).filter((e) => !e.allDay && toKey(e.start) === key)
    const meetingMin = meetings.reduce((a, e) => a + (e.end - e.start) / 60000, 0)
    const work = s.settings.workEnd - s.settings.workStart
    const free = Math.max(0, work - busy - meetingMin)
    return {
      reply: `${WEEKDAYS[day.getDay()]} has about ${Math.floor(free / 60)}h ${free % 60}m free inside your working hours${
        meetings.length ? `, once ${meetings.length} meeting${meetings.length === 1 ? '' : 's'} are taken out` : ''
      }.`,
      actions: [],
    }
  }

  return null
}

/* ------------------------------------------------------------------ llm */

const SYSTEM = `You are Tempo's planning coach. You help one person decide what to do and when.

You will receive a compact snapshot of their tasks, calendar and settings. Reply with JSON only:
{"reply": "one short paragraph, direct and concrete", "actions": [...]}

Action types:
{"type":"add","title":"...","due":"YYYY-MM-DD","start":<epoch ms>,"end":<epoch ms>,"priority":1-4,"project":"name","durationMin":45}
{"type":"schedule","match":"a distinctive substring of the task title","when":"tomorrow at 9am","durationMin":30}
{"type":"unschedule","match":"..."}
{"type":"complete","match":"..."}
{"type":"delete","match":"..."}
{"type":"priority","match":"...","priority":1}
{"type":"plan","days":1}

Rules: never invent task ids, prefer acting over advising, propose at most six actions, and if a request is ambiguous pick the most reasonable reading and say what you chose. Keep the reply under 90 words.`

export async function llmRespond(
  input: string,
  settings: Settings,
  history: { role: string; content: string }[],
): Promise<AssistantReply> {
  const { llm } = settings
  if (!llm.apiKey) throw new Error('no key')

  const context = buildContext()
  const messages = [
    ...history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: `${context}\n\n---\n\nUser: ${input}` },
  ]

  if (llm.provider === 'openai') {
    const res = await fetch(llm.endpoint || 'https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${llm.apiKey}` },
      body: JSON.stringify({
        model: llm.model || 'gpt-4.1',
        messages: [{ role: 'system', content: SYSTEM }, ...messages],
        response_format: { type: 'json_object' },
      }),
    })
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
    const data = await res.json()
    return normalise(JSON.parse(data.choices[0].message.content))
  }

  const res = await fetch(llm.endpoint || 'https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': llm.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: llm.model || 'claude-sonnet-4-5',
      max_tokens: 700,
      system: SYSTEM,
      messages,
    }),
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  const data = await res.json()
  const text = (data.content as { type: string; text?: string }[])
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('')
  return normalise(JSON.parse(text))
}

function normalise(parsed: unknown): AssistantReply {
  const p = parsed as Partial<AssistantReply>
  return {
    reply: typeof p.reply === 'string' ? p.reply : 'I am not sure what you meant.',
    actions: Array.isArray(p.actions) ? (p.actions as AssistantAction[]) : [],
  }
}

export async function respond(
  input: string,
  history: { role: string; content: string }[],
): Promise<AssistantReply> {
  const { settings } = useStore.getState()
  if (settings.llm.enabled && settings.llm.apiKey) {
    try {
      return await llmRespond(input, settings, history)
    } catch (err) {
      const local = localRespond(input)
      if (local) {
        return {
          ...local,
          reply: `${local.reply}\n\n_(The model was unreachable, so I answered from your calendar instead.)_`,
        }
      }
      throw err
    }
  }
  const local = localRespond(input)
  if (local) return local
  return {
    reply:
      'I work from your calendar without a model, so I understand things like “plan my day”, “what is on today”, “block 45 minutes for the memo tomorrow at 2”, “add renew passport friday 9am”, “done with the copy”, “p1 the invoice”, and “find passport”. Add an API key in Settings for everything else.',
    actions: [],
  }
}

export { localRespond }
