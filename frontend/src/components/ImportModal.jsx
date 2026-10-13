import { useState } from 'react'
import { Download, FileUp } from 'lucide-react'
import { api } from '../api'
import { Button, Field, Modal, inputClass } from './ui'

const FIELD_LABELS = {
  title: 'Título', author: 'Autor', isbn: 'ISBN', publisher: 'Editorial', edition_year: 'Año',
  house: 'Casa', owner: 'Propietario', format: 'Formato', notes: 'Notas', language: 'Idioma',
}

function readFile(file) {
  const read = encoding => new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsText(file, encoding)
  })
  return read('utf-8').then(text => (text.includes('\uFFFD') ? read('windows-1252') : text))
}

export default function ImportModal({ lib, me, onClose, onSaved }) {
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState(null)
  const [houseId, setHouseId] = useState(lib.houses[0]?.id || '')
  const [ownerId, setOwnerId] = useState(me?.id || '')
  const [lookupMissing, setLookupMissing] = useState(true)
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const template = () => {
    const csv = `\uFEFFtitulo;autor;isbn;editorial;año;casa;propietario;formato;notas\nCien años de soledad;Gabriel García Márquez;9788497592208;Debolsillo;2003;Boadilla;${me?.name || ''};bolsillo;\n`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'plantilla-estanterias.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const choose = async event => {
    const file = event.target.files?.[0]
    if (!file) return
    setText(await readFile(file))
    setFileName(file.name)
    setPreview(null)
    setResult(null)
    setError('')
  }

  const analyse = async () => {
    setBusy(true)
    setError('')
    try {
      setPreview(await api.importPreview({ text }))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const run = async () => {
    setBusy(true)
    setError('')
    try {
      const next = await api.importRows({
        rows: preview.rows,
        default_house_id: houseId,
        default_owner_id: ownerId || null,
        lookup_missing: lookupMissing,
        skip_duplicates: skipDuplicates,
      })
      setResult(next.import)
      onSaved(next)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title="Importar libros desde CSV"
      subtitle="Sirve un CSV exportado desde Excel, Google Sheets o Goodreads."
      onClose={onClose}
      width="max-w-3xl"
      footer={result
        ? <Button variant="primary" onClick={onClose}>Cerrar</Button>
        : (
          <>
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            {preview
              ? <Button variant="primary" onClick={run} disabled={busy}>{busy ? 'Importando…' : `Importar ${preview.total} libros`}</Button>
              : <Button variant="primary" onClick={analyse} disabled={busy || !text}>Analizar archivo</Button>}
          </>
        )}
    >
      {result ? (
        <div className="space-y-2 text-sm text-slate-300">
          <p className="text-emerald-300">Importados: <strong>{result.created}</strong> libros.</p>
          {result.skipped > 0 && <p>Duplicados omitidos: {result.skipped}.</p>}
          {result.errorCount > 0 && (
            <div>
              <p className="text-amber-300">Avisos: {result.errorCount}</p>
              <ul className="mt-1 max-h-40 list-disc overflow-y-auto pl-5 text-xs text-slate-400">
                {result.errors.map(message => <li key={message}>{message}</li>)}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-200 transition hover:bg-white/[0.08]">
              <FileUp size={15} />{fileName || 'Elegir archivo CSV'}
              <input type="file" accept=".csv,text/csv,text/plain" onChange={choose} className="hidden" />
            </label>
            <button type="button" onClick={template} className="inline-flex items-center gap-1.5 text-xs text-slate-400 transition hover:text-sky-300">
              <Download size={13} />Descargar plantilla
            </button>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            La primera fila debe tener los nombres de las columnas. Reconozco: título, autor, ISBN, editorial, año, casa, propietario, formato, notas e idioma. Solo es obligatorio el título o el ISBN.
          </p>

          {preview && (
            <div className="mt-5">
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(preview.columns).map(([field, header]) => (
                  <span key={field} className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-[11px] text-sky-200">
                    {FIELD_LABELS[field]} ← «{header}»
                  </span>
                ))}
              </div>
              <p className="mt-3 text-sm text-slate-300">
                {preview.total} filas{preview.duplicates ? ` · ${preview.duplicates} ya parecen estar en vuestras estanterías` : ''}{preview.isbnOnly ? ` · ${preview.isbnOnly} solo con ISBN` : ''}{preview.withoutTitle - preview.isbnOnly > 0 ? ` · ${preview.withoutTitle - preview.isbnOnly} sin título ni ISBN (se omitirán)` : ''}
              </p>

              <div className="mt-3 overflow-x-auto rounded-xl border border-white/5">
                <table className="w-full text-xs">
                  <thead className="bg-white/[0.02] text-left text-slate-500">
                    <tr>{['Título', 'Autor', 'ISBN', 'Casa', 'Propietario'].map(h => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04] text-slate-300">
                    {preview.rows.slice(0, 8).map((row, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5">{row.title || <span className="text-slate-600">—</span>}</td>
                        <td className="px-3 py-1.5">{row.author}</td>
                        <td className="px-3 py-1.5 tabular-nums">{row.isbn}</td>
                        <td className="px-3 py-1.5">{row.house}</td>
                        <td className="px-3 py-1.5">{row.owner}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label="Casa si la fila no la indica">
                  <select className={inputClass} value={houseId} onChange={e => setHouseId(e.target.value)}>
                    {lib.houses.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                  </select>
                </Field>
                <Field label="Propietario si la fila no lo indica">
                  <select className={inputClass} value={ownerId} onChange={e => setOwnerId(e.target.value)}>
                    <option value="">De la familia</option>
                    {lib.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </Field>
              </div>
              <div className="mt-4 space-y-2 text-sm text-slate-300">
                <label className="flex items-center gap-2"><input type="checkbox" className="accent-sky-500" checked={skipDuplicates} onChange={e => setSkipDuplicates(e.target.checked)} />Omitir libros que ya están en esa casa</label>
                <label className="flex items-center gap-2"><input type="checkbox" className="accent-sky-500" checked={lookupMissing} onChange={e => setLookupMissing(e.target.checked)} />Completar por internet las filas que solo tienen ISBN (puede tardar un poco)</label>
              </div>
            </div>
          )}
        </>
      )}
      {error && <p className="mt-4 text-xs text-amber-400">{error}</p>}
    </Modal>
  )
}