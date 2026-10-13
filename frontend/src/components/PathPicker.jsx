import { useMemo, useState } from 'react'
import { Search, Sparkles } from 'lucide-react'
import { ProgressBar, Segmented, cx, inputClass } from './ui'

const isRead = state => state === 'READ' || state === 'MASTERED'
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export default function PathPicker({ paths, activeId, onSelect }) {
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')

  const enriched = useMemo(() => paths.map(p => {
    const read = p.authors.filter(a => isRead(a.state)).length
    return { ...p, read, rate: p.authors.length ? read / p.authors.length : 0 }
  }), [paths])

  const q = normalize(query.trim())
  const visible = enriched
    .filter(p => filter === 'all'
      || (filter === 'curated' && !p.auto)
      || (filter === 'auto' && p.auto)
      || (filter === 'started' && p.read > 0))
    .filter(p => !q || normalize(`${p.name} ${p.authors.map(a => a.name).join(' ')}`).includes(q))

  const counts = {
    curated: enriched.filter(p => !p.auto).length,
    auto: enriched.filter(p => p.auto).length,
    started: enriched.filter(p => p.read > 0).length,
  }

  return (
    <div className="mb-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `Todos · ${enriched.length}` },
            { value: 'curated', label: `Curados · ${counts.curated}` },
            { value: 'auto', label: `Del catálogo · ${counts.auto}` },
            { value: 'started', label: `Empezados · ${counts.started}` },
          ]}
        />
        <div className="relative w-full sm:w-64">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar camino o autor…" className={cx(inputClass, 'pl-9')} />
        </div>
      </div>

      <div className="grid max-h-[300px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-4">
        {visible.map(p => {
          const active = p.id === activeId
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              className={cx('rounded-xl border p-3 text-left transition', active ? 'border-sky-500/40 bg-sky-500/10' : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15')}
            >
              <div className="flex items-start justify-between gap-2">
                <span className={cx('text-sm font-medium leading-snug', active ? 'text-white' : 'text-slate-200')}>{p.name}</span>
                {!p.auto && <Sparkles size={12} className="mt-1 shrink-0 text-amber-300" aria-label="Camino curado" />}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <ProgressBar value={p.rate} />
                <span className="shrink-0 text-[11px] tabular-nums text-slate-500">{p.read}/{p.authors.length}</span>
              </div>
            </button>
          )
        })}
        {!visible.length && <p className="col-span-full p-4 text-sm text-slate-500">No hay caminos con ese filtro.</p>}
      </div>

      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
        <Sparkles size={10} className="text-amber-300" />
        Curado: autores y obras elegidos a mano. Del catálogo: generado a partir de los autores de cada territorio.
      </p>
    </div>
  )
}