import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, Compass, CornerDownLeft, Fingerprint, Globe, LayoutDashboard, Library, Map as MapIcon, Plus, Route, Search, User } from 'lucide-react'
import { StateBadge, cx } from './ui'

const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

const PAGE_ENTRIES = [
  { id: 'overview', title: 'Resumen', icon: LayoutDashboard },
  { id: 'world', title: 'Mundo', icon: Globe },
  { id: 'map', title: 'Territorios', icon: MapIcon },
  { id: 'paths', title: 'Caminos', icon: Route },
  { id: 'library', title: 'Biblioteca', icon: Library },
  { id: 'stats', title: 'ADN lector', icon: Fingerprint, keywords: 'adn lector estadisticas resumen anual tu año en libros' },
]

const GROUP_LABELS = {
  page: 'Ir a',
  action: 'Acciones',
  author: 'Autores',
  book: 'Obras',
  region: 'Territorios',
  path: 'Caminos',
}
const GROUP_ORDER = ['page', 'action', 'author', 'book', 'region', 'path']
const PER_GROUP = 6

function score(keywords, tokens) {
  const text = normalize(keywords)
  let total = 0
  for (const token of tokens) {
    if (!text.includes(token)) return 0
    total += 1
  }
  if (text.startsWith(tokens[0])) total += 3
  else if (text.includes(` ${tokens[0]}`)) total += 2
  return total
}

function Thumb({ item }) {
  const Icon = item.icon
  const src = item.image || item.cover
  if (src) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={event => { event.currentTarget.style.visibility = 'hidden' }}
        className={cx('h-8 shrink-0 border border-white/10 object-cover', item.type === 'book' ? 'w-6 rounded' : 'w-8 rounded-lg')}
      />
    )
  }
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.04] text-slate-400">
      <Icon size={14} />
    </span>
  )
}

export default function CommandPalette({ open, data, onClose, onSelect }) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setIndex(0)
    const timer = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [open])

  const entries = useMemo(() => {
    const list = PAGE_ENTRIES.map(page => ({ type: 'page', ...page, keywords: page.keywords || page.title }))
    list.push({ type: 'action', id: 'compass', title: '¿Hacia dónde ahora?', subtitle: 'Abrir la brújula de exploración', icon: Compass, keywords: 'brujula explorar sorprendeme hacia donde ahora' })
    list.push({ type: 'action', id: 'add-book', title: 'Añadir una obra', subtitle: 'Biblioteca', icon: Plus, keywords: 'anadir nueva obra libro' })
    Object.values(data.authors).forEach(author => list.push({
      type: 'author', id: author.id, title: author.name,
      subtitle: [author.country, author.period].filter(Boolean).join(' · '),
      state: author.state, icon: User, image: author.image, keywords: author.name,
    }))
    data.books.forEach(book => list.push({
      type: 'book', id: book.id, title: book.title, subtitle: book.authorName,
      state: book.state, icon: BookOpen, cover: book.cover, keywords: `${book.title} ${book.authorName}`,
    }))
    data.regions.forEach(region => list.push({
      type: 'region', id: region.id, title: region.name,
      subtitle: `${Math.round(region.rate * 100)}% explorado · ${region.total} autores`,
      state: region.state, icon: MapIcon, keywords: `${region.name} ${region.type}`,
    }))
    data.paths.forEach(path => list.push({
      type: 'path', id: path.id, title: path.name, subtitle: `${path.authors.length} autores`,
      icon: Route, keywords: `camino ${path.name}`,
    }))
    return list
  }, [data])

  const results = useMemo(() => {
    const tokens = normalize(query.trim()).split(/\s+/).filter(Boolean)
    if (!tokens.length) return entries.filter(entry => entry.type === 'page' || entry.type === 'action')
    const scored = entries
      .map(entry => ({ entry, value: score(entry.keywords, tokens) }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value || Number(a.entry.state === 'LOCKED') - Number(b.entry.state === 'LOCKED'))
    const counts = {}
    const picked = []
    for (const { entry } of scored) {
      counts[entry.type] = (counts[entry.type] || 0) + 1
      if (counts[entry.type] <= PER_GROUP) picked.push(entry)
    }
    return picked.sort((a, b) => GROUP_ORDER.indexOf(a.type) - GROUP_ORDER.indexOf(b.type))
  }, [entries, query])

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [index])

  if (!open) return null

  const onKeyDown = event => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setIndex(i => Math.min(results.length - 1, i + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setIndex(i => Math.max(0, i - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (results[index]) onSelect(results[index])
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
  }

  let lastType = null

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[12vh]">
      <div className="fade-in absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Buscar" className="pop-in relative w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-[#0F172A] shadow-2xl">
        <div className="flex items-center gap-3 border-b border-white/5 px-4">
          <Search size={16} className="text-slate-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={event => { setQuery(event.target.value); setIndex(0) }}
            onKeyDown={onKeyDown}
            placeholder="Busca autores, obras, territorios, caminos…"
            className="h-14 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
          />
          <kbd className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-slate-400">Esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[55vh] overflow-y-auto p-2">
          {results.length === 0 && (
            <div className="px-3 py-10 text-center text-sm text-slate-500">Sin resultados para «{query}»</div>
          )}
          {results.map((item, i) => {
            const header = item.type !== lastType ? GROUP_LABELS[item.type] : null
            lastType = item.type
            return (
              <div key={`${item.type}-${item.id}`}>
                {header && <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{header}</div>}
                <button
                  type="button"
                  data-index={i}
                  onMouseMove={() => setIndex(i)}
                  onClick={() => onSelect(item)}
                  className={cx('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition', i === index && 'bg-white/[0.07]')}
                >
                  <Thumb item={item} />
                  <span className="min-w-0 flex-1">
                    <span className={cx('block truncate text-sm', item.state === 'LOCKED' ? 'text-slate-400' : 'text-slate-100')}>{item.title}</span>
                    {item.subtitle && <span className="block truncate text-[11px] text-slate-500">{item.subtitle}</span>}
                  </span>
                  {item.state && <StateBadge state={item.state} />}
                  {i === index && <CornerDownLeft size={13} className="shrink-0 text-slate-500" />}
                </button>
              </div>
            )
          })}
        </div>

        <div className="flex items-center gap-4 border-t border-white/5 px-4 py-2.5 text-[11px] text-slate-500">
          <span>↑↓ navegar</span>
          <span>Enter abrir</span>
          <span>Esc cerrar</span>
          <span className="ml-auto">Ctrl K o / para abrir</span>
        </div>
      </div>
    </div>
  )
}