import { useEffect, useMemo, useState } from 'react'
import { Pencil, Search } from 'lucide-react'
import { api } from '../api'
import {
  Button, Card, PageHeader, Segmented, StateBadge, cx, inputClass,
} from '../components/ui'

const normalize = value => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export default function CatalogPage({
  data, correctAuthor, correctBook, openAuthor, editBook,
}) {
  const [mode, setMode] = useState('authors')
  const [query, setQuery] = useState('')
  const [review, setReview] = useState(null)
  const [error, setError] = useState('')
  const [page, setPage] = useState(0)

  useEffect(() => {
    let active = true
    api.catalogReview()
      .then(result => { if (active) setReview(result) })
      .catch(err => { if (active) setError(err.message) })
    return () => { active = false }
  }, [data])

  const rows = useMemo(() => {
    const q = normalize(query)

    const source = mode === 'authors'
      ? Object.values(data.authors).map(author => ({
        id: author.id,
        name: author.name,
        secondary: [author.country, author.period].filter(Boolean).join(' · '),
        state: author.state,
        info: author.catalogInfo,
      }))
      : data.books.map(book => ({
        id: book.id,
        name: book.title,
        secondary: book.authorName,
        state: book.state,
        info: book.catalogInfo,
      }))

    return source
      .filter(row => !q || normalize(`${row.name} ${row.secondary}`).includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [data, mode, query])

  const pages = Math.max(1, Math.ceil(rows.length / 30))
  const current = Math.min(page, pages - 1)
  const visible = rows.slice(current * 30, (current + 1) * 30)

  const open = id => mode === 'authors' ? openAuthor(id) : editBook(id)
  const correct = id => mode === 'authors' ? correctAuthor(id) : correctBook(id)

  return (
    <>
      <PageHeader
        eyebrow="Calidad del catálogo"
        title="Catálogo limpio y transparente"
        subtitle="Revisa datos, corrige errores y detecta posibles duplicados sin borrar lecturas."
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={mode}
          onChange={value => { setMode(value); setPage(0) }}
          options={[
            { value: 'authors', label: 'Autores' },
            { value: 'books', label: 'Obras' },
            { value: 'duplicates', label: `Posibles duplicados · ${review?.groups?.length ?? '…'}` },
          ]}
        />

        {mode !== 'duplicates' && (
          <div className="relative w-full sm:w-80">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className={cx(inputClass, 'pl-9')}
              value={query}
              onChange={e => { setQuery(e.target.value); setPage(0) }}
              placeholder="Buscar…"
            />
          </div>
        )}
      </div>

      {mode === 'duplicates' ? (
        <>
          <p className="mb-5 text-sm leading-relaxed text-slate-400">
            Son coincidencias para revisar, no duplicados confirmados.
            Un mismo identificador de Wikidata también puede deberse a una
            identificación errónea. En esta entrega no se fusiona ni elimina nada.
          </p>

          {error && <p className="text-sm text-amber-300">{error}</p>}

          <div className="space-y-4">
            {(review?.groups || []).map((group, index) => (
              <Card key={index} className="p-5">
                <div className="mb-3 text-xs font-medium text-slate-400">
                  {group.kind === 'author' ? 'Autores' : 'Obras'} · {group.reason}
                </div>
                <div className="space-y-2">
                  {group.records.map(record => (
                    <div key={record.id} className="flex flex-wrap items-center gap-3">
                      <span className="min-w-0 flex-1 text-sm text-slate-200">
                        {record.name}
                        <span className="ml-2 text-xs text-slate-500">
                          {record.origin}
                        </span>
                      </span>
                      <StateBadge state={record.state} />
                      <Button
                        size="sm"
                        onClick={() => group.kind === 'author'
                          ? correctAuthor(record.id)
                          : correctBook(record.id)}
                      >
                        Revisar
                      </Button>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>

          {review && !review.groups.length && (
            <Card className="p-8 text-sm text-slate-400">
              No se han encontrado coincidencias con las reglas actuales.
            </Card>
          )}
        </>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-white/5 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-5 py-3">Registro</th>
                  <th className="px-5 py-3">Origen</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>

              <tbody className="divide-y divide-white/5">
                {visible.map(row => (
                  <tr key={row.id}>
                    <td className="px-5 py-3">
                      <button
                        type="button"
                        onClick={() => open(row.id)}
                        className="text-left text-slate-100 hover:text-sky-300"
                      >
                        {row.name}
                      </button>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {row.secondary}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-400">
                      {row.info?.origin}
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        {row.info?.scopeLabel}
                        {row.info?.corrected && ' · corregido'}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <StateBadge state={row.state} />
                    </td>
                    <td className="px-5 py-3">
                      <Button size="sm" onClick={() => correct(row.id)}>
                        <Pencil size={12} />Revisar datos
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-white/5 px-5 py-3 text-xs text-slate-500">
            <span>{rows.length} registros</span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={current === 0}
                onClick={() => setPage(current - 1)}
              >
                Anterior
              </Button>
              <span>{current + 1} / {pages}</span>
              <Button
                size="sm"
                variant="ghost"
                disabled={current >= pages - 1}
                onClick={() => setPage(current + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </Card>
      )}
    </>
  )
}
