import { useState } from 'react'
import { AlertTriangle, Search, Trash2 } from 'lucide-react'
import { api } from '../api'
import Cover from './Cover'
import { Button, Field, Modal, STATE_META, StateBadge, cx, inputClass } from './ui'
import { FORMAT_LABELS, normalize } from '../lib/shelves'

const EMPTY = {
  title: '', author: '', isbn: '', publisher: '', edition_year: '', language: '', format: '',
  house_id: '', owner_id: '', signed: false, notes: '', loan_to: '', loan_since: '', move_to: '', cover: '',
}

function toForm(copy, lib, me) {
  if (!copy) return { ...EMPTY, house_id: lib.houses[0]?.id || '', owner_id: me?.id || '' }
  return {
    title: copy.title || '',
    author: copy.author || '',
    isbn: copy.isbn || '',
    publisher: copy.publisher || '',
    edition_year: copy.editionYear ?? '',
    language: copy.language || '',
    format: copy.format || '',
    house_id: copy.houseId || '',
    owner_id: copy.ownerId || '',
    signed: Boolean(copy.signed),
    notes: copy.notes || '',
    loan_to: copy.loanTo || '',
    loan_since: copy.loanSince || '',
    move_to: copy.moveTo || '',
    cover: copy.cover || '',
  }
}

