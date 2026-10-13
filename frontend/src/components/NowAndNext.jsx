import { useState } from 'react'
import { BookOpen, Check, ChevronRight, Coffee, RefreshCw, Sparkles, X } from 'lucide-react'
import { api } from '../api'
import Cover from './Cover'
import { Button, Card, cx } from './ui'

const KIND = {
  favorite: { label: 'Por tus favoritos', className: 'border-amber-400/30 bg-amber-400/10 text-amber-300' },
  deepen: { label: 'Para profundizar', className: 'border-sky-400/30 bg-sky-400/10 text-sky-300' },
  new: { label: 'Territorio nuevo', className: 'border-violet-400/30 bg-violet-400/10 text-violet-300' },
}

function sinceText(started, isReread) {
  if (!started || started.length < 10) return null
  const [y, m, d] = started.split('-').map(Number)
  const now = new Date()
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(y, m - 1, d)) / 86400000)
  const verb = isReread ? 'Relectura empezada' : 'Empezado'
  if (days <= 0) return `${verb} hoy`
  if (days === 1) return `${verb} ayer`
  return `${verb} hace ${days} días`
}

function payload(book, state, year = book.year ?? null) {
  return { state, year, rating: book.rating ?? null, reread: Boolean(book.reread), notes: book.notes || '' }
}

function RegionChips({ book, regionsById }) {
  const names = book.regions.map(id => regionsById[id]?.name).filter(Boolean).slice(0, 2)
  if (!names.length) return null
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {names.map(name => <span key={name} className="rounded-full border border-white/10 px-2.5 py-0.5 text-[11px] text-slate-300">{name}</span>)}
    </div>
  )
}

