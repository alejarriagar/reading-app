import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react'
import { api } from '../api'
import { Button, Field, Modal, TIER_META, cx, inputClass } from './ui'

const TIERS = ['ESSENTIAL', 'RECOMMENDED', 'SPECIALIZED']
const PARTICLES = ['de', 'del', 'la', 'von', 'van', 'le', 'da', 'di']
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

function shortName(name) {
  if (name.length <= 16) return name
  const parts = name.split(/\s+/)
  if (parts.length >= 3 && PARTICLES.includes(parts[parts.length - 2].toLowerCase())) return parts.slice(-2).join(' ')
  return parts[parts.length - 1]
}

function catalogWorks(books, authorId) {
  return books
    .filter(book => book.author === authorId)
    .sort((a, b) => (a.published ?? 9999) - (b.published ?? 9999) || a.title.localeCompare(b.title, 'es'))
    .map(book => ({ title: book.title, year: book.published ?? null, aliases: [] }))
}

function fromPath(path) {
  return path.authors.map(author => ({
    id: author.id,
    name: author.name,
    short: author.short || shortName(author.name),
    tier: author.tier,
    country: author.country || '',
    aliases: author.aliases || [],
    works: author.works.map(work => ({ title: work.title, year: work.year ?? null, aliases: work.aliases || [] })),
  }))
}

function IconButton({ label, onClick, disabled, children }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="rounded-md p-1.5 text-slate-500 transition hover:bg-white/5 hover:text-slate-200 disabled:opacity-30">
      {children}
    </button>
  )
}

