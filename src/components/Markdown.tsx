import type { ReactNode } from 'react'
import { cn } from '@/lib/selectors'

/**
 * A tiny, safe markdown renderer, shared by docs and task notes.
 *
 * Everything is built as React elements — there is no HTML string anywhere,
 * so untrusted bodies cannot inject markup. Inline links are limited to
 * http/https/mailto.
 */

const SAFE_SCHEME = /^(https?:|mailto:)/i

function safeHref(raw: string): string | null {
  const href = raw.trim()
  return SAFE_SCHEME.test(href) ? href : null
}

function inlineNodes(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\)|~~[^~\n]+~~)/g
  let last = 0
  let n = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**') || tok.startsWith('__')) {
      out.push(<strong key={`${key}-b${n}`}>{tok.slice(2, -2)}</strong>)
    } else if (tok.startsWith('~~')) {
      out.push(<s key={`${key}-s${n}`}>{tok.slice(2, -2)}</s>)
    } else if (tok.startsWith('`')) {
      out.push(<code key={`${key}-c${n}`}>{tok.slice(1, -1)}</code>)
    } else if (tok.startsWith('[')) {
      const parts = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok)
      const href = parts ? safeHref(parts[2]) : null
      if (parts && href) {
        out.push(
          <a key={`${key}-a${n}`} href={href} target="_blank" rel="noreferrer noopener">
            {parts[1]}
          </a>,
        )
      } else {
        out.push(tok)
      }
    } else {
      out.push(<em key={`${key}-i${n}`}>{tok.slice(1, -1)}</em>)
    }
    last = m.index + tok.length
    n++
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

type ListKind = 'ul' | 'ol' | 'check'

const RE_CHECK = /^[-*+]\s+\[[ xX]?\]\s*/
const RE_CHECK_DONE = /^[-*+]\s+\[[xX]\]\s*/
const RE_BULLET = /^[-*+]\s+/
const RE_NUMBER = /^\d+[.)]\s+/
const RE_QUOTE = /^>\s?/

const isBullet = (l: string) => RE_BULLET.test(l)
const isCheck = (l: string) => RE_CHECK.test(l)
const isNumber = (l: string) => RE_NUMBER.test(l)
const isQuote = (l: string) => RE_QUOTE.test(l)

const stripMarker = (l: string): string =>
  l.replace(RE_CHECK, '').replace(RE_BULLET, '').replace(RE_NUMBER, '').replace(RE_QUOTE, '')

/** Which list flavour a line belongs to, or null. `- [ ]` counts as a checklist, not a bullet. */
const matchesKind = (l: string, kind: ListKind): boolean => {
  if (kind === 'check') return isCheck(l)
  if (kind === 'ol') return isNumber(l)
  return isBullet(l) && !isCheck(l)
}

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const out: ReactNode[] = []
  let para: string[] = []
  let i = 0
  let key = 0

  const flushPara = () => {
    if (!para.length) return
    const k = `p${key++}`
    out.push(<p key={k}>{inlineNodes(para.join(' '), k)}</p>)
    para = []
  }

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) {
      flushPara()
      i++
      continue
    }

    const h = /^(#{1,4})\s+(.*)$/.exec(line)
    if (h) {
      flushPara()
      const k = `h${key++}`
      const level = h[1].length
      const body = inlineNodes(h[2], k)
      if (level === 1) out.push(<h1 key={k}>{body}</h1>)
      else if (level === 2) out.push(<h2 key={k}>{body}</h2>)
      else out.push(<h3 key={k}>{body}</h3>)
      i++
      continue
    }

    if (isQuote(line)) {
      flushPara()
      const k = `q${key++}`
      const buf: string[] = []
      while (i < lines.length && isQuote(lines[i])) {
        buf.push(stripMarker(lines[i]))
        i++
      }
      out.push(<blockquote key={k}>{inlineNodes(buf.join(' '), k)}</blockquote>)
      continue
    }

    const kind: ListKind | null = isCheck(line)
      ? 'check'
      : isBullet(line)
        ? 'ul'
        : isNumber(line)
          ? 'ol'
          : null

    if (kind) {
      flushPara()
      const k = `l${key++}`
      const items: string[] = []
      while (i < lines.length) {
        const l = lines[i]
        if (!l.trim()) {
          // A blank line only continues the list if the next line is the same kind.
          if (matchesKind(lines[i + 1] ?? '', kind)) {
            i++
            continue
          }
          break
        }
        if (!matchesKind(l, kind)) break
        items.push(l)
        i++
      }
      const parsed = items.map((l) => ({
        text: stripMarker(l),
        done: RE_CHECK_DONE.test(l),
      }))
      if (kind === 'check') {
        out.push(
          <ul key={k} className="list-none">
            {parsed.map((it, n) => (
              <li key={n} className="flex items-start gap-2">
                <span
                  aria-hidden
                  className={cn(
                    'mt-[5px] grid size-[11px] shrink-0 place-items-center rounded-[3px] border',
                    it.done ? 'border-transparent bg-good' : 'border-line-strong',
                  )}
                >
                  {it.done && (
                    <svg viewBox="0 0 12 12" className="size-[8px]">
                      <path
                        d="M2.5 6.4 4.6 8.5 9.5 3.6"
                        fill="none"
                        stroke="#0a0b0d"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                <span className={cn(it.done && 'text-ink-4 line-through')}>
                  {inlineNodes(it.text, `${k}-${n}`)}
                </span>
              </li>
            ))}
          </ul>,
        )
      } else if (kind === 'ol') {
        out.push(
          <ol key={k}>
            {parsed.map((it, n) => (
              <li key={n}>{inlineNodes(it.text, `${k}-${n}`)}</li>
            ))}
          </ol>,
        )
      } else {
        out.push(
          <ul key={k}>
            {parsed.map((it, n) => (
              <li key={n}>{inlineNodes(it.text, `${k}-${n}`)}</li>
            ))}
          </ul>,
        )
      }
      continue
    }

    para.push(trimmed)
    i++
  }
  flushPara()
  return <>{out}</>
}