export default function CopyModal({ copy, lib, me, run, editBook, onClose, onSaved }) {
  const [form, setForm] = useState(() => toForm(copy, lib, me))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const housesById = Object.fromEntries(lib.houses.map(h => [h.id, h]))

  const lookup = async () => {
    if (!form.isbn.trim()) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const info = await api.isbn(form.isbn.trim())
      setForm(current => ({
        ...current,
        isbn: info.isbn,
        title: current.title || info.title || '',
        author: current.author || info.author || '',
        publisher: current.publisher || info.publisher || '',
        edition_year: current.edition_year || info.edition_year || '',
        language: current.language || info.language || '',
        cover: info.cover || current.cover,
      }))
      setNotice(`Encontrado: «${info.title}»`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const duplicates = form.title.trim()
    ? lib.copies.filter(c => c.id !== copy?.id && normalize(c.title) === normalize(form.title))
    : []

  const save = async () => {
    setBusy(true)
    setError('')
    const body = {
      ...form,
      edition_year: form.edition_year === '' ? null : Number(form.edition_year) || null,
      owner_id: form.owner_id || null,
      move_to: form.move_to || null,
      loan_since: form.loan_to ? (form.loan_since || null) : null,
      format: form.format || null,
    }
    try {
      const next = copy ? await api.updateCopy(copy.id, body) : await api.addCopy(body)
      onSaved(next, copy ? 'Ejemplar actualizado' : 'Ejemplar añadido')
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!window.confirm(`¿Eliminar este ejemplar de «${copy.title}»? No se puede deshacer.`)) return
    try {
      onSaved(await api.deleteCopy(copy.id), 'Ejemplar eliminado')
    } catch (err) {
      setError(err.message)
    }
  }

  const mine = copy?.readers?.find(r => r.userId === me?.id)
  const others = (copy?.readers || []).filter(r => r.userId !== me?.id && r.state && r.state !== 'LOCKED')

  const addToMine = async state => {
    const ok = await run(
      () => api.addBook({ title: copy.title, author: copy.author || 'Autor desconocido', state }),
      'Añadido a tu biblioteca de lecturas',
    )
    if (ok) onClose()
  }

  return (
    <Modal
      open
      title={copy ? 'Ejemplar' : 'Añadir libro a las estanterías'}
      subtitle={copy ? copy.title : 'Escribe el ISBN para rellenar los datos automáticamente.'}
      onClose={onClose}
      width="max-w-2xl"
      footer={
        <>
          {copy && <Button variant="ghost" onClick={remove} className="mr-auto"><Trash2 size={14} />Eliminar</Button>}
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={save} disabled={busy}>{copy ? 'Guardar cambios' : 'Añadir'}</Button>
        </>
      }
    >
      <div className="flex gap-5">
        <Cover src={form.cover} size="lg" />
        <div className="min-w-0 flex-1 space-y-4">
          <Field as="div" label="ISBN">
            <div className="flex gap-2">
              <input
                className={cx(inputClass, 'tabular-nums')}
                value={form.isbn}
                onChange={e => set('isbn', e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); lookup() } }}
                placeholder="978-84-…"
                autoFocus={!copy}
              />
              <Button onClick={lookup} disabled={busy || !form.isbn.trim()}><Search size={14} />Buscar</Button>
            </div>
          </Field>
          <Field label="Título"><input className={inputClass} value={form.title} onChange={e => set('title', e.target.value)} /></Field>
          <Field label="Autor"><input className={inputClass} value={form.author} onChange={e => set('author', e.target.value)} /></Field>
        </div>
      </div>

      {notice && <p className="mt-3 text-xs text-emerald-300">{notice}</p>}
      {duplicates.length > 0 && (
        <p className="mt-3 flex items-center gap-2 text-xs text-amber-300">
          <AlertTriangle size={13} />
          Ya tenéis {duplicates.length === 1 ? 'un ejemplar' : `${duplicates.length} ejemplares`}: {[...new Set(duplicates.map(d => housesById[d.houseId]?.name).filter(Boolean))].join(', ')}
        </p>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <Field label="Casa">
          <select className={inputClass} value={form.house_id} onChange={e => set('house_id', e.target.value)}>
            {lib.houses.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </Field>
        <Field label="De quién es">
          <select className={inputClass} value={form.owner_id} onChange={e => set('owner_id', e.target.value)}>
            <option value="">De la familia</option>
            {lib.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </Field>
        <Field label="Formato">
          <select className={inputClass} value={form.format} onChange={e => set('format', e.target.value)}>
            <option value="">—</option>
            {Object.entries(FORMAT_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </Field>
        <Field label="Editorial"><input className={inputClass} value={form.publisher} onChange={e => set('publisher', e.target.value)} /></Field>
        <Field label="Año de la edición"><input className={inputClass} inputMode="numeric" value={form.edition_year} onChange={e => set('edition_year', e.target.value)} /></Field>
        <Field label="Idioma"><input className={inputClass} value={form.language} onChange={e => set('language', e.target.value)} placeholder="es" /></Field>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Field label="Prestado a"><input className={inputClass} value={form.loan_to} onChange={e => set('loan_to', e.target.value)} placeholder="Nadie" /></Field>
        <Field label="Desde"><input className={inputClass} type="date" value={form.loan_since} disabled={!form.loan_to} onChange={e => set('loan_since', e.target.value)} /></Field>
        <Field label="Llevar a otra casa">
          <select className={inputClass} value={form.move_to} onChange={e => set('move_to', e.target.value)}>
            <option value="">No</option>
            {lib.houses.filter(h => h.id !== form.house_id).map(h => <option key={h.id} value={h.id}>A {h.name}</option>)}
          </select>
        </Field>
      </div>

      <label className="mt-4 inline-flex items-center gap-2 text-sm text-slate-300">
        <input type="checkbox" className="accent-sky-500" checked={form.signed} onChange={e => set('signed', e.target.checked)} />
        Firmado o dedicado
      </label>

      <Field label="Notas" className="mt-4">
        <textarea className={cx(inputClass, 'h-20 resize-none py-2')} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Regalo de…, edición especial, estado…" />
      </Field>

      {copy && (
        <div className="mt-6 rounded-xl border border-white/5 bg-white/[0.02] p-4">
          <div className="text-xs font-medium text-slate-300">Tu lectura</div>
          {copy.myBookId ? (
            <div className="mt-2 flex items-center justify-between gap-3">
              <StateBadge state={mine?.state || 'LOCKED'} />
              <Button size="sm" onClick={() => { onClose(); editBook(copy.myBookId) }}>Abrir ficha</Button>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500">No está en tu biblioteca de lecturas.</span>
              {[['READ', 'Lo he leído'], ['READING', 'Lo estoy leyendo'], ['DISCOVERED', 'Quiero leerlo']].map(([state, label]) => (
                <Button key={state} size="sm" onClick={() => addToMine(state)}>{label}</Button>
              ))}
            </div>
          )}
          {others.map(r => (
            <p key={r.userId} className="mt-2 text-xs text-slate-400">
              {r.name}: {STATE_META[r.state]?.label || r.state}{r.rating != null ? ` · nota ${r.rating}` : ''}
            </p>
          ))}
        </div>
      )}

      {error && <p className="mt-4 text-xs text-amber-400">{error}</p>}
    </Modal>
  )
}