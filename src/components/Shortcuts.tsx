import { useStore } from '@/lib/store'
import { Modal } from './ui'
import { Kbd } from './ui'

const GROUPS: { title: string; rows: [string[], string][] }[] = [
  {
    title: 'Capture',
    rows: [
      [['C'], 'Jump to the capture bar'],
      [['↵'], 'Create the task'],
      [['⇧', '↵'], 'Add a line instead of creating'],
      [['#'], 'Send it to a project'],
      [['@'], 'Tag it with a label'],
      [['!1', '…', '!4'], 'Set priority'],
      [['tomorrow', 'at 9am'], 'Set the date and the time'],
      [['for 45m'], 'Set a realistic estimate'],
      [['every tue'], 'Make it repeat'],
    ],
  },
  {
    title: 'Move around',
    rows: [
      [['T'], 'Today'],
      [['D'], 'Day view'],
      [['W'], 'Week view'],
      [['M'], 'Month view'],
      [['A'], 'Agenda'],
      [['P'], 'Open the planner'],
      [['1', '–', '9'], 'Jump to a view by number'],
      [['G', 'then', 'I'], 'Inbox · G T today · G U upcoming'],
    ],
  },
  {
    title: 'On the calendar',
    rows: [
      [['drag'], 'Move a block'],
      [['edge'], 'Drag the top or bottom to resize'],
      [['↑', '↓'], 'Nudge a focused block by one step'],
      [['⇧', '←/→'], 'Change its length'],
      [['↵'], 'Open the focused block'],
      [['drag in'], 'Drop a floating task onto a slot'],
    ],
  },
  {
    title: 'Everything else',
    rows: [
      [['⌘', 'K'], 'Command palette'],
      [['/', ''], 'Search'],
      [['⌘', 'Z'], 'Undo'],
      [['⇧', '⌘', 'Z'], 'Redo'],
      [['?'], 'This list'],
      [['Esc'], 'Close whatever is open'],
    ],
  },
]

export function Shortcuts() {
  const open = useStore((s) => s.ui.helpOpen)
  const setOpen = useStore((s) => s.setHelpOpen)
  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Keyboard" width={620}>
      <div className="grid grid-cols-1 gap-x-8 gap-y-5 p-5 sm:grid-cols-2">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h4 className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-4">
              {g.title}
            </h4>
            {g.rows.map(([keys, label]) => (
              <div key={label} className="flex items-center justify-between gap-3 py-[3px]">
                <span className="text-[12px] text-ink-2">{label}</span>
                <span className="flex shrink-0 gap-1">
                  {keys.filter(Boolean).map((k, i) => (
                    <Kbd key={i}>{k}</Kbd>
                  ))}
                </span>
              </div>
            ))}
          </section>
        ))}
      </div>
    </Modal>
  )
}
