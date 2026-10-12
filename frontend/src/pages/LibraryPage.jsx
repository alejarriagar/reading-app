import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Lock, Plus, RotateCcw, Search } from 'lucide-react'
import { api } from '../api'
import { Button, Card, Field, Modal, PageHeader, Segmented, STATE_META, STATE_ORDER, StateBadge, cx, inputClass } from '../components/ui'

const PAGE_SIZE = 20
const COLUMNS = [
  { key: 'title', label: 'Obra' },
  { key: 'state', label: 'Estado' },
  { key: 'year', label: 'Año' },
  { key: 'rating', label: 'Nota' },
]

const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

function sortBooks(books, { key, dir }) {
  const sign = dir === 'asc' ? 1 : -1
  return [...books].sort((a, b) => {
    if (key === 'year' || key === 'rating') {
      const x = a[key]
      const y = b[key]
      if (x == null && y == null) return a.title.localeCompare(b.title, 'es')
      if (x == null) return 1
      if (y == null) return -1
      return (x - y) * sign
    }
    if (key === 'state') return (STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state)) * sign
    return String(a[key] ?? '').localeCompare(String(b[key] ?? ''), 'es', { sensitivity: 'base' }) * sign
  })
}

function Rating({ value }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-7 tabular-nums text-slate-200">{value.toFixed(1)}</span>
      <div className="h-1 w-16 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full bg-sky-400" style={{ width: `${value * 10}%` }} />
      </div>
    </div>
  )
}

function AddBookModal({ data, run, onClose }) {
  const [form, setForm] = useState({ title: '', author: '', country: '', period: '', movements: '', region_ids: [], state: 'DISCOVERED' })
  const [error, setError] = useState('')
  const authorNames = useMemo(() => Object.values(data.authors).map(a => a.name).sort((a, b) => a.localeCompare(b, 'es')), [data.authors])
  const regions = useMemo(() => [...data.regions].sort((a, b) => a.name.localeCompare(b.name, 'es')), [data.regions])
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const toggleRegion = id => set('region_ids', form.region_ids.includes(id) ? form.region_ids.filter(r => r !== id) : [...form.region_ids, id])

  const submit = async () => {
    if (!form.title.trim() || !form.author.trim()) { setError('El título y el autor son obligatorios.'); return }
    const ok = await run(
      () => api.addBook({
        ...form,
        title: form.title.trim(),
        author: form.author.trim(),
        movements: form.movements.split(',').map(item => item.trim()).filter(Boolean),
      }),
      'Obra añadida a tu biblioteca',
    )
    if (ok) onClose()
  }

  return (
    <Modal
      open
      title="Añadir una obra"
      subtitle="Cualquier libro, de cualquier época, país o autor."
      onClose={onClose}
      width="max-w-2xl"
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={submit}>Añadir</Button></>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Título"><input className={inputClass} value={form.title} onChange={e => set('title', e.target.value)} autoFocus /></Field>
        <Field label="Autor" hint="Si ya existe, se vinculará al mismo autor.">
          <input className={inputClass} list="author-names" value={form.author} onChange={e => set('author', e.target.value)} />
          <datalist id="author-names">{authorNames.map(name => <option key={name} value={name} />)}</datalist>
        </Field>
        <Field label="País o tradición"><input className={inputClass} value={form.country} onChange={e => set('country', e.target.value)} /></Field>
        <Field label="Periodo"><input className={inputClass} value={form.period} onChange={e => set('period', e.target.value)} placeholder="Siglo XX" /></Field>
        <Field label="Corrientes o temas" hint="Separados por comas."><input className={inputClass} value={form.movements} onChange={e => set('movements', e.target.value)} /></Field>
        <Field label="Estado inicial">
          <select className={inputClass} value={form.state} onChange={e => set('state', e.target.value)}>
            {STATE_ORDER.filter(state => state !== 'LOCKED').map(state => <option key={state} value={state}>{STATE_META[state].label}</option>)}
          </select>
        </Field>
      </div>

      <div className="mt-5">
        <div className="mb-2 text-xs font-medium text-slate-300">Territorios</div>
        <div className="flex flex-wrap gap-2">
          {regions.map(region => {
            const on = form.region_ids.includes(region.id)
            return (
              <button key={region.id} type="button" onClick={() => toggleRegion(region.id)} className={cx('rounded-full border px-3 py-1 text-xs transition', on ? 'border-sky-500/50 bg-sky-500/15 text-sky-200' : 'border-white/10 text-slate-400 hover:text-slate-200')}>
                {region.name}
              </button>
            )
          })}
        </div>
      </div>

      {error && <p className="mt-4 text-xs text-amber-400">{error}</p>}
    </Modal>
  )
}

