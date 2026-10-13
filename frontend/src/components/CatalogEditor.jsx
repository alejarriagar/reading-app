import { useEffect, useState } from 'react'
import { Loader2, RotateCcw } from 'lucide-react'
import { api } from '../api'
import { Button, Field, Modal, cx, inputClass } from './ui'
import { GENRES, GENRE_META } from '../lib/genres'

const AUTHOR_FIELDS = [
  ['name', 'Nombre', 'text'],
  ['country', 'País o tradición', 'text'],
  ['period', 'Periodo', 'text'],
  ['birth', 'Nacimiento', 'number'],
  ['death', 'Fallecimiento', 'number'],
  ['image', 'Retrato: dirección HTTPS', 'text'],
  ['movements', 'Corrientes, separadas por comas', 'list'],
]

const BOOK_FIELDS = [
  ['title', 'Título', 'text'],
  ['published', 'Año de publicación', 'number'],
  ['cover', 'Portada: dirección HTTPS', 'text'],
  ['genre', 'Tipo automático del catálogo', 'genre'],
]

function display(value) {
  if (Array.isArray(value)) return value.join(', ')
  if (value == null || value === '') return '—'
  return String(value)
}

export default function CatalogEditor({ target, run, onClose }) {
  const [entry, setEntry] = useState(null)
  const [form, setForm] = useState({})
  const [reason, setReason] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true

    api.catalogDetail(target.kind, target.id)
      .then(next => {
        if (!active) return
        setEntry(next)

        const values = Object.fromEntries(
          Object.entries(next.current).map(([key, value]) => [
            key,
            Array.isArray(value) ? value.join(', ') : (value ?? ''),
          ]),
        )

        setForm(values)
        setReason(next.info.reason || '')
        setSourceUrl(next.info.sourceUrl || '')
      })
      .catch(err => { if (active) setError(err.message) })

    return () => { active = false }
  }, [target.kind, target.id])

  const fields = target.kind === 'author' ? AUTHOR_FIELDS : BOOK_FIELDS
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))

  const save = async () => {
    const changes = {}

    for (const [key, , type] of fields) {
      let value = form[key]

      if (type === 'number') {
        if (value === '') value = null
        else {
          value = Number(value)
          if (!Number.isInteger(value)) {
            setError('Los años deben ser números enteros.')
            return
          }
        }
      } else if (type === 'list') {
        value = [...new Set(
          String(value || '').split(',').map(item => item.trim()).filter(Boolean),
        )]
      } else if (type === 'genre') {
        value = value || null
      } else {
        value = String(value || '').trim()
      }

      if (JSON.stringify(value) !== JSON.stringify(entry.current[key])) {
        changes[key] = value
      }
    }

    if (!reason.trim()) {
      setError('Indica brevemente por qué corriges estos datos.')
      return
    }

    setBusy(true)
    setError('')

    const ok = await run(() => api.updateCatalog(target.kind, target.id, {
      fields: changes,
      reason: reason.trim(),
      source_url: sourceUrl.trim(),
      expected_version: entry.info.updatedAt,
    }))

    setBusy(false)
    if (ok) onClose()
  }

  const reset = async () => {
    if (!window.confirm('¿Restaurar los datos importados? Tus lecturas no se borrarán.')) return

    setBusy(true)

    const ok = await run(() => api.resetCatalog(target.kind, target.id, {
      expected_version: entry.info.updatedAt,
    }))

    setBusy(false)
    if (ok) onClose()
  }

  return (
    <Modal
      open
      title="Datos del catálogo"
      subtitle="Esto no edita tus notas ni tus fechas de lectura."
      onClose={onClose}
      width="max-w-3xl"
      footer={
        <>
          {entry?.canEdit && entry.info.corrected && (
            <Button
              variant="ghost"
              className="mr-auto"
              onClick={reset}
              disabled={busy}
            >
              <RotateCcw size={13} />Restaurar importados
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
          {entry?.canEdit && (
            <Button variant="primary" onClick={save} disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar corrección'}
            </Button>
          )}
        </>
      }
    >
      {!entry ? (
        <div className="py-8 text-sm text-slate-400">
          {error || <Loader2 className="animate-spin" />}
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-xs leading-relaxed text-slate-400">
            <strong className="text-slate-200">{entry.info.scopeLabel}</strong>
            {' · '}{entry.info.origin}
            {entry.info.fetchedAt && (
              <div className="mt-1">
                Descarga de Wikidata: {entry.info.fetchedAt.slice(0, 10)}
              </div>
            )}
            {entry.info.updatedAt && (
              <div className="mt-1">
                Corregido por {entry.info.updatedBy || 'un perfil'}
                {' · '}{entry.info.updatedAt.slice(0, 10)}
              </div>
            )}
            <div className="mt-2">
              {entry.info.scope === 'shared'
                ? 'Las correcciones compartidas afectan a ambos perfiles. Solo el perfil principal puede guardarlas.'
                : 'Estas correcciones se aplican únicamente a este perfil.'}
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {fields.map(([key, label, type]) => (
              <Field
                key={key}
                label={label}
                className={['image', 'cover', 'movements', 'title', 'name'].includes(key) ? 'sm:col-span-2' : ''}
              >
                {type === 'genre' ? (
                  <select
                    className={inputClass}
                    value={form[key] || ''}
                    disabled={!entry.canEdit}
                    onChange={e => set(key, e.target.value)}
                  >
                    <option value="">Sin clasificar</option>
                    {GENRES.map(value => (
                      <option key={value} value={value}>{GENRE_META[value].label}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    className={inputClass}
                    value={form[key] ?? ''}
                    disabled={!entry.canEdit}
                    inputMode={type === 'number' ? 'numeric' : undefined}
                    onChange={e => set(key, e.target.value)}
                  />
                )}
              </Field>
            ))}
          </div>

          {target.kind === 'book' && (
            <p className="mt-3 text-[11px] text-slate-500">
              Tu clasificación personal de la obra sigue teniendo prioridad
              sobre el tipo automático del catálogo.
            </p>
          )}

          {entry.qid && (
            <p className="mt-3 text-[11px] text-slate-500">
              Identificador de Wikidata: {entry.qid}.
              No se cambia en esta entrega: primero hay que validar la identidad.
            </p>
          )}

          <Field label="Motivo de la corrección" className="mt-5">
            <textarea
              className={cx(inputClass, 'h-20 resize-none py-2')}
              value={reason}
              disabled={!entry.canEdit}
              onChange={e => setReason(e.target.value)}
              placeholder="Por ejemplo: la portada correspondía a otra obra."
            />
          </Field>

          <Field
            label="Fuente HTTPS, opcional"
            hint="Se guarda como referencia aportada por ti; la app no la verifica automáticamente."
            className="mt-4"
          >
            <input
              className={inputClass}
              value={sourceUrl}
              disabled={!entry.canEdit}
              onChange={e => setSourceUrl(e.target.value)}
            />
          </Field>

          <details className="mt-5 rounded-xl border border-white/10 p-4">
            <summary className="cursor-pointer text-sm text-slate-300">
              Ver valores originales
            </summary>
            <div className="mt-3 space-y-2 text-xs">
              {fields.map(([key, label]) => (
                <div key={key} className="grid grid-cols-[140px_1fr] gap-3">
                  <span className="text-slate-500">{label}</span>
                  <span className="break-all text-slate-300">
                    {display(entry.original[key])}
                  </span>
                </div>
              ))}
            </div>
          </details>

          <p className="mt-4 text-[11px] text-slate-500">
            Las correcciones no utilizan el «Deshacer» de lecturas.
            Puedes volver a los datos importados con el botón de restauración.
            Las portadas y retratos conservan las licencias de sus fuentes.
          </p>

          {error && <p className="mt-4 text-xs text-amber-300">{error}</p>}
        </>
      )}
    </Modal>
  )
}
