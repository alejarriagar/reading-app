import { useEffect, useState } from 'react'
import {
  AlertTriangle, Check, Heart, Loader2, MapPin,
  Pencil, Plus, Search, ShoppingBag, Trash2,
} from 'lucide-react'

import { api } from '../api'
import Cover from './Cover'
import {
  Button, Card, Field, Modal, Segmented,
  cx, inputClass,
} from './ui'
import { FORMAT_LABELS, normalize } from '../lib/shelves'

const PRIORITIES = {
  HIGH: { label: 'Alta', className: 'text-amber-300 border-amber-400/30 bg-amber-400/10' },
  NORMAL: { label: 'Normal', className: 'text-slate-300 border-white/10 bg-white/[0.03]' },
  LOW: { label: 'Algún día', className: 'text-slate-500 border-white/5 bg-white/[0.02]' },
}

function ExistingCopies({ matches }) {
  if (!matches?.length) return null

  return (
    <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-amber-200">
        <AlertTriangle size={13} />
        Revisad antes de comprar: ya hay un ejemplar o una posible coincidencia.
      </div>
      <ul className="mt-2 space-y-1 text-xs text-slate-400">
        {matches.map(copy => (
          <li key={copy.id} className="flex items-center gap-1.5">
            <MapPin size={11} />
            {copy.houseName} · {copy.matchReason}
            {copy.loanTo && ` · prestado a ${copy.loanTo}`}
          </li>
        ))}
      </ul>
    </div>
  )
}