function Reading({ data, run, editBook, openAuthor, regionsById }) {
  const reading = data.books.filter(book => book.state === 'READING')
  const tracking = data.summary.trackingSince

  const finish = book => run(
    () => api.updateBook(book.id, payload(book, 'READ', book.year ?? new Date().getFullYear())),
    `«${book.title}» terminado`,
  )

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-400">
          <BookOpen size={12} />Leyendo ahora
        </div>
        <span className="text-xs text-slate-500">{reading.length > 1 ? `${reading.length} lecturas en curso · ` : ''}{data.summary.finishedThisYear || 0} terminadas este año</span>
      </div>

      {reading.length === 0 ? (
        <div className="mt-6 flex items-center gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/[0.04] text-slate-500"><Coffee size={22} /></span>
          <div>
            <div className="text-sm font-medium text-slate-200">No estás leyendo nada ahora mismo</div>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">Elige cualquier libro, de cualquier época. Si te apetece, a la derecha tienes una sugerencia.</p>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-5">
          {reading.slice(0, 2).map(book => {
            const since = sinceText(book.currentReading?.started, book.currentReading?.reread)
            return (
              <div key={book.id} className="flex gap-5">
                <Cover src={book.cover} size="lg" />
                <div className="min-w-0 flex-1">
                  <h3 className="text-xl font-semibold leading-snug text-white">{book.title}</h3>
                  <button type="button" onClick={() => openAuthor(book.author)} className="mt-0.5 text-sm text-slate-400 transition hover:text-sky-300">{book.authorName}</button>
                  {since && <div className="mt-1.5 text-xs text-slate-500">{since}</div>}
                  <RegionChips book={book} regionsById={regionsById} />
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="primary" size="sm" onClick={() => finish(book)}><Check size={14} />Lo he terminado</Button>
                    <Button size="sm" onClick={() => editBook(book.id)}>Editar</Button>
                  </div>
                </div>
              </div>
            )
          })}
          {reading.length > 2 && (
            <div className="border-t border-white/5 pt-3 text-xs text-slate-400">
              También: {reading.slice(2).map((book, i) => (
                <button key={book.id} type="button" onClick={() => editBook(book.id)} className="hover:text-sky-300">
                  {i > 0 && ', '}«{book.title}»
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

function Next({ data, run, editBook, openAuthor }) {
  const [offset, setOffset] = useState(0)
  const booksById = Object.fromEntries(data.books.map(book => [book.id, book]))
  const recs = (data.recommendations || []).filter(rec => booksById[rec.bookId])

  if (!recs.length) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-300"><Sparkles size={12} />Tu siguiente lectura</div>
        <p className="mt-6 text-sm text-slate-400">Aún no hay sugerencias. Puntúa algunas lecturas o explora un territorio para afinarlas.</p>
      </Card>
    )
  }

  const index = offset % recs.length
  const main = recs[index]
  const book = booksById[main.bookId]
  const alternatives = [1, 2]
    .map(step => recs[(index + step) % recs.length])
    .filter((rec, i, list) => rec.bookId !== main.bookId && list.findIndex(r => r.bookId === rec.bookId) === i)
  const kind = KIND[main.kind] || KIND.new

  const start = () => run(() => api.updateBook(book.id, payload(book, 'READING')), `Empiezas «${book.title}»`)
  const dismiss = () => run(() => api.dismissRecommendation(book.id), 'Sugerencia descartada')

  return (
    <Card className="relative overflow-hidden p-6">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full blur-3xl" style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.18), transparent 70%)' }} />
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-300"><Sparkles size={12} />Tu siguiente lectura</div>
        {recs.length > 1 && (
          <button type="button" onClick={() => setOffset(o => o + 1)} className="inline-flex items-center gap-1 text-xs text-slate-400 transition hover:text-sky-300">
            <RefreshCw size={12} />Otra sugerencia
          </button>
        )}
      </div>

      <div key={main.bookId} className="fade-in relative mt-4 flex gap-5">
        <Cover src={book.cover} size="lg" />
        <div className="min-w-0 flex-1">
          <span className={cx('inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium', kind.className)}>{kind.label}</span>
          <h3 className="mt-2 text-xl font-semibold leading-snug text-white">{book.title}</h3>
          <button type="button" onClick={() => openAuthor(book.author)} className="mt-0.5 text-sm text-slate-400 transition hover:text-sky-300">{book.authorName}</button>
          <ul className="mt-3 space-y-1.5">
            {main.reasons.map(reason => (
              <li key={reason} className="flex gap-1.5 text-xs leading-relaxed text-slate-300">
                <ChevronRight size={12} className="mt-0.5 shrink-0 text-sky-400" />{reason}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onClick={start}><BookOpen size={14} />Empezar a leer</Button>
            <Button size="sm" onClick={() => editBook(book.id)}>Ver obra</Button>
            <Button size="sm" variant="ghost" onClick={dismiss}><X size={14} />No me interesa</Button>
          </div>
        </div>
      </div>

      {alternatives.length > 0 && (
        <div className="relative mt-6 border-t border-white/5 pt-4">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">O quizá</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {alternatives.map(alt => {
              const altBook = booksById[alt.bookId]
              return (
                <button key={alt.bookId} type="button" onClick={() => setOffset(recs.indexOf(alt))} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5 text-left transition hover:border-white/15">
                  <Cover src={altBook.cover} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-slate-100">{altBook.title}</span>
                    <span className="block truncate text-[11px] text-slate-500">{altBook.authorName} · {(KIND[alt.kind] || KIND.new).label}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <p className="relative mt-4 text-[11px] text-slate-500">Es solo una sugerencia basada en tus notas, tus territorios y las influencias entre autores. Tú decides.</p>
    </Card>
  )
}

export default function NowAndNext(props) {
  const regionsById = Object.fromEntries(props.data.regions.map(region => [region.id, region]))
  return (
    <div className="mb-6 grid gap-6 lg:grid-cols-2">
      <Reading {...props} regionsById={regionsById} />
      <Next {...props} />
    </div>
  )
}