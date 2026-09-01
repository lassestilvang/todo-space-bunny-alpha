import { useEffect, useRef, useState } from 'react'
import { ArrowRight, CornerDownLeft, Eraser, Settings2, Sparkles, Undo2 } from 'lucide-react'
import { useStore } from '@/lib/store'
import { applyActions, respond, type AssistantAction } from '@/lib/assistant'
import { cn } from '@/lib/selectors'
import { IconBtn, Kbd, Modal } from './ui'

const STARTERS = [
  'Plan my day',
  "What's on today?",
  'How am I doing?',
  'Block 45 minutes for the invoice tomorrow at 2pm',
  'add renew passport friday at 9am',
  'done with the landing page copy',
  'p1 fix the flaky test',
]

export function Assistant() {
  const open = useStore((s) => s.settings.assistantOpen)
  const setOpen = useStore((s) => s.setAssistant)
  const chat = useStore((s) => s.chat)
  const push = useStore((s) => s.pushMessage)
  const patch = useStore((s) => s.patchMessage)
  const clear = useStore((s) => s.clearChat)
  const settings = useStore((s) => s.settings)
  const setPanel = useStore((s) => s.setPanel)
  const undo = useStore((s) => s.undo)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [chat.length, busy])

  if (!open) return null

  /** Apply one of the assistant's proposals and retire the rest. */
  const chooseOption = (messageId: string, option: { id: string; label: string; detail: string; action: unknown }) => {
    const applied = applyActions([option.action as AssistantAction])
    patch(messageId, {
      options: undefined,
      applied: applied.length ? applied : undefined,
      content: `${useStore.getState().chat.find((m) => m.id === messageId)?.content ?? ''}\n\nYou chose: ${option.label}.`.trim(),
    })
    inputRef.current?.focus()
  }

  const send = async (raw?: string) => {
    const q = (raw ?? text).trim()
    if (!q || busy) return
    setText('')
    push({ role: 'user', content: q })
    setBusy(true)
    const id = push({ role: 'assistant', content: '', pending: true })
    try {
      const history = useStore
        .getState()
        .chat.filter((m) => m.id !== id && !m.pending)
        .slice(-8)
        .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }))
      const answer = await respond(q, history)
      const applied = answer.actions.length ? applyActions(answer.actions) : []
      patch(id, {
        content: answer.reply,
        pending: false,
        applied: applied.length ? applied : undefined,
        options: answer.options,
      })
    } catch (err) {
      patch(id, {
        content: `I could not reach the model: ${(err as Error).message}. Your calendar is untouched.`,
        pending: false,
        error: true,
      })
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      width={640}
      title={
        <span className="flex w-full items-center gap-2">
          <span
            className="grid size-[24px] shrink-0 place-items-center rounded-[7px]"
            style={{
              background:
                settings.llm.enabled && settings.llm.apiKey
                  ? 'color-mix(in oklab, var(--color-c-orchid) 22%, transparent)'
                  : 'color-mix(in oklab, var(--signal) 18%, transparent)',
              color:
                settings.llm.enabled && settings.llm.apiKey ? 'var(--color-c-orchid)' : 'var(--signal)',
            }}
          >
            <Sparkles size={13} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] font-semibold text-ink">Coach</span>
            <span className="block truncate text-[10px] font-normal text-ink-4">
              {settings.llm.enabled && settings.llm.apiKey
                ? settings.llm.model
                : 'local planner · no model connected'}
            </span>
          </span>
          {chat.length > 0 && (
            <IconBtn label="Clear conversation" onClick={clear}>
              <Eraser size={13} />
            </IconBtn>
          )}
          <IconBtn label="Assistant settings" onClick={() => setPanel({ kind: 'settings' })}>
            <Settings2 size={13} />
          </IconBtn>
        </span>
      }
    >
      <div className="flex h-[min(58vh,540px)] flex-col">
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3.5 py-3.5">
        {chat.length === 0 && (
          <div className="anim-rise">
            <p className="font-serif text-[16px] leading-snug text-ink-2">
              I can read your day and change it. Ask me to lay out a plan, free up an hour, or
              close something out.
            </p>
            <div className="mt-3 space-y-1">
              {STARTERS.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="press w-full rounded-[var(--radius-md)] border border-line bg-surface-2 px-2.5 py-1.5 text-left text-[12px] text-ink-2 hover:border-line-strong hover:text-ink"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {chat.map((m) => (
          <div
            key={m.id}
            className={cn('anim-rise', m.role === 'user' ? 'flex justify-end' : 'flex justify-start')}
          >
            <div
              className={cn(
                'max-w-[88%] rounded-[12px] px-2.5 py-1.5 text-[12.5px] leading-relaxed',
                m.role === 'user'
                  ? 'bg-surface-3 text-ink'
                  : m.error
                    ? 'border border-bad/40 bg-bad/10 text-bad'
                    : 'border border-line bg-surface-2 text-ink-2',
              )}
            >
              {m.pending ? (
                <span className="inline-flex items-center gap-1.5 text-ink-4">
                  <span className="size-1.5 animate-pulse rounded-full bg-signal" />
                  thinking
                </span>
              ) : (
                m.content
              )}

              {m.options && m.options.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {m.options.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => chooseOption(m.id, o)}
                      className="press w-full rounded-[var(--radius-md)] border border-line bg-surface-2 px-2.5 py-2 text-left hover:border-signal/45 hover:bg-surface-3"
                    >
                      <div className="flex items-center gap-1.5 text-[12px] font-medium text-ink">
                        <ArrowRight size={11} className="shrink-0 text-signal" />
                        {o.label}
                      </div>
                      <div className="mt-0.5 pl-[17px] text-[10.5px] leading-snug text-ink-4">
                        {o.detail}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {m.applied && m.applied.length > 0 && (
                <div className="mt-2 space-y-1 border-t border-line pt-1.5">
                  {m.applied.map((a, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-[11px] text-good">
                      <span className="mt-[5px] size-1 shrink-0 rounded-full bg-good" />
                      {a}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="border-t border-line p-3">
        <div className="flex items-end gap-2 rounded-[var(--radius-lg)] border border-line bg-surface-2 px-2.5 py-1.5 focus-within:border-line-strong">
          <textarea
            ref={inputRef}
            value={text}
            rows={1}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder="Ask for a plan, or tell me what to move…"
            className="max-h-24 min-h-[20px] flex-1 resize-none bg-transparent py-[3px] text-[12.5px] leading-tight text-ink outline-none placeholder:text-ink-4"
          />
          <button
            onClick={() => send()}
            disabled={!text.trim() || busy}
            aria-label="Send"
            className="press grid size-6 shrink-0 place-items-center rounded-[6px] bg-signal text-signal-ink disabled:opacity-30"
          >
            <CornerDownLeft size={11} />
          </button>
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <Kbd>↵</Kbd>
          <button
            onClick={undo}
            className="press flex items-center gap-1 text-[10.5px] text-ink-4 hover:text-ink-2"
          >
            <Undo2 size={10} /> undo last change
          </button>
        </div>
      </div>
      </div>
    </Modal>
  )
}
