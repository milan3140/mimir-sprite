import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import {
  Coffee, EyeOff, GripVertical, Play, Pause, Check, Brain, Trash2, Plus
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

// --- Sortable todo row ---

function TodoRow({ todo }: { todo: Todo }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: todo.id })
  const [hovered, setHovered] = useState(false)

  const style = { transform: CSS.Transform.toString(transform), transition }
  const isActive = todo.status === 'active'

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-1 px-1 py-0.5 rounded-sm hover:bg-[var(--surface-hover)]"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* ponytail: left brand bar for active item */}
      <div className={`w-0.5 self-stretch rounded-full ${isActive ? 'bg-[var(--brand)]' : 'bg-transparent'}`} />

      <button {...attributes} {...listeners} className="text-[var(--fg-faint)] cursor-grab active:cursor-grabbing shrink-0" aria-label="Drag to reorder">
        <GripVertical size={14} />
      </button>

      <span className="flex-1 text-xs text-[var(--fg)] truncate select-none">{todo.title}</span>

      <div className="flex items-center gap-0.5 shrink-0">
        {(todo.status === 'pending' || todo.status === 'paused') && (
          <button onClick={() => window.api.todoStart(todo.id)} className="text-[var(--fg-muted)] hover:text-[var(--success)]" aria-label="Start">
            <Play size={14} />
          </button>
        )}
        {isActive && (
          <button onClick={() => window.api.todoPause(todo.id)} className="text-[var(--fg-muted)] hover:text-[var(--warning)]" aria-label="Pause">
            <Pause size={14} />
          </button>
        )}
        {(isActive || todo.status === 'paused') && (
          <button onClick={() => window.api.todoComplete(todo.id)} className="text-[var(--fg-muted)] hover:text-[var(--success)]" aria-label="Complete">
            <Check size={14} />
          </button>
        )}
        {/* ponytail: stub — thinking is a later slice */}
        <button className="text-[var(--fg-faint)] opacity-40 cursor-default" aria-label="Think (coming soon)">
          <Brain size={14} />
        </button>
        {hovered && (
          <button onClick={() => window.api.todoRemove(todo.id)} className="text-[var(--fg-muted)] hover:text-[var(--danger)]" aria-label="Delete">
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

// --- Panel ---

export function TodoPanel() {
  const todos = useAppStore((s) => s.todos)
  const appMode = useAppStore((s) => s.appMode)
  const [newTitle, setNewTitle] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
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
        <input
          type="text"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addTodo()}
          placeholder="Add todo…"
          className="flex-1 text-xs outline-none px-2 py-1"
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
