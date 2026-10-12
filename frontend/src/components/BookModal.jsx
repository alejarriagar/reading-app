import { useState } from 'react'
import { api } from '../api'
import { Button, Field, Modal, Segmented, STATE_META, STATE_ORDER, cx, inputClass } from './ui'

export default function BookModal({ book, run, onClose }) {
  const [form, setForm] = useState({
    state: book.state,
    year: book.year ?? '',
    rating: book.rating ?? '',
    reread: Boolean(book.reread),
    notes: book.notes || '',
  })
  const [error, setError] = useState('')
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))

  const submit = async () => {
    const year = String(form.year).trim() === '' ? null : Number(form.year)
    const rating = String(form.rating).trim() === '' ? null : Number(String(form.rating).replace(',', '.'))
    if (year !== null && (!Number.isInteger(year) || year < 1000 || year > 2200)) { setError('El año no es válido.'); return }
    if (rating !== null && (Number.isNaN(rating) || rating < 0 || rating > 10)) { setError('La nota debe estar entre 0 y 10.'); return }
    const ok = await run(
      () => api.updateBook(book.id, { state: form.state, year, rating, reread: form.reread, notes: form.notes }),
      'Lectura actualizada',
    )
    if (ok) onClose()
  }

  return (
    <Modal
      open
      title={book.title}
      subtitle={book.authorName}
      onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={submit}>Guardar cambios</Button></>}
    >
      <Field as="div" label="Estado">
        <Segmented value={form.state} onChange={value => set('state', value)} options={STATE_ORDER.map(state => ({ value: state, label: STATE_META[state].label }))} />
      </Field>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Año de lectura" hint="Déjalo vacío si no lo recuerdas.">
          <input className={inputClass} inputMode="numeric" value={form.year} onChange={e => set('year', e.target.value)} placeholder="2026" />
        </Field>
        <Field label="Nota (0–10)">
          <input className={inputClass} inputMode="decimal" value={form.rating} onChange={e => set('rating', e.target.value)} placeholder="8.5" />
        </Field>
      </div>

      <button type="button" role="switch" aria-checked={form.reread} onClick={() => set('reread', !form.reread)} className="mt-5 flex items-center gap-3 text-sm text-slate-300">
        <span className={cx('relative h-5 w-9 rounded-full transition', form.reread ? 'bg-blue-600' : 'bg-white/10')}>
          <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', form.reread ? 'left-[18px]' : 'left-0.5')} />
        </span>
        Es una relectura
      </button>

      <Field label="Notas personales" className="mt-5">
        <textarea className={cx(inputClass, 'h-28 resize-none py-2')} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Personajes, impresiones, citas…" />
      </Field>

      {error && <p className="mt-4 text-xs text-amber-400">{error}</p>}
    </Modal>
  )
}