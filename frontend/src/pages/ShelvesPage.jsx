import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, BookCopy, BookOpen, Check, Handshake, Loader2, MapPin, Plus, Search, Settings2, Truck, Upload } from 'lucide-react'
import { api } from '../api'
import Cover from '../components/Cover'
import CopyModal from '../components/CopyModal'
import HousesModal from '../components/HousesModal'
import ImportModal from '../components/ImportModal'
import ExcelImportModal from '../components/ExcelImportModal'
import WishlistSection from '../components/WishlistSection'
import { Button, Card, PageHeader, Segmented, StatCard, cx, inputClass } from '../components/ui'
import { FORMAT_LABELS, initials, normalize } from '../lib/shelves'

const PAGE_SIZE = 50
const READ = new Set(['READ', 'MASTERED'])

function Readers({ copy, users }) {
  return (
    <div className="flex gap-1">
      {users.map(user => {
        const reader = copy.readers.find(r => r.userId === user.id)
        const read = READ.has(reader?.state)
        const reading = reader?.state === 'READING'
        const label = read
          ? `leído${reader.rating != null ? ` (${reader.rating})` : ''}`
          : reading ? 'leyendo' : 'sin leer'
        return (
          <span
            key={user.id}
            title={`${user.name}: ${label}`}
            className={cx(
              'grid h-6 w-6 place-items-center rounded-full border text-[9px] font-semibold',
              read ? 'border-blue-500/50 bg-blue-500/20 text-blue-100'
                : reading ? 'border-sky-400/50 bg-sky-400/15 text-sky-100'
                  : 'border-dashed border-white/15 text-slate-500',
            )}
          >
            {initials(user.name)}
          </span>
        )
      })}
    </div>
  )
}

