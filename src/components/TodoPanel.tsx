import { useState, useRef, useEffect, useCallback } from 'react'
import { useAppStore } from '../store/useAppStore'
import {
  Coffee, EyeOff, ChevronRight, ChevronDown, Play, Pause, Check, Brain, Trash2, Plus
} from 'lucide-react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Todo } from '../shared/types'

// --- Inline title editor ---

function EditableTitle({ todo, onDone }: { todo: Todo; onDone: () => void }) {
  const [val, setVal] = useState(todo.title)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  const commit = () => {
    const t = val.trim()
    if (t && t !== todo.title) window.api.todoUpdate(todo.id, { title: t })
    onDone()
  }

  return (
    <input
      ref={ref}
      value={val}
      onChange={e => setVal(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') onDone() }}
      onBlur={commit}
      className="flex-1 text-xs outline-none px-1 py-0 min-w-0 bg-transparent"
      style={{ color: 'var(--fg)', borderBottom: '1px solid var(--brand)' }}
      onPointerDown={e => e.stopPropagation()}
    />
  )
}

// --- Inline detail (animated accordion; in-flow, pushes rows down, full panel width) ---
// No modal, no "Detail" header, no × — the row's left chevron is the only toggle. The open/close
// height animation is pure CSS (grid-template-rows 0fr↔1fr) on the .detail-accordion wrapper, so the
// rows below slide down/up smoothly with no measured JS height.

function InlineDetail({ todo }: { todo: Todo }) {
  const [notes, setNotes] = useState(todo.notes ?? '')
  const dirty = useRef(false)

  const save = () => {
    if (dirty.current) {
      window.api.todoUpdate(todo.id, { notes: notes.trim() || undefined })
      dirty.current = false
    }
  }

  return (
    <div
      className="w-full overflow-hidden box-border"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        marginTop: 2, marginBottom: 2
      }}
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
    >
      {/* Full title (multiline) — replaces the old header; chevron up in the row collapses this */}
      <div className="px-2 pt-1.5 pb-1 text-xs break-words whitespace-pre-wrap" style={{ color: 'var(--fg)' }}>{todo.title}</div>
      {/* Editable notes */}
      <textarea
        value={notes}
        onChange={e => { setNotes(e.target.value); dirty.current = true }}
        onBlur={save}
        placeholder="Notes…"
        className="w-full text-xs outline-none px-2 py-1 resize-none min-h-[3rem] box-border"
        style={{ background: 'var(--bg-solid)', color: 'var(--fg)', border: 'none' }}
        onPointerDown={e => e.stopPropagation()}
      />
      {/* ponytail: seam for attachments — later slice adds an attachment list here */}
    </div>
  )
}

// --- Sortable todo row ---

function TodoRow({ todo }: { todo: Todo }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: todo.id })
  const [hovered, setHovered] = useState(false)
  const [editing, setEditing] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  const isActive = todo.status === 'active'

  return (
    <div ref={setNodeRef} style={style} data-todo-id={todo.id}>
      {/* Row */}
      <div
        className="flex items-center gap-1 px-1 py-0.5 rounded-sm hover:bg-[var(--surface-hover)]"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        {...attributes}
        {...listeners}
      >
        {/* left brand bar for active item */}
        <div className={`w-0.5 self-stretch rounded-full ${isActive ? 'bg-[var(--brand)]' : 'bg-transparent'}`} />

        {/* fold/expand chevron */}
        <button
          onClick={(e) => { e.stopPropagation(); setDetailOpen(v => !v) }}
          onPointerDown={e => e.stopPropagation()}
          className="text-[var(--fg-muted)] hover:text-[var(--fg)] shrink-0"
          aria-label={detailOpen ? 'Collapse' : 'Expand'}
          data-btn="chevron"
        >
          {detailOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        {/* Title */}
        {editing ? (
          <EditableTitle todo={todo} onDone={() => setEditing(false)} />
        ) : (
          <span
            data-row-title
            className="flex-1 text-xs text-[var(--fg)] truncate select-none"
            onDoubleClick={(e) => { e.stopPropagation(); setEditing(true) }}
            title="Double-click to rename"
          >
            {todo.title.split('\n')[0]}
          </span>
        )}

        {/* Controls */}
        <div className="flex items-center gap-0.5 shrink-0" onPointerDown={e => e.stopPropagation()}>
          {(todo.status === 'pending' || todo.status === 'paused') && (
            <button onClick={() => window.api.todoStart(todo.id)} className="text-[var(--fg)] hover:text-[var(--success)]" aria-label="Start" data-btn="start">
              <Play size={14} />
            </button>
          )}
          {isActive && (
            <button onClick={() => window.api.todoPause(todo.id)} className="text-[var(--fg)] hover:text-[var(--warning)]" aria-label="Pause" data-btn="pause">
              <Pause size={14} />
            </button>
          )}
          {(isActive || todo.status === 'paused') && (
            <button onClick={() => window.api.todoComplete(todo.id)} className="text-[var(--fg)] hover:text-[var(--success)]" aria-label="Complete" data-btn="complete">
              <Check size={14} />
            </button>
          )}
          <button className="text-[var(--fg-muted)] opacity-40 cursor-default" aria-label="Think (coming soon)">
            <Brain size={14} />
          </button>
          {hovered && (
            <button onClick={() => window.api.todoRemove(todo.id)} className="text-[var(--fg)] hover:text-[var(--danger)]" aria-label="Delete" data-btn="delete">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* ponytail: inline detail — ALWAYS mounted; .detail-accordion animates height (grid-rows
          0fr↔1fr) so opening/closing smoothly pushes the rows below. data-open drives it. */}
      <div className="detail-accordion" data-open={detailOpen} data-detail-for={todo.id}>
        <div className="detail-accordion-inner">
          <InlineDetail todo={todo} />
        </div>
      </div>
    </div>
  )
}

// --- Panel rect instrumentation (for self-test probes) ---

function usePanelRects(panelRef: React.RefObject<HTMLDivElement | null>, expanded: boolean) {
  useEffect(() => {
    if (!expanded) return
    const iv = setInterval(() => {
      const panel = panelRef.current
      if (!panel) return
      const sx = window.screenX, sy = window.screenY
      const toScreen = (r: DOMRect) => ({
        x: Math.round(sx + r.x), y: Math.round(sy + r.y),
        w: Math.round(r.width), h: Math.round(r.height)
      })
      // add-input (specific attr — the detail's Notes textarea also has a placeholder)
      const addInput = panel.querySelector('textarea[data-add-input]') as HTMLElement | null
      const rects: Record<string, unknown> = {}
      rects.panel = toScreen(panel.getBoundingClientRect()) // panel card outer rect (for gap checks)
      if (addInput) {
        rects.addInput = toScreen(addInput.getBoundingClientRect())
        rects.addInputValue = (addInput as HTMLTextAreaElement).value // probe: did the click focus + paste land?
        rects.addInputFocused = document.activeElement === addInput
      }
      // rows + their buttons
      const rows: Record<string, unknown>[] = []
      panel.querySelectorAll('[data-todo-id]').forEach(el => {
        const id = (el as HTMLElement).dataset.todoId!
        const entry: Record<string, unknown> = { id, rect: toScreen(el.getBoundingClientRect()) }
        const titleEl = el.querySelector('[data-row-title]') as HTMLElement | null
        if (titleEl) entry.title = titleEl.textContent ?? ''
        el.querySelectorAll('[data-btn]').forEach(btn => {
          const name = (btn as HTMLElement).dataset.btn!
          entry[name] = toScreen(btn.getBoundingClientRect())
        })
        // detail accordion (animated height; probe asserts it grows on open + pushes rows below)
        const det = el.querySelector('.detail-accordion') as HTMLElement | null
        if (det) {
          entry.detail = toScreen(det.getBoundingClientRect())
          entry.detailOpen = det.getAttribute('data-open')
        }
        rows.push(entry)
      })
      rects.rows = rows
      window.api.sendPanelRects(rects)
    }, 400)
    return () => clearInterval(iv)
  }, [panelRef, expanded])
}

// --- Panel ---

export function TodoPanel({ edge }: { edge: string }) {
  const todos = useAppStore((s) => s.todos)
  const appMode = useAppStore((s) => s.appMode)
  const expanded = useAppStore((s) => s.expanded)
  const [newTitle, setNewTitle] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)

  usePanelRects(panelRef, expanded)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    })
  )

  const visible = todos
    .filter(t => t.status !== 'done')
    .sort((a, b) => a.order - b.order)

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = visible.findIndex(t => t.id === active.id)
    const newIdx = visible.findIndex(t => t.id === over.id)
    const reordered = arrayMove(visible, oldIdx, newIdx)
    window.api.todoReorder(reordered.map(t => t.id))
  }

  const addTodo = () => {
    const title = newTitle.trim()
    if (!title) return
    window.api.todoAdd(title)
    setNewTitle('')
  }

  const isResting = appMode.mode === 'resting'

  return (
    <div ref={panelRef} className="flex flex-col h-full w-full overflow-hidden"
         style={{
           background: 'var(--bg)',
           backdropFilter: 'blur(12px)',
           border: '1px solid var(--border)',
           borderRadius: 'var(--radius)',
           // ponytail: NO box-shadow — transparent window clips it into ugly half-shadow (#6)
         }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-2 py-1.5"
           style={{ borderBottom: '1px solid var(--border)' }}>
        <span className="text-xs font-medium" style={{ color: 'var(--fg-muted)' }}>Mimir</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => window.api.appSetMode(isResting ? 'idle' : 'resting')}
            style={{ color: isResting ? 'var(--warning)' : 'var(--fg-muted)' }}
            className="hover:opacity-80"
            aria-label={isResting ? 'Resume' : 'Rest'}
          >
            <Coffee size={14} />
          </button>
          <button
            onClick={() => window.api.windowHide()}
            style={{ color: 'var(--fg-muted)' }}
            className="hover:opacity-80"
            aria-label="Hide (Ctrl+Alt+Space to bring back)"
            title="Hide (Ctrl+Alt+Space to bring back)"
          >
            <EyeOff size={14} />
          </button>
        </div>
      </div>

      {/* Todo list */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-1 py-1 min-h-0">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={visible.map(t => t.id)} strategy={verticalListSortingStrategy}>
            {visible.map(todo => <TodoRow key={todo.id} todo={todo} />)}
          </SortableContext>
        </DndContext>
        {visible.length === 0 && (
          <p className="text-xs text-center py-4" style={{ color: 'var(--fg-faint)' }}>No todos yet</p>
        )}
      </div>

      {/* Add input */}
      <div className="flex items-center gap-1 px-2 py-1.5"
           style={{ borderTop: '1px solid var(--border)' }}>
        <textarea
          data-add-input
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addTodo() } }}
          placeholder="Add todo…  (Shift+Enter = newline)"
          rows={1}
          className="flex-1 text-xs outline-none px-2 py-1 resize-none max-h-24"
          style={{
            background: 'var(--bg-solid)',
            color: 'var(--fg)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)'
          }}
        />
        <button onClick={addTodo} style={{ color: 'var(--fg-muted)' }} className="hover:opacity-80" aria-label="Add todo">
          <Plus size={14} />
        </button>
      </div>
    </div>
  )
}