function WishForm({ item, lib, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: item?.title || '',
    author: item?.author || '',
    isbn: item?.isbn || '',
    publisher: item?.publisher || '',
    edition_year: item?.edition_year ?? '',
    language: item?.language || '',
    cover: item?.cover || '',
    priority: item?.priority || 'NORMAL',
    notes: item?.notes || '',
  })

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))

  const lookup = async () => {
    if (!form.isbn.trim()) return
    setBusy(true)
    setError('')

    try {
      const found = await api.isbn(form.isbn.trim())

      setForm(current => ({
        ...current,
        isbn: found.isbn || current.isbn,
        title: current.title || found.title || '',
        author: current.author || found.author || '',
        publisher: current.publisher || found.publisher || '',
        edition_year: current.edition_year || found.edition_year || '',
        language: current.language || found.language || '',
        cover: found.cover || current.cover,
      }))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const duplicates = lib.copies.filter(copy => {
    const sameIsbn = form.isbn
      && String(copy.isbn || '').replace(/[^0-9X]/gi, '')
        === form.isbn.replace(/[^0-9X]/gi, '')

    const sameTitle = form.title.trim()
      && normalize(copy.title) === normalize(form.title)

    const compatibleAuthor = !copy.author
      || !form.author
      || normalize(copy.author) === normalize(form.author)

    return sameIsbn || (sameTitle && compatibleAuthor)
  })

  const save = async () => {
    if (!form.title.trim()) {
      setError('El título es obligatorio.')
      return
    }

    const editionYear = form.edition_year === ''
      ? null
      : Number(form.edition_year)

    if (editionYear !== null && !Number.isInteger(editionYear)) {
      setError('El año de edición debe ser un número entero.')
      return
    }

    setBusy(true)
    setError('')

    try {
      const body = { ...form, edition_year: editionYear }

      const result = item
        ? await api.updateWish(item.id, body)
        : await api.addWish(body)

      onSaved(result, item ? 'Deseo actualizado' : 'Deseo añadido')
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title={item ? 'Editar deseo' : 'Añadir un deseo'}
      subtitle="Esta lista es compartida. Las notas las verán los dos perfiles."
      onClose={onClose}
      width="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={save} disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="flex gap-4">
        <Cover src={form.cover} size="md" />
        <div className="min-w-0 flex-1">
          <Field as="div" label="ISBN, si conoces la edición">
            <div className="flex gap-2">
              <input
                className={inputClass}
                value={form.isbn}
                onChange={e => set('isbn', e.target.value)}
                placeholder="ISBN opcional"
              />
              <Button onClick={lookup} disabled={busy || !form.isbn.trim()}>
                <Search size={14} />Buscar
              </Button>
            </div>
          </Field>
          <Field label="Título" className="mt-3">
            <input
              className={inputClass}
              value={form.title}
              onChange={e => set('title', e.target.value)}
              autoFocus={!item}
            />
          </Field>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Autor">
          <input
            className={inputClass}
            value={form.author}
            onChange={e => set('author', e.target.value)}
          />
        </Field>

        <Field label="Prioridad">
          <select
            className={inputClass}
            value={form.priority}
            onChange={e => set('priority', e.target.value)}
          >
            {Object.entries(PRIORITIES).map(([key, value]) => (
              <option key={key} value={key}>{value.label}</option>
            ))}
          </select>
        </Field>

        <Field label="Editorial">
          <input
            className={inputClass}
            value={form.publisher}
            onChange={e => set('publisher', e.target.value)}
          />
        </Field>

        <Field label="Año de edición">
          <input
            className={inputClass}
            inputMode="numeric"
            value={form.edition_year}
            onChange={e => set('edition_year', e.target.value)}
          />
        </Field>
      </div>

      {duplicates.length > 0 && (
        <p className="mt-4 flex gap-2 text-xs text-amber-300">
          <AlertTriangle size={14} className="shrink-0" />
          Ya hay {duplicates.length} ejemplar(es) con ese ISBN o título.
          Puedes mantener el deseo si buscas otra edición.
        </p>
      )}

      <Field label="Nota compartida" className="mt-4">
        <textarea
          className={cx(inputClass, 'h-24 resize-none py-2')}
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          placeholder="Por qué lo queremos, edición preferida, idea para un regalo…"
        />
      </Field>

      {error && <p className="mt-4 text-xs text-amber-300">{error}</p>}
    </Modal>
  )
}

function AcquireForm({ item, lib, me, onClose, onSaved }) {
  const [form, setForm] = useState({
    house_id: lib.houses[0]?.id || '',
    owner_id: me?.id || '',
    format: '',
    isbn: item.isbn || '',
    publisher: item.publisher || '',
    edition_year: item.edition_year ?? '',
    notes: '',
  })

  const [confirmed, setConfirmed] = useState(false)
  const [needsConfirm, setNeedsConfirm] = useState(Boolean(item.matches?.length))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))

  const save = async () => {
    if (needsConfirm && !confirmed) {
      setError('Confirma que quieres registrar otro ejemplar.')
      return
    }

    const year = form.edition_year === '' ? null : Number(form.edition_year)

    if (year !== null && !Number.isInteger(year)) {
      setError('El año de edición no es válido.')
      return
    }

    setBusy(true)
    setError('')

    try {
      const result = await api.acquireWish(item.id, {
        title: item.title,
        author: item.author,
        house_id: form.house_id,
        owner_id: form.owner_id || null,
        format: form.format || null,
        isbn: form.isbn,
        publisher: form.publisher,
        edition_year: year,
        language: item.language || '',
        cover: item.cover || '',
        notes: form.notes,
        allow_duplicate: confirmed,
      })

      onSaved(result)
    } catch (err) {
      setError(err.message)

      if (err.message.includes('Confirma que quieres registrar')) {
        setNeedsConfirm(true)
      }

      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title="Ya lo tenemos"
      subtitle={item.title}
      onClose={onClose}
      width="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={save} disabled={busy}>
            {busy ? 'Guardando…' : 'Añadir a estanterías'}
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-slate-400">
        Se creará un ejemplar y el deseo pasará a «Conseguido».
        No se marcará como leído por nadie.
      </p>

      <ExistingCopies matches={item.matches} />

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Casa">
          <select
            className={inputClass}
            value={form.house_id}
            onChange={e => set('house_id', e.target.value)}
          >
            {lib.houses.map(house => (
              <option key={house.id} value={house.id}>{house.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Propietario">
          <select
            className={inputClass}
            value={form.owner_id}
            onChange={e => set('owner_id', e.target.value)}
          >
            <option value="">De la familia</option>
            {lib.users.map(user => (
              <option key={user.id} value={user.id}>{user.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Formato">
          <select
            className={inputClass}
            value={form.format}
            onChange={e => set('format', e.target.value)}
          >
            <option value="">Sin especificar</option>
            {Object.entries(FORMAT_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </Field>

        <Field label="ISBN de la edición conseguida">
          <input
            className={inputClass}
            value={form.isbn}
            onChange={e => set('isbn', e.target.value)}
          />
        </Field>

        <Field label="Editorial">
          <input
            className={inputClass}
            value={form.publisher}
            onChange={e => set('publisher', e.target.value)}
          />
        </Field>

        <Field label="Año de edición">
          <input
            className={inputClass}
            inputMode="numeric"
            value={form.edition_year}
            onChange={e => set('edition_year', e.target.value)}
          />
        </Field>
      </div>

      <Field label="Notas del ejemplar" className="mt-4">
        <input
          className={inputClass}
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          placeholder="Regalo de…, comprado en…"
        />
      </Field>

      {needsConfirm && (
        <label className="mt-4 flex items-center gap-2 text-sm text-amber-200">
          <input
            type="checkbox"
            className="accent-sky-500"
            checked={confirmed}
            onChange={e => setConfirmed(e.target.checked)}
          />
          Confirmo que es otro ejemplar, aunque ya tengamos este libro.
        </label>
      )}

      {error && <p className="mt-4 text-xs text-amber-300">{error}</p>}
    </Modal>
  )
}

export default function WishlistSection({ lib, me, run, onInventoryChange }) {
  const [items, setItems] = useState(null)
  const [filter, setFilter] = useState('PENDING')
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [acting, setActing] = useState(null)

  useEffect(() => {
    let active = true

    api.wishlist()
      .then(result => { if (active) setItems(result.items) })
      .catch(err => { if (active) setError(err.message) })

    return () => { active = false }
  }, [])

  const apply = (result, message) => {
    setItems(result.items)
    setNotice(message)
    setError('')
  }

  const saved = (result, message) => {
    apply(result, message)
    setModal(null)
  }

  const acquireSaved = async result => {
    apply(result, 'Ejemplar añadido. El deseo está conseguido.')
    setModal(null)

    try {
      const inventory = await api.library()
      onInventoryChange(inventory)

      // Solo refresca el estado visual: no modifica las lecturas.
      await run(() => api.state())
    } catch {
      setNotice('Ejemplar guardado. Recarga la página para actualizar todas las etiquetas.')
    }
  }

  const reserve = async (item, reserved) => {
    setActing(item.id)

    try {
      apply(
        await api.reserveWish(item.id, reserved),
        reserved ? 'Ahora te encargas de este libro.' : 'Reserva liberada.',
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setActing(null)
    }
  }

  const remove = async item => {
    const message = item.state === 'ACQUIRED'
      ? `¿Borrar «${item.title}» de la lista de deseos? El ejemplar seguirá en Estanterías.`
      : `¿Borrar el deseo «${item.title}»? No se puede deshacer.`

    if (!window.confirm(message)) return

    try {
      apply(await api.deleteWish(item.id), 'Deseo eliminado.')
    } catch (err) {
      setError(err.message)
    }
  }

  if (!items) {
    return (
      <Card className="p-8 text-sm text-slate-400">
        {error || <Loader2 className="animate-spin" />}
      </Card>
    )
  }

  const pending = items.filter(item => item.state !== 'ACQUIRED').length
  const reserved = items.filter(item => item.state === 'RESERVED').length
  const acquired = items.filter(item => item.state === 'ACQUIRED').length
  const q = normalize(query)

  const visible = items
    .filter(item =>
      filter === 'ALL'
      || (filter === 'PENDING' && item.state !== 'ACQUIRED')
      || (filter === 'RESERVED' && item.state === 'RESERVED')
      || (filter === 'ACQUIRED' && item.state === 'ACQUIRED'))
    .filter(item => !q || normalize(`${item.title} ${item.author} ${item.notes}`).includes(q))

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <Heart size={18} className="text-rose-300" />
            Libros que queremos conseguir
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Una lista compartida, independiente de lo que cada uno ha leído.
          </p>
        </div>

        <Button variant="primary" onClick={() => setModal({ type: 'edit', item: null })}>
          <Plus size={14} />Añadir deseo
        </Button>
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'PENDING', label: `Pendientes · ${pending}` },
            { value: 'RESERVED', label: `Nos encargamos · ${reserved}` },
            { value: 'ACQUIRED', label: `Conseguidos · ${acquired}` },
            { value: 'ALL', label: 'Todos' },
          ]}
        />

        <div className="relative w-full sm:w-72">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            className={cx(inputClass, 'pl-9')}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar deseo…"
          />
        </div>
      </div>

      {notice && (
        <p className="mb-4 text-xs text-emerald-300">{notice}</p>
      )}
      {error && (
        <p className="mb-4 text-xs text-amber-300">{error}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {visible.map(item => {
          const priority = PRIORITIES[item.priority] || PRIORITIES.NORMAL
          const isAcquired = item.state === 'ACQUIRED'
          const reservedByOther = item.reservedBy && item.reservedBy !== me.id
          const canManageReservation = !reservedByOther || me.isOwner

          return (
            <Card key={item.id} className="p-5">
              <div className="flex gap-4">
                <Cover src={item.cover} size="md" />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cx('rounded-md border px-2 py-0.5 text-[10px]', priority.className)}>
                      {priority.label}
                    </span>

                    {isAcquired && (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
                        <Check size={12} />Conseguido
                      </span>
                    )}
                  </div>

                  <h3 className="mt-2 text-base font-semibold text-white">{item.title}</h3>
                  <p className="mt-0.5 text-xs text-slate-400">{item.author || 'Autor por concretar'}</p>
                  <p className="mt-2 text-[11px] text-slate-500">
                    Lo añadió {item.requestedName}
                  </p>

                  {item.reservedName && !isAcquired && (
                    <p className="mt-1 text-xs text-sky-300">
                      Se encarga {item.reservedName}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-start">
                  {!isAcquired && (
                    <button
                      type="button"
                      aria-label="Editar deseo"
                      onClick={() => setModal({ type: 'edit', item })}
                      className="rounded-md p-2 text-slate-500 hover:text-sky-300"
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="Eliminar deseo"
                    onClick={() => remove(item)}
                    className="rounded-md p-2 text-slate-500 hover:text-rose-300"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {item.notes && (
                <p className="mt-3 text-sm leading-relaxed text-slate-400">{item.notes}</p>
              )}

              {!isAcquired && <ExistingCopies matches={item.matches} />}

              {!isAcquired && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {item.state === 'RESERVED' ? (
                    canManageReservation && (
                      <Button
                        size="sm"
                        onClick={() => reserve(item, false)}
                        disabled={acting === item.id}
                      >
                        Liberar reserva
                      </Button>
                    )
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => reserve(item, true)}
                      disabled={acting === item.id}
                    >
                      <ShoppingBag size={13} />Me encargo
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="primary"
                    disabled={Boolean(reservedByOther && !me.isOwner)}
                    onClick={() => setModal({ type: 'acquire', item })}
                  >
                    <Check size={13} />Añadir a estanterías
                  </Button>
                </div>
              )}
            </Card>
          )
        })}
      </div>

      {visible.length === 0 && (
        <Card className="p-10 text-center">
          <Heart className="mx-auto mb-3 text-slate-600" />
          <p className="text-sm text-slate-400">No hay deseos en esta vista.</p>
          <p className="mt-1 text-xs text-slate-500">
            Añadir un deseo no significa que tengáis que comprarlo.
          </p>
        </Card>
      )}

      {modal?.type === 'edit' && (
        <WishForm
          key={modal.item?.id || 'new'}
          item={modal.item}
          lib={lib}
          onClose={() => setModal(null)}
          onSaved={saved}
        />
      )}

      {modal?.type === 'acquire' && (
        <AcquireForm
          item={modal.item}
          lib={lib}
          me={me}
          onClose={() => setModal(null)}
          onSaved={acquireSaved}
        />
      )}
    </>
  )
}