export default function ShelvesPage({ data, run, editBook }) {
  const [lib, setLib] = useState(null)
  const [error, setError] = useState(null)
  const [house, setHouse] = useState('ALL')
  const [owner, setOwner] = useState('ALL')
  const [media, setMedia] = useState('ALL')
  const [filter, setFilter] = useState('ALL')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [modal, setModal] = useState(null)
  const [notice, setNotice] = useState('')
  const [view, setView] = useState('shelves')
  const me = data.me

  const load = useCallback(() => {
    api.library().then(next => { setLib(next); setError(null) }).catch(err => setError(err.message))
  }, [])
  useEffect(() => { load() }, [load, data])
  useEffect(() => {
    if (!notice) return undefined
    const timer = setTimeout(() => setNotice(''), 2600)
    return () => clearTimeout(timer)
  }, [notice])

  if (error) {
    return <Card className="p-8 text-sm text-slate-400"><AlertTriangle className="mb-2 text-amber-400" />{error}</Card>
  }
  if (!lib) return <div className="grid h-64 place-items-center text-slate-400"><Loader2 className="animate-spin" /></div>

  const apply = (next, message) => {
    setLib(next)
    if (message) setNotice(message)
  }
  const saved = (next, message) => {
    apply(next, message)
    setModal(null)
  }

  const housesById = Object.fromEntries(lib.houses.map(h => [h.id, h]))
  const usersById = Object.fromEntries(lib.users.map(u => [u.id, u]))
  const readByMe = c => READ.has(c.readers.find(r => r.userId === me?.id)?.state)
  const counts = {}
  lib.copies.forEach(c => { counts[c.houseId] = (counts[c.houseId] || 0) + 1 })

  const q = normalize(query)
  const visible = lib.copies
    .filter(c => house === 'ALL' || c.houseId === house)
    .filter(c => media === 'ALL' || c.mediaKind === media)
    .filter(c => owner === 'ALL' || (owner === 'FAMILY' ? !c.ownerId : c.ownerId === owner))
    .filter(c => filter === 'ALL'
      || (filter === 'UNREAD' && !readByMe(c))
      || (filter === 'READ' && readByMe(c))
      || (filter === 'LOANED' && c.loanTo)
      || (filter === 'MOVE' && c.moveTo))
    .filter(c => !q || normalize(`${c.title} ${c.author} ${c.isbn || ''} ${c.publisher || ''}`).includes(q))
    .sort((a, b) => (a.author || '').localeCompare(b.author || '', 'es') || a.title.localeCompare(b.title, 'es'))

  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const safePage = Math.min(page, pages - 1)
  const rows = visible.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)
  const toMove = lib.copies.filter(c => c.moveTo)
  const unread = lib.copies.filter(c => !readByMe(c)).length
  const loaned = lib.copies.filter(c => c.loanTo).length

  const arrivedAt = async copyItem => {
    try {
      apply(await api.arrived(copyItem.id), `«${copyItem.title}» ya está en ${housesById[copyItem.moveTo]?.name}`)
    } catch (err) {
      setNotice(err.message)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Estanterías"
        title="Vuestros libros en casa"
        subtitle="Qué libros tenéis, en qué casa están y quién los ha leído. Es una biblioteca compartida entre los perfiles."
        actions={
          <>
            <Button onClick={() => setModal({ type: 'excel' })}><Upload size={15} />Importar Excel</Button>
            <Button onClick={() => setModal({ type: 'import' })}><Upload size={15} />Importar CSV</Button>
            <Button variant="primary" onClick={() => setModal({ type: 'copy', copy: null })}><Plus size={15} />Añadir libro</Button>
          </>
        }
      />

      <div className="mb-5">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'shelves', label: 'Nuestros ejemplares' },
            { value: 'wishlist', label: 'Deseos compartidos' },
          ]}
        />
      </div>

      {view === 'wishlist' && (
        <WishlistSection
          lib={lib}
          me={me}
          run={run}
          onInventoryChange={next => apply(next)}
        />
      )}

      <div className={view === 'wishlist' ? 'hidden' : ''}>
      {notice && <div className="fade-in mb-4 inline-flex rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200">{notice}</div>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={BookCopy} label="Ejemplares" value={lib.copies.length} hint={lib.houses.map(h => `${h.name} ${counts[h.id] || 0}`).join(' · ')} tone="blue" />
        <StatCard icon={BookOpen} label="Sin leer por ti" value={unread} hint="Pendientes en casa" tone="violet" />
        <StatCard icon={Handshake} label="Prestados" value={loaned} hint="Fuera de casa ahora mismo" tone="amber" />
        <StatCard icon={Truck} label="Para llevar" value={toMove.length} hint="A otra casa" tone="sky" />
      </div>

      {toMove.length > 0 && (
        <Card className="mt-6 p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><Truck size={15} className="text-sky-400" />Para llevar a otra casa</div>
          <div className="space-y-1.5">
            {toMove.map(c => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-white/[0.03]">
                <span className="min-w-0 text-slate-200">
                  {c.title} <span className="text-slate-500">· {housesById[c.houseId]?.name} → {housesById[c.moveTo]?.name}</span>
                </span>
                <Button size="sm" onClick={() => arrivedAt(c)}><Check size={13} />Ya está en {housesById[c.moveTo]?.name}</Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="mt-6 mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          value={house}
          onChange={value => { setHouse(value); setPage(0) }}
          options={[
            { value: 'ALL', label: `Todas · ${lib.copies.length}` },
            ...lib.houses.map(h => ({ value: h.id, label: `${h.name} · ${counts[h.id] || 0}` })),
          ]}
        />
        <button type="button" onClick={() => setModal({ type: 'houses' })} className="inline-flex items-center gap-1.5 text-xs text-slate-400 transition hover:text-sky-300">
          <Settings2 size={13} />Casas
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-80">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={query} onChange={e => { setQuery(e.target.value); setPage(0) }} placeholder="Buscar título, autor, ISBN o editorial…" className={cx(inputClass, 'pl-9')} />
        </div>
        <select value={media} onChange={e => { setMedia(e.target.value); setPage(0) }} className={cx(inputClass, 'w-40')}>
          <option value="ALL">Libros y revistas</option>
          <option value="BOOK">Solo libros</option>
          <option value="MAGAZINE">Solo revistas</option>
        </select>
        <select value={owner} onChange={e => { setOwner(e.target.value); setPage(0) }} className={cx(inputClass, 'w-48')}>
          <option value="ALL">De cualquiera</option>
          {lib.users.map(u => <option key={u.id} value={u.id}>De {u.name}</option>)}
          <option value="FAMILY">De la familia</option>
        </select>
        <select value={filter} onChange={e => { setFilter(e.target.value); setPage(0) }} className={cx(inputClass, 'w-52')}>
          <option value="ALL">Todos los libros</option>
          <option value="UNREAD">Sin leer por mí</option>
          <option value="READ">Leídos por mí</option>
          <option value="LOANED">Prestados</option>
          <option value="MOVE">Para llevar</option>
        </select>
      </div>

      {lib.copies.length === 0 ? (
        <Card className="p-10 text-center">
          <BookCopy className="mx-auto mb-3 text-slate-600" />
          <p className="text-sm text-slate-300">Aún no habéis registrado libros.</p>
          <p className="mt-1 text-xs text-slate-500">Añade uno con su ISBN o importa vuestro CSV.</p>
          <div className="mt-5 flex justify-center gap-2">
            <Button onClick={() => setModal({ type: 'excel' })}><Upload size={15} />Importar Excel</Button>
            <Button onClick={() => setModal({ type: 'import' })}><Upload size={15} />Importar CSV</Button>
            <Button variant="primary" onClick={() => setModal({ type: 'copy', copy: null })}><Plus size={15} />Añadir libro</Button>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-white/5 bg-white/[0.02] text-left text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Libro</th>
                  <th className="px-5 py-3 font-medium">Casa</th>
                  <th className="px-5 py-3 font-medium">De</th>
                  <th className="px-5 py-3 font-medium">Leído por</th>
                  <th className="px-5 py-3 font-medium">Préstamo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {rows.map(c => (
                  <tr key={c.id} onClick={() => setModal({ type: 'copy', copy: c })} className="cursor-pointer transition hover:bg-white/[0.03]">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Cover src={c.cover} size="sm" />
                        <div className="min-w-0">
                          <div className="font-medium text-slate-100">{c.title}</div>
                          <div className="text-xs text-slate-500">{c.mediaKind === 'MAGAZINE' ? `Revista${c.excel?.number ? ` · Nº ${c.excel.number}` : ''}` : c.author || 'Autor desconocido'}</div>
                          <div className="text-[11px] text-slate-600">
                            {[c.publisher, c.editionYear, FORMAT_LABELS[c.format], c.signed ? 'Firmado' : null].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-300"><MapPin size={12} className="text-sky-400" />{housesById[c.houseId]?.name}</span>
                      {c.moveTo && <div className="mt-0.5 text-[11px] text-sky-300">→ {housesById[c.moveTo]?.name}</div>}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-400">{c.ownerId ? usersById[c.ownerId]?.name : 'Familia'}</td>
                    <td className="px-5 py-3"><Readers copy={c} users={lib.users} /></td>
                    <td className="px-5 py-3 text-xs text-amber-200">{c.loanTo ? `${c.loanTo}${c.loanSince ? ` · desde ${c.loanSince}` : ''}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && <div className="p-10 text-center text-sm text-slate-500">No hay libros con esos filtros.</div>}
          <div className="flex items-center justify-between border-t border-white/5 px-5 py-3 text-xs text-slate-500">
            <span>{visible.length} ejemplares</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Anterior</Button>
              <span className="tabular-nums">{safePage + 1} / {pages}</span>
              <Button size="sm" variant="ghost" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)}>Siguiente</Button>
            </div>
          </div>
        </Card>
      )}

      </div>

      {modal?.type === 'copy' && (
        <CopyModal key={modal.copy?.id || 'new'} copy={modal.copy} lib={lib} me={me} run={run} editBook={editBook} onClose={() => setModal(null)} onSaved={saved} />
      )}
      {modal?.type === 'excel' && <ExcelImportModal lib={lib} me={me} run={run} onClose={() => setModal(null)} onSaved={next => apply(next)} />}
      {modal?.type === 'import' && <ImportModal lib={lib} me={me} onClose={() => setModal(null)} onSaved={next => apply(next)} />}
      {modal?.type === 'houses' && <HousesModal lib={lib} onClose={() => setModal(null)} onSaved={apply} />}
    </>
  )
}