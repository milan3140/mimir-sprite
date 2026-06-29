import { useState, useRef, useEffect, useCallback } from 'react'
import { useAppStore } from '../store/useAppStore'
import {
  Coffee, EyeOff, ChevronRight, ChevronDown, Play, Pause, Check, Brain, Trash2, Plus, Paperclip, X
} from 'lucide-react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Todo, Attachment } from '../shared/types'
import { clampPanel } from '../shared/geometry'

// --- Resize grip: drag to change the panel size (persisted). The dimension that's centred on the cat
// (height for left/right, width for top/bottom) grows symmetrically (factor 2 so the grip tracks the
// cursor); the other grows from the cat-side edge. Live size updates instantly via the store; the
// persist (panelResize IPC) happens once on release so we don't write the DB every pixel. ---
function ResizeGrip({ edge }: { edge: string }) {
  const w0 = useAppStore(s => s.panelW)
  const h0 = useAppStore(s => s.panelH)
  const setLive = useAppStore(s => s.setLivePanel)

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation()
    const sx = e.screenX, sy = e.screenY
    let last = { w: w0, h: h0 }
    const onMove = (ev: PointerEvent) => {
      const dx = ev.screenX - sx, dy = ev.screenY - sy
      let dW = 0, dH = 0
      if (edge === 'right') { dW = -dx; dH = 2 * dy }
      else if (edge === 'left') { dW = dx; dH = 2 * dy }
      else if (edge === 'top') { dW = 2 * dx; dH = dy }
      else { dW = 2 * dx; dH = -dy }   // bottom
      last = clampPanel(w0 + dW, h0 + dH)
      setLive(last)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.api.panelResize(last.w, last.h)
      setLive(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const pos = ({
    right:  { bottom: 1, left: 1, cursor: 'nesw-resize' },
    left:   { bottom: 1, right: 1, cursor: 'nwse-resize' },
    top:    { bottom: 1, right: 1, cursor: 'nwse-resize' },
    bottom: { top: 1, right: 1, cursor: 'nesw-resize' },
  } as Record<string, React.CSSProperties>)[edge]

  return (
    <div className="resize-grip" data-resize-grip style={pos}
         onPointerDown={onDown} onClick={e => e.stopPropagation()} title="拖曳調整面板大小" />
  )
}

// --- Paste-image helpers (M3b) ---

type PastedImage = { dataUrl: string; width: number; height: number; name: string }

/** Extract the first image off a paste event as a data URL + natural size. */
function readPasteImage(e: React.ClipboardEvent): Promise<PastedImage | null> {
  const items = e.clipboardData?.items
  if (!items) return Promise.resolve(null)
  for (const it of Array.from(items)) {
    if (it.type.startsWith('image/')) {
      const file = it.getAsFile()
      if (!file) continue
      return new Promise(res => {
        const fr = new FileReader()
        fr.onload = () => {
          const dataUrl = fr.result as string
          const img = new Image()
          img.onload = () => res({ dataUrl, width: img.naturalWidth, height: img.naturalHeight, name: file.name || 'pasted.png' })
          img.onerror = () => res({ dataUrl, width: 0, height: 0, name: file.name || 'pasted.png' })
          img.src = dataUrl
        }
        fr.readAsDataURL(file)
      })
    }
  }
  return Promise.resolve(null)
}

/** A saved attachment thumbnail — loads its bytes back from disk as a data URL. */
function AttachmentThumb({ att }: { att: Attachment }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    window.api.attachmentRead(att.path).then(d => { if (alive) setSrc(d) })
    return () => { alive = false }
  }, [att.path])
  return (
    <div className="detail-thumb" title={att.name}>
      {src ? <img src={src} alt={att.name} /> : null}
    </div>
  )
}

function fmtDuration(ms: number): string {
  const m = Math.round(ms / 60000)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

/** Muted metadata line — adds info the row doesn't already show (created date, time spent, status). */
function metaLine(todo: Todo): string {
  const parts = [new Date(todo.createdAt).toLocaleDateString()]
  if (todo.totalActiveMs > 0) parts.push(fmtDuration(todo.totalActiveMs))
  parts.push(todo.status)
  return parts.join('  ·  ')
}

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

// --- Inline detail (animated accordion) ---
// Design (researched best practice — progressive disclosure): NOT a modal, NOT a card/box, and it does
// NOT repeat the title (the row already shows it — repeating is redundant). The detail only ADDS what
// the row can't show: editable notes, pasted screenshots, and a muted metadata line. It reads as an
// indented extension of the row (aligned under the title), animating open via the CSS grid-rows trick.
// The row's chevron is the only toggle (no header, no ×).

function InlineDetail({ todo }: { todo: Todo }) {
  const [notes, setNotes] = useState(todo.notes ?? '')
  const dirty = useRef(false)

  const save = () => {
    if (dirty.current) {
      window.api.todoUpdate(todo.id, { notes: notes.trim() || undefined })
      dirty.current = false
    }
  }

  const onPaste = async (e: React.ClipboardEvent) => {
    const img = await readPasteImage(e)
    if (img) {
      e.preventDefault()
      window.api.attachmentSave({ todoId: todo.id, dataUrl: img.dataUrl, name: img.name, width: img.width, height: img.height })
    }
  }

  const atts = todo.attachments ?? []

  return (
    <div className="detail-body" onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
      <textarea
        value={notes}
        onChange={e => { setNotes(e.target.value); dirty.current = true }}
        onBlur={save}
        onPaste={onPaste}
        placeholder="Notes…  (paste a screenshot to attach)"
        className="detail-notes"
        data-detail-notes
      />
      {atts.length > 0 && (
        <div className="detail-thumbs" data-detail-thumbs>
          {atts.map(a => <AttachmentThumb key={a.id} att={a} />)}
        </div>
      )}
      <div className="detail-meta">{metaLine(todo)}</div>
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

        {/* 📎 — this item has attachments (lets you spot it without expanding) */}
        {(todo.attachments?.length ?? 0) > 0 && (
          <span className="shrink-0 flex items-center gap-px text-[var(--fg-faint)]" data-has-attach title={`${todo.attachments!.length} attachment(s)`}>
            <Paperclip size={11} />
            {todo.attachments!.length > 1 && <span className="text-[10px]">{todo.attachments!.length}</span>}
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
      rects.pendingThumbs = panel.querySelectorAll('[data-pending-thumbs] img').length // queued pasted screenshots
      const grip = panel.querySelector('[data-resize-grip]') as HTMLElement | null
      if (grip) rects.grip = toScreen(grip.getBoundingClientRect()) // resize-handle screen rect (probe)
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
        // attachments (M3b probe signals): 📎 indicator + thumbnails actually loaded from disk
        entry.hasAttach = !!el.querySelector('[data-has-attach]')
        const notesEl = el.querySelector('[data-detail-notes]') as HTMLElement | null
        if (notesEl) entry.notesH = Math.round(notesEl.getBoundingClientRect().height) // probe: notes auto-grow
        const thumbs = Array.from(el.querySelectorAll('[data-detail-thumbs] img')) as HTMLImageElement[]
        entry.thumbs = thumbs.length
        entry.thumbLoaded = thumbs.some(im => im.naturalWidth > 0)
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
  const [pending, setPending] = useState<PastedImage[]>([]) // screenshots pasted into the add box, attached on submit
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

  const addTodo = async () => {
    const title = newTitle.trim()
    if (!title && pending.length === 0) return
    const todo = await window.api.todoAdd(title || '📷 screenshot')
    for (const img of pending) {
      await window.api.attachmentSave({ todoId: todo.id, dataUrl: img.dataUrl, name: img.name, width: img.width, height: img.height })
    }
    setNewTitle(''); setPending([])
  }

  const onAddPaste = async (e: React.ClipboardEvent) => {
    const img = await readPasteImage(e)
    if (img) { e.preventDefault(); setPending(p => [...p, img]) }
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
           position: 'relative',
         }}>
      <ResizeGrip edge={edge} />
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
      <div className="px-2 py-1.5" style={{ borderTop: '1px solid var(--border)' }}>
        {/* pasted screenshots, queued — attach to the new todo on submit */}
        {pending.length > 0 && (
          <div className="detail-thumbs" style={{ marginBottom: 6 }} data-pending-thumbs>
            {pending.map((img, i) => (
              <div key={i} className="detail-thumb detail-thumb-pending" title={img.name}>
                <img src={img.dataUrl} alt={img.name} />
                <button className="detail-thumb-x" aria-label="Remove"
                        onClick={() => setPending(p => p.filter((_, j) => j !== i))}>
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1">
          <textarea
            data-add-input
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onPaste={onAddPaste}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addTodo() } }}
            placeholder="Add todo…  (paste a screenshot · Shift+Enter = newline)"
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
    </div>
  )
}