export default function LibraryPage({ data, run, editBook, openAuthor }) {
  const [query, setQuery] = useState('')
  const [stateFilter, setStateFilter] = useState('ALL')
  const [year, setYear] = useState('ALL')
  const [sort, setSort] = useState({ key: 'year', dir: 'desc' })
  const [page, setPage] = useState(0)
  const [adding, setAdding] = useState(false)

  const years = useMemo(() => [...new Set(data.books.map(b => b.year).filter(Boolean))].sort((a, b) => b - a), [data.books])

  const rows = useMemo(() => {
    const q = normalize(query.trim())
    const filtered = data.books.filter(b =>
      (stateFilter === 'ALL' || b.state === stateFilter)
      && (year === 'ALL' || String(b.year) === year)
      && (!q || normalize(`${b.title} ${b.authorName} ${b.notes}`).includes(q)))
    return sortBooks(filtered, sort)
  }, [data.books, query, stateFilter, year, sort])

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const safePage = Math.min(page, pages - 1)
  const visible = rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  const toggleSort = key => {
    setSort(current => (current.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'title' ? 'asc' : 'desc' }))
    setPage(0)
  }

  const countFor = state => data.books.filter(b => b.state === state).length

  return (
    <>
      <PageHeader
        eyebrow="Biblioteca"
        title="Todas tus obras"
        subtitle="Sin restricciones de orden, país, autor o época. Haz clic en una obra para editarla."
        actions={<Button variant="primary" onClick={() => setAdding(true)}><Plus size={15} />Añadir obra</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-80">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={query} onChange={e => { setQuery(e.target.value); setPage(0) }} placeholder="Buscar título, autor o notas…" className={cx(inputClass, 'pl-9')} />
        </div>
        <Segmented
          value={stateFilter}
          onChange={value => { setStateFilter(value); setPage(0) }}
          options={[
            { value: 'ALL', label: 'Todas' },
            { value: 'READ', label: `Leídas · ${countFor('READ')}` },
            { value: 'READING', label: `Leyendo · ${countFor('READING')}` },
            { value: 'DISCOVERED', label: 'Descubiertas' },
            { value: 'LOCKED', label: 'Bloqueadas' },
          ]}
        />
        <select value={year} onChange={e => { setYear(e.target.value); setPage(0) }} className={cx(inputClass, 'w-36')}>
          <option value="ALL">Todos los años</option>
          {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
        </select>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-white/5 bg-white/[0.02] text-left text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                {COLUMNS.map(column => (
                  <th key={column.key} className="px-5 py-3 font-medium">
                    <button type="button" onClick={() => toggleSort(column.key)} className="inline-flex items-center gap-1 uppercase hover:text-slate-300">
                      {column.label}
                      {sort.key === column.key && (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </button>
                  </th>
                ))}
                <th className="px-5 py-3 font-medium">Relectura</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {visible.map(book => (
                <tr key={book.id} onClick={() => editBook(book.id)} className={cx('cursor-pointer transition hover:bg-white/[0.03]', book.state === 'LOCKED' && 'opacity-60')}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2 font-medium text-slate-100">
                      {book.state === 'LOCKED' && <Lock size={12} className="text-slate-500" />}{book.title}
                    </div>
                    <button type="button" onClick={e => { e.stopPropagation(); openAuthor(book.author) }} className="mt-0.5 text-xs text-slate-500 hover:text-sky-300">{book.authorName}</button>
                  </td>
                  <td className="px-5 py-3"><StateBadge state={book.state} /></td>
                  <td className="px-5 py-3 tabular-nums text-slate-400">{book.year ?? '—'}</td>
                  <td className="px-5 py-3">{book.rating != null ? <Rating value={book.rating} /> : <span className="text-slate-600">—</span>}</td>
                  <td className="px-5 py-3">{book.reread && <RotateCcw size={14} className="text-sky-400" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {visible.length === 0 && <div className="p-10 text-center text-sm text-slate-500">No hay obras que coincidan con los filtros.</div>}
        <div className="flex items-center justify-between border-t border-white/5 px-5 py-3 text-xs text-slate-500">
          <span>{rows.length} obras</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Anterior</Button>
            <span className="tabular-nums">{safePage + 1} / {pages}</span>
            <Button size="sm" variant="ghost" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)}>Siguiente</Button>
          </div>
        </div>
      </Card>

      {adding && <AddBookModal data={data} run={run} onClose={() => setAdding(false)} />}
    </>
  )
}