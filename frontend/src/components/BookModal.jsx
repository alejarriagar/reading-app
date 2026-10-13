import { useState } from 'react'
import { MapPin, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { api } from '../api'
import Cover from './Cover'
import { Button, Field, Modal, Segmented, STATE_META, STATE_ORDER, cx, inputClass } from './ui'
import { GENRE_META, GENRES } from '../lib/genres'

const DATE_RE = /^\d{4}(-\d{2}){0,2}$/

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

let tempId = 0
const blank = (extra = {}) => ({ id: `new-${++tempId}`, status: 'done', started: '', finished: '', reread: false, note: '', ...extra })

function DateInput({ value, onChange, disabled }) {
  return (
    <div className="flex gap-1">
      <input
        className={cx(inputClass, 'tabular-nums')}
        value={value}
        disabled={disabled}
        placeholder={disabled ? 'En curso' : 'AAAA-MM-DD'}
        onChange={event => onChange(event.target.value)}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(today())}
        className="shrink-0 rounded-lg border border-white/10 px-2 text-[11px] text-slate-400 transition hover:text-sky-300 disabled:opacity-40"
      >
        Hoy
      </button>
    </div>
  )
}

export default function BookModal({ book, run, onClose, shelf }) {
  const [state, setState] = useState(book.state)
  const [rating, setRating] = useState(book.rating ?? '')
  const [notes, setNotes] = useState(book.notes || '')
  const [genre, setGenre] = useState(book.genreSource === 'user' ? book.genre : '')
  const [readings, setReadings] = useState(() =>
    (book.readings || []).map(r => ({ ...r, started: r.started || '', finished: r.finished || '', note: r.note || '' })))
  const [error, setError] = useState('')

  const update = (id, patch) => setReadings(list => list.map(r => (r.id === id ? { ...r, ...patch } : r)))
  const remove = id => setReadings(list => list.filter(r => r.id !== id))

  const changeState = next => {
    setState(next)
    setReadings(list => {
      const open = list.find(r => r.status === 'open')
      if (next === 'READING' && !open) {
        return [...list, blank({ status: 'open', started: today(), reread: list.some(r => r.status === 'done') })]
      }
      if (next === 'READ' && open) {
        return list.map(r => (r === open ? { ...r, status: 'done', finished: r.finished || today() } : r))
      }
      if ((next === 'LOCKED' || next === 'DISCOVERED') && open) return list.filter(r => r !== open)
      return list
    })
  }

  const submit = async () => {
    const parsedRating = String(rating).trim() === '' ? null : Number(String(rating).replace(',', '.'))
    if (parsedRating !== null && (Number.isNaN(parsedRating) || parsedRating < 0 || parsedRating > 10)) {
      setError('La nota debe estar entre 0 y 10.')
      return
    }
    for (const r of readings) {
      for (const value of [r.started, r.finished]) {
        if (value && !DATE_RE.test(value.trim())) {
          setError(`Fecha no válida: «${value}». Usa AAAA, AAAA-MM o AAAA-MM-DD.`)
          return
        }
      }
    }
    if (readings.filter(r => r.status === 'open').length > 1) {
      setError('Solo puede haber una lectura en curso.')
      return
    }
    const ok = await run(() => api.updateBook(book.id, {
      state,
      year: book.year ?? null,
      rating: parsedRating,
      reread: false,
      notes,
      genre,
      readings: readings.map(r => ({
        id: String(r.id).startsWith('new-') ? null : r.id,
        status: r.status,
        started: r.started.trim() || null,
        finished: r.status === 'open' ? null : (r.finished.trim() || null),
        reread: Boolean(r.reread),
        note: r.note || '',
      })),
    }), 'Lectura actualizada')
    if (ok) onClose()
  }

  const canReread = book.state === 'READ' && !(book.readings || []).some(r => r.status === 'open')
  const reread = async () => {
    const ok = await run(() => api.reread(book.id), `Empiezas a releer «${book.title}»`)
    if (ok) onClose()
  }

  return (
    <Modal
      open
      title={book.title}
      subtitle={book.authorName}
      onClose={onClose}
      width="max-w-2xl"
      footer={
        <>
          {canReread && <Button variant="ghost" onClick={reread} className="mr-auto"><RotateCcw size={14} />Releer</Button>}
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={submit}>Guardar cambios</Button>
        </>
      }
    >
      <div className="mb-5 flex items-center gap-4">
        <Cover src={book.cover} size="md" />
        <div className="text-xs leading-relaxed text-slate-400">
          {book.published ? <div>Publicada en {book.published}</div> : null}
          <div>{book.authorName}</div>
          {book.readCount > 0 && <div>{book.readCount === 1 ? 'Leída una vez' : `Leída ${book.readCount} veces`}</div>}
          {(shelf || []).map(c => (
            <div key={c.id} className="mt-1 inline-flex items-center gap-1.5 text-sky-300">
              <MapPin size={12} />En {c.houseName}{c.ownerName ? ` · de ${c.ownerName}` : ''}{c.loanTo ? ` · prestado a ${c.loanTo}` : ''}
            </div>
          ))}
        </div>
      </div>

      <Field as="div" label="Estado">
        <Segmented value={state} onChange={changeState} options={STATE_ORDER.map(s => ({ value: s, label: STATE_META[s].label }))} />
      </Field>

      <div className="mt-5 grid gap-4 sm:grid-cols-[160px_1fr]">
        <Field label="Nota (0–10)">
          <input className={inputClass} inputMode="decimal" value={rating} onChange={e => setRating(e.target.value)} placeholder="8.5" />
        </Field>
        <Field label="Tipo de obra">
          <select className={inputClass} value={genre} onChange={e => setGenre(e.target.value)}>
            <option value="">
              {book.genreSource && book.genreSource !== 'user' && book.genre
                ? `Automático (${GENRE_META[book.genre].label})`
                : book.genreSource === 'user' ? 'Automático' : 'Automático (sin clasificar)'}
            </option>
            {GENRES.map(key => <option key={key} value={key}>{GENRE_META[key].label}</option>)}
          </select>
        </Field>
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-300">Lecturas</span>
          <button type="button" onClick={() => setReadings(list => [...list, blank({ finished: today() })])} className="inline-flex items-center gap-1 text-xs text-slate-400 transition hover:text-sky-300">
            <Plus size={12} />Añadir lectura
          </button>
        </div>
        {readings.length === 0 && (
          <p className="rounded-lg border border-white/5 px-3 py-3 text-xs text-slate-500">
            Sin lecturas registradas. Se crean solas al marcar «Leyendo» o «Leído».
          </p>
        )}
        <div className="space-y-2">
          {readings.map(r => (
            <div key={r.id} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <Field as="div" label="Inicio">
                <DateInput value={r.started} onChange={v => update(r.id, { started: v })} />
              </Field>
              <Field as="div" label="Fin">
                <DateInput value={r.status === 'open' ? '' : r.finished} disabled={r.status === 'open'} onChange={v => update(r.id, { finished: v })} />
              </Field>
              <button type="button" aria-label="Eliminar lectura" onClick={() => remove(r.id)} className="mb-0.5 rounded-md p-2 text-slate-500 transition hover:bg-white/5 hover:text-rose-300">
                <Trash2 size={14} />
              </button>
              <div className="col-span-3 flex flex-wrap items-center gap-4 text-xs text-slate-400">
                <label className="inline-flex items-center gap-1.5">
                  <input type="checkbox" className="accent-sky-500" checked={r.status === 'open'} onChange={e => update(r.id, { status: e.target.checked ? 'open' : 'done', finished: e.target.checked ? '' : r.finished })} />
                  En curso
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input type="checkbox" className="accent-sky-500" checked={Boolean(r.reread)} onChange={e => update(r.id, { reread: e.target.checked })} />
                  Relectura
                </label>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-500">Puedes poner fechas aproximadas: 2024, 2024-05 o 2024-05-17.</p>
      </div>

      <Field label="Notas personales" className="mt-5">
        <textarea className={cx(inputClass, 'h-28 resize-none py-2')} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Personajes, impresiones, citas…" />
      </Field>

      {error && <p className="mt-4 text-xs text-amber-400">{error}</p>}
    </Modal>
  )
}