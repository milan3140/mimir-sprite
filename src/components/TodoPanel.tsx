import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'
import {
  Coffee, EyeOff, ChevronRight, ChevronDown, Play, Pause, Check, Brain, Trash2, Plus, X
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
      // ponytail: data-no-drag prevents PointerSensor from starting a drag
      onPointerDown={e => e.stopPropagation()}
    />
  )
}

// --- Detail popover (full title + editable notes) ---

function DetailPopover({ todo, onClose }: { todo: Todo; onClose: () => void }) {
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
      className="absolute z-50 w-64 max-h-48 flex flex-col overflow-hidden"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        boxShadow: 'var(--shadow)',
        // ponytail: position below the row
        top: '100%', left: 0, marginTop: 2
      }}
      // don't let clicks in the popover bubble to the row's click-to-open-detail handler
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-2 py-1" style={{ borderBottom: '1px solid var(--border)' }}>
        <span className="text-xs font-medium" style={{ color: 'var(--fg)' }}>Detail</span>
        <button onClick={onClose} className="hover:opacity-80" style={{ color: 'var(--fg-muted)' }} aria-label="Close">
          <X size={12} />
        </button>
      </div>
      {/* Full title — preserve multiline (#2) */}
      <div className="px-2 py-1 text-xs break-words whitespace-pre-wrap" style={{ color: 'var(--fg)' }}>{todo.title}</div>
      {/* Editable notes */}
      <textarea
        value={notes}
        onChange={e => { setNotes(e.target.value); dirty.current = true }}
        onBlur={save}
        placeholder="Notes…"
        className="flex-1 text-xs outline-none px-2 py-1 resize-none min-h-[3rem]"
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

  // ponytail: row click opens detail (unless editing or clicking a button)
  const handleRowClick = (e: React.MouseEvent) => {
    // if click target is a button/input/textarea or inside one, skip
    const t = e.target as HTMLElement
    if (t.closest('button') || t.closest('input') || t.closest('textarea')) return
    if (editing) return
    setDetailOpen(v => !v)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative flex items-center gap-1 px-1 py-0.5 rounded-sm hover:bg-[var(--surface-hover)]"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleRowClick}
      // ponytail: drag-anywhere — listeners on the row, not the grip handle.
      // PointerSensor with 4px activation distance so clicks still register.
      // data-no-drag on buttons/inputs prevents drag from starting there.
      {...attributes}
      {...listeners}
    >
      {/* left brand bar for active item */}
      <div className={`w-0.5 self-stretch rounded-full ${isActive ? 'bg-[var(--brand)]' : 'bg-transparent'}`} />

      {/* #8: fold/expand indicator (not a drag handle — the whole row drags). Click toggles detail. */}
      <button
        onClick={(e) => { e.stopPropagation(); setDetailOpen(v => !v) }}
        onPointerDown={e => e.stopPropagation()}
        className="text-[var(--fg-muted)] hover:text-[var(--fg)] shrink-0"
        aria-label={detailOpen ? 'Collapse' : 'Expand'}
        data-no-drag
      >
        {detailOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>

      {/* Title: click to edit, or truncate */}
      {editing ? (
        <EditableTitle todo={todo} onDone={() => setEditing(false)} />
      ) : (
        // #1: rename only on DOUBLE-click; no pointerDown-stop so the title area still drags,
        // and a single click bubbles to the row (toggles detail). Show only the first line.
        <span
          className="flex-1 text-xs text-[var(--fg)] truncate select-none"
          onDoubleClick={(e) => { e.stopPropagation(); setEditing(true) }}
          title="Double-click to rename"
        >
          {todo.title.split('\n')[0]}
        </span>
      )}

      {/* Controls */}
      <div className="flex items-center gap-0.5 shrink-0" data-no-drag>
        {(todo.status === 'pending' || todo.status === 'paused') && (
          <button onClick={() => window.api.todoStart(todo.id)} className="text-[var(--fg)] hover:text-[var(--success)]" aria-label="Start">
            <Play size={14} />
          </button>
        )}
        {isActive && (
          <button onClick={() => window.api.todoPause(todo.id)} className="text-[var(--fg)] hover:text-[var(--warning)]" aria-label="Pause">
            <Pause size={14} />
          </button>
        )}
        {(isActive || todo.status === 'paused') && (
          <button onClick={() => window.api.todoComplete(todo.id)} className="text-[var(--fg)] hover:text-[var(--success)]" aria-label="Complete">
            <Check size={14} />
          </button>
        )}
        {/* ponytail: stub — thinking is a later slice */}
        <button className="text-[var(--fg-muted)] opacity-40 cursor-default" aria-label="Think (coming soon)">
          <Brain size={14} />
        </button>
        {hovered && (
          <button onClick={() => window.api.todoRemove(todo.id)} className="text-[var(--fg)] hover:text-[var(--danger)]" aria-label="Delete">
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* Detail popover */}
      {detailOpen && <DetailPopover todo={todo} onClose={() => setDetailOpen(false)} />}
    </div>
  )
}

// --- Panel ---

export function TodoPanel({ edge }: { edge: string }) {
  const todos = useAppStore((s) => s.todos)
  const appMode = useAppStore((s) => s.appMode)
  const [newTitle, setNewTitle] = useState('')

  // ponytail: PointerSensor 4px activation, skip elements with data-no-drag
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
    <div className="flex flex-col h-full w-full overflow-hidden"
         style={{
           background: 'var(--bg)',
           backdropFilter: 'blur(12px)',
           border: '1px solid var(--border)',
           borderRadius: 'var(--radius)',
           boxShadow: 'var(--shadow)'
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
            aria-label="Hide"
          >
            <EyeOff size={14} />
          </button>
        </div>
      </div>

      {/* Todo list */}
      <div className="flex-1 overflow-y-auto px-1 py-1 min-h-0">
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
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          // #3: Enter sends, Shift+Enter inserts a newline (kept in the title; list shows line 1)
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
