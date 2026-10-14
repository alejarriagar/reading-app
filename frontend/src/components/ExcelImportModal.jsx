import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { Button, Field, Modal, inputClass } from './ui'

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = () => reject(new Error('No se ha podido leer el archivo.'))
    reader.readAsDataURL(file)
  })
}

export default function ExcelImportModal({ lib, me, run, onClose, onSaved }) {
  const [target, setTarget] = useState(me.isOwner ? '' : me.id)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [rows, setRows] = useState([])
  const [page, setPage] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [progress, setProgress] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  useEffect(() => {
    if (!busy) return undefined
    const started = Date.now()
    setElapsed(0)
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [busy])

  const change = (index, patch) => setRows(current => current.map(
    (row, i) => i === index ? { ...row, ...patch } : row,
  ))

  const analyse = async () => {
    if (!file || !target) return
    setBusy(true)
    setError('')

    try {
      const encoded = await readFile(file)
      const next = await api.xlsxPreview({
        content: encoded,
        target_user_id: target,
      })

      setPreview(next)
      setRows(next.rows)
      setPage(0)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const selected = rows.filter(row => row.selected)
  const pages = Math.max(1, Math.ceil(rows.length / 20))

  const importNow = async () => {
    if (!window.confirm(
      `¿Importar ${selected.length} filas para ${preview.target.name}? `
      + 'Se registrarán ejemplares y sus datos personales de lectura.',
    )) return

    setBusy(true)
    setError('')
    setProgress({
      label: 'Enviando el lote',
      done: 0,
      total: 0,
      percent: 0,
    })

    try {
      const started = await api.startXlsxImport({
        target_user_id: preview.target.id,
        rows: selected,
      })

      let finished = null
      let failedChecks = 0

      while (alive.current) {
        let status

        try {
          status = await api.xlsxJob(started.jobId)
          failedChecks = 0
        } catch (err) {
          failedChecks += 1

          if (failedChecks >= 5) {
            throw new Error(
              'No se puede consultar el progreso. La importación podría seguir '
              + 'en el servidor; revisa su terminal antes de iniciar otra.',
            )
          }

          setProgress(current => ({
            ...current,
            label: 'Intentando recuperar la conexión; no reinicies el servidor',
          }))
          await new Promise(resolve => setTimeout(resolve, 2000))
          continue
        }

        if (!alive.current) return

        setProgress(status.progress)

        if (status.state === 'error') {
          throw new Error(status.error || 'La importación no ha terminado.')
        }

        if (status.state === 'done') {
          finished = status.result
          break
        }

        await new Promise(resolve => setTimeout(resolve, 800))
      }

      if (!alive.current || !finished) return

      setResult(finished)
      setProgress({
        label: 'Importación guardada. Actualizando las vistas',
        done: 1,
        total: 1,
        percent: 100,
      })

      try {
        onSaved(await api.library())
        await run(() => api.state())
      } catch {
        setError(
          'La importación se ha guardado. Recarga la página para actualizar las vistas.',
        )
      }

      if (alive.current) {
        setProgress({
          label: 'Importación terminada',
          done: 1,
          total: 1,
          percent: 100,
        })
      }

    } catch (err) {
      if (alive.current) setError(
        err.message
        + ' Si el servidor se interrumpió, vuelve a analizar el mismo archivo '
        + 'para revisar las filas pendientes.',
      )
    } finally {
      if (alive.current) setBusy(false)
    }
  }

  return (
    <Modal
      open
      title="Importar Excel de la biblioteca"
      subtitle="Libros, Revistas y Hoja3 · precios en pesetas"
      onClose={busy ? () => {} : onClose}
      width="max-w-5xl"
      footer={result
        ? <Button variant="primary" onClick={onClose}>Cerrar</Button>
        : <>
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
            {preview
              ? <Button
                  variant="primary"
                  onClick={importNow}
                  disabled={busy || !selected.length}
                >
                  {busy ? 'Importando…' : `Importar ${selected.length} filas`}
                </Button>
              : <Button
                  variant="primary"
                  onClick={analyse}
                  disabled={busy || !file || !target}
                >
                  {busy ? 'Analizando…' : 'Ver vista previa'}
                </Button>}
          </>}
    >
      {result ? (
        <div className="space-y-3 text-sm text-slate-300">
          <p className="text-emerald-300">Importación guardada para {result.targetName}.</p>
          <p>Ejemplares nuevos: {result.created}.</p>
          <p>Ejemplares existentes reutilizados: {result.reused}.</p>
          <p>Filas ya registradas: {result.alreadyRecorded}.</p>
          <p>Filas personales aplicadas: {result.personalRows}.</p>
          <p className="text-xs text-slate-500">
            Copia previa: backups/{result.backup}
          </p>
          {result.warnings.length > 0 && (
            <ul className="max-h-60 list-disc space-y-1 overflow-y-auto pl-5 text-xs text-amber-200">
              {result.warnings.map((warning, i) => <li key={i}>{warning}</li>)}
            </ul>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Perfil destinatario">
              <select
                className={inputClass}
                value={target}
                disabled={busy || Boolean(preview)}
                onChange={e => setTarget(e.target.value)}
              >
                <option value="">Elige el perfil de tu padre</option>
                {lib.users
                  .filter(user => me.isOwner || user.id === me.id)
                  .map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select>
            </Field>

            <Field label="Archivo .xlsx, hasta 8 MB">
              <input
                type="file"
                accept=".xlsx"
                disabled={busy || Boolean(preview)}
                className="text-sm text-slate-300"
                onChange={e => {
                  const next = e.target.files?.[0]
                  if (next && next.size > 8 * 1024 * 1024) {
                    setError('El archivo supera 8 MB.')
                    setFile(null)
                    return
                  }
                  setFile(next || null)
                  setError('')
                }}
              />
            </Field>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-slate-400">
            Los ejemplares serán de este perfil. Frases y comentarios se guardan
            en sus datos personales, no en las notas familiares.
            «Sí» no recibe una fecha inventada; «Parcial» no pasa a «Leyendo».
            Los volúmenes se conservan como información del registro.
          </p>

          {preview && (
            <>
              <div className="mt-5 flex flex-wrap gap-3 text-xs text-slate-400">
                {preview.sheets.map(sheet => (
                  <span key={sheet.name}>{sheet.name}: {sheet.rows}</span>
                ))}
                <span>Seleccionadas: {selected.length}</span>
              </div>

              {preview.warnings.map((warning, i) => (
                <p key={i} className="mt-2 text-xs text-amber-200">{warning}</p>
              ))}

              <p className="mt-3 text-xs text-slate-500">
                Un ejemplar coincidente se reutiliza. Marca «Otro» solo si sabes
                que es otro ejemplar físico. Las filas ya importadas no se seleccionan.
              </p>

              <div className="mt-3 max-h-[430px] overflow-auto rounded-xl border border-white/10">
                <table className="w-full min-w-[850px] text-xs">
                  <thead className="bg-[#0F172A] text-left text-slate-500">
                    <tr>
                      {['', 'Origen', 'Título / Autor', 'Tipo / Casa', 'Lectura / Nota', 'Vol. / Nº', 'Otro'].map((label, i) => (
                        <th key={i} className="px-2 py-3">{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-300">
                    {rows.slice(page * 20, (page + 1) * 20).map((row, offset) => {
                      const index = page * 20 + offset

                      return (
                        <tr key={index}>
                          <td className="px-2 py-2 align-top">
                            <input
                              type="checkbox"
                              checked={row.selected}
                              disabled={busy}
                              onChange={e => change(index, { selected: e.target.checked })}
                            />
                          </td>
                          <td className="px-2 py-2 align-top">
                            {row.sourceSheet} · {row.sourceRow}
                            {row.alreadyImported && <div className="text-emerald-300">Ya importada</div>}
                          </td>
                          <td className="min-w-64 px-2 py-2">
                            <input
                              className={inputClass}
                              value={row.title}
                              onChange={e => change(index, { title: e.target.value })}
                            />
                            <input
                              className={`${inputClass} mt-1`}
                              value={row.author}
                              placeholder="Autor"
                              onChange={e => change(index, { author: e.target.value })}
                            />
                            {row.existingCopies > 0 && (
                              <div className="mt-1 text-amber-200">
                                Coincidencias en esa casa: {row.existingCopies}
                              </div>
                            )}
                            {row.issues.map((issue, i) => (
                              <div key={i} className="mt-1 text-amber-200">{issue}</div>
                            ))}
                          </td>
                          <td className="px-2 py-2 align-top">
                            <select
                              className={inputClass}
                              value={row.mediaKind}
                              onChange={e => change(index, { mediaKind: e.target.value })}
                            >
                              <option value="BOOK">Libro</option>
                              <option value="MAGAZINE">Revista</option>
                            </select>
                            <select
                              className={`${inputClass} mt-1`}
                              value={row.house}
                              onChange={e => change(index, { house: e.target.value })}
                            >
                              <option value="Pozuelo">Pozuelo</option>
                              <option value="Calpe">Calpe</option>
                            </select>
                            <div className="mt-1 max-w-40 text-slate-500">{row.location}</div>
                          </td>
                          <td className="px-2 py-2 align-top">
                            {row.reading || 'Sin indicar'}
                            <div className="mt-1">{row.ratingOriginal || 'Sin nota'}</div>
                          </td>
                          <td className="px-2 py-2 align-top">
                            {row.volumes || '—'}
                            {row.number && <div>Nº {row.number}</div>}
                            {row.price && <div className="mt-1 text-slate-500">{row.price} ptas.</div>}
                          </td>
                          <td className="px-2 py-2 align-top">
                            <input
                              type="checkbox"
                              checked={Boolean(row.allowExtra)}
                              onChange={e => change(index, { allowExtra: e.target.checked })}
                              disabled={row.alreadyImported || busy}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setPreview(null); setRows([]) }}
                  disabled={busy}
                >
                  Elegir otro archivo o perfil
                </Button>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Button size="sm" disabled={page === 0 || busy} onClick={() => setPage(page - 1)}>
                    Anterior
                  </Button>
                  {page + 1} / {pages}
                  <Button size="sm" disabled={page >= pages - 1 || busy} onClick={() => setPage(page + 1)}>
                    Siguiente
                  </Button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {progress && (
        <div className="mt-5 rounded-xl border border-sky-500/20 bg-sky-500/[0.05] p-4" aria-live="polite">
          <div className="flex items-center justify-between gap-3 text-sm text-slate-200">
            <span>{progress.label}</span>
            <span className="shrink-0 tabular-nums text-sky-300">{progress.percent}%</span>
          </div>
          <progress max="100" value={progress.percent} className="mt-3 h-2 w-full accent-sky-400" />
          <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500">
            <span>{progress.total > 1 ? `${progress.done} / ${progress.total} filas revisadas` : ''}</span>
            <span>{Math.floor(elapsed / 60)} min {String(elapsed % 60).padStart(2, '0')} s</span>
          </div>
          {busy && <p className="mt-2 text-[11px] text-slate-500">No detengas el servidor mientras se guarda el lote.</p>}
        </div>
      )}
      {error && <p className="mt-4 text-xs text-amber-300">{error}</p>}
    </Modal>
  )
}