export default function PathEditor({ data, run, mode, path, onClose, onSaved }) {
  const editing = mode === 'edit' && path
  const [name, setName] = useState(editing ? path.name : '')
  const [description, setDescription] = useState(editing ? path.description || '' : '')
  const [regionId, setRegionId] = useState(editing ? (path.regionIds || [])[0] || '' : '')
  const [authors, setAuthors] = useState(() => (editing ? fromPath(path) : []))
  const [query, setQuery] = useState('')
  const [extra, setExtra] = useState({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const catalogAuthors = useMemo(() => {
    const withBooks = new Set(data.books.map(book => book.author))
    return Object.values(data.authors)
      .filter(author => withBooks.has(author.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [data])
  const catalogByName = useMemo(() => Object.fromEntries(catalogAuthors.map(a => [normalize(a.name), a.id])), [catalogAuthors])
  const regions = useMemo(() => [...data.regions].sort((a, b) => a.name.localeCompare(b.name, 'es')), [data.regions])

  const inPath = new Set(authors.map(a => normalize(a.name)))
  const q = normalize(query)
  const suggestions = q
    ? catalogAuthors.filter(a => !inPath.has(normalize(a.name)) && normalize(a.name).includes(q)).slice(0, 8)
    : []

  const updateAuthor = (index, patch) => setAuthors(list => list.map((a, i) => (i === index ? { ...a, ...patch } : a)))
  const removeAuthor = index => setAuthors(list => list.filter((_, i) => i !== index))
  const move = (index, step) => setAuthors(list => {
    const next = [...list]
    const target = index + step
    if (target < 0 || target >= next.length) return list
    ;[next[index], next[target]] = [next[target], next[index]]
    return next
  })

  const addAuthor = author => {
    const works = catalogWorks(data.books, author.id)
    setAuthors(list => [...list, {
      id: author.id,
      name: author.name,
      short: shortName(author.name),
      tier: 'RECOMMENDED',
      country: author.country || '',
      aliases: [],
      works: works.slice(0, 3),
    }])
    setQuery('')
  }

  const toggleWork = (index, work) => setAuthors(list => list.map((a, i) => {
    if (i !== index) return a
    const included = a.works.some(w => normalize(w.title) === normalize(work.title))
    return { ...a, works: included ? a.works.filter(w => normalize(w.title) !== normalize(work.title)) : [...a.works, work] }
  }))

  const addExtraWork = (index, key) => {
    const title = (extra[key] || '').trim()
    if (!title) return
    toggleWork(index, { title, year: null, aliases: [] })
    setExtra(current => ({ ...current, [key]: '' }))
  }

  const save = async () => {
    setError('')
    if (!name.trim()) { setError('Ponle un nombre al camino.'); return }
    if (!authors.length) { setError('Añade al menos un autor.'); return }
    const empty = authors.find(a => !a.works.length)
    if (empty) { setError(`Elige al menos una obra de ${empty.name}.`); return }

    const body = {
      name: name.trim(),
      description: description.trim(),
      region_ids: regionId ? [regionId] : [],
      authors: authors.map(({ id, name: authorName, short, tier, country, aliases, works }) => ({ id, name: authorName, short, tier, country, aliases, works })),
    }
    setSaving(true)
    let savedId = null
    const ok = await run(async () => {
      const next = editing ? await api.updatePath(path.id, body) : await api.createPath(body)
      savedId = next.createdId
      return next
    }, editing ? 'Camino actualizado' : 'Camino creado')
    setSaving(false)
    if (ok) onSaved(savedId)
  }

  return (
    <Modal
      open
      title={editing ? 'Editar camino' : 'Nuevo camino'}
      subtitle="Elige autores, ordénalos y decide qué obras forman cada rama."
      onClose={onClose}
      width="max-w-3xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={save} disabled={saving}>{editing ? 'Guardar cambios' : 'Crear camino'}</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre">
          <input className={inputClass} value={name} onChange={e => setName(e.target.value)} placeholder="Novela negra nórdica" autoFocus />
        </Field>
        <Field label="Territorio (opcional)" hint="Las obras que marques desde el camino se añadirán ahí.">
          <select className={inputClass} value={regionId} onChange={e => setRegionId(e.target.value)}>
            <option value="">Sin territorio</option>
            {regions.map(region => <option key={region.id} value={region.id}>{region.name}</option>)}
          </select>
        </Field>
        <Field label="Descripción (opcional)" className="sm:col-span-2">
          <input className={inputClass} value={description} onChange={e => setDescription(e.target.value)} placeholder="Para qué es este camino o qué quieres explorar con él" />
        </Field>
      </div>

      <div className="mt-6">
        <div className="mb-2 text-xs font-medium text-slate-300">Autores · {authors.length}</div>

        <div className="relative mb-3">
          <input
            className={inputClass}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && suggestions[0]) { e.preventDefault(); addAuthor(suggestions[0]) } }}
            placeholder="Añadir autor del catálogo…"
          />
          {suggestions.length > 0 && (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-white/10 bg-[#0F172A] shadow-2xl">
              {suggestions.map(author => (
                <button key={author.id} type="button" onClick={() => addAuthor(author)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/[0.05]">
                  <span className="inline-flex items-center gap-2"><Plus size={12} className="text-sky-400" />{author.name}</span>
                  <span className="truncate text-[11px] text-slate-500">{author.country}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {authors.length === 0 && (
          <p className="rounded-xl border border-white/5 p-4 text-sm text-slate-500">Busca un autor arriba para empezar. El primero será el punto de entrada del camino.</p>
        )}

        <div className="space-y-2">
          {authors.map((author, index) => {
            const key = `${author.id}-${index}`
            const catalogId = catalogByName[normalize(author.name)]
            const included = new Set(author.works.map(w => normalize(w.title)))
            const available = catalogId
              ? catalogWorks(data.books, catalogId).filter(w => !included.has(normalize(w.title))).slice(0, 8)
              : []
            return (
              <div key={key} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 text-center text-xs tabular-nums text-slate-500">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-100">{author.name}</span>
                  <select
                    aria-label="Clasificación"
                    value={author.tier}
                    onChange={e => updateAuthor(index, { tier: e.target.value })}
                    className="h-7 rounded-md border border-white/10 bg-transparent px-1.5 text-[11px] text-slate-300 outline-none"
                  >
                    {TIERS.map(tier => <option key={tier} value={tier}>{TIER_META[tier].label}</option>)}
                  </select>
                  <IconButton label="Subir" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={13} /></IconButton>
                  <IconButton label="Bajar" disabled={index === authors.length - 1} onClick={() => move(index, 1)}><ArrowDown size={13} /></IconButton>
                  <IconButton label="Quitar autor" onClick={() => removeAuthor(index)}><Trash2 size={13} /></IconButton>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-8">
                  {author.works.map((work, j) => (
                    <span key={work.title} className="inline-flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 px-2.5 py-0.5 text-[11px] text-sky-100">
                      {j + 1}. {work.title}
                      <button type="button" aria-label={`Quitar ${work.title}`} onClick={() => toggleWork(index, work)} className="text-sky-300/70 transition hover:text-white"><X size={11} /></button>
                    </span>
                  ))}
                  {available.map(work => (
                    <button key={work.title} type="button" onClick={() => toggleWork(index, work)} className={cx('rounded-full border border-dashed border-white/15 px-2.5 py-0.5 text-[11px] text-slate-400 transition hover:border-sky-500/40 hover:text-sky-200')}>
                      + {work.title}
                    </button>
                  ))}
                  <input
                    value={extra[key] || ''}
                    onChange={e => setExtra(current => ({ ...current, [key]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addExtraWork(index, key) } }}
                    onBlur={() => addExtraWork(index, key)}
                    placeholder="Otra obra… (Enter)"
                    className="h-6 w-40 rounded-full border border-white/10 bg-transparent px-2.5 text-[11px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-sky-500/50"
                  />
                </div>
              </div>
            )
          })}
        </div>
        <p className="mt-2 text-[11px] text-slate-500">El orden de las obras es el orden de la rama: quita y vuelve a añadir una obra para moverla al final.</p>
      </div>

      {error && <p className="mt-4 text-xs text-amber-400">{error}</p>}
    </Modal>
  )
}