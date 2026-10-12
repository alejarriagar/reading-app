import { BookOpen, Lock } from 'lucide-react'
import { Drawer, StateBadge, cx } from './ui'

function Section({ title, children }) {
  return (
    <div className="mt-7">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">{title}</div>
      {children}
    </div>
  )
}

export default function AuthorDrawer({ authorId, data, onClose, openAuthor, editBook }) {
  const author = data.authors[authorId]
  if (!author) return null

  const books = data.books.filter(book => book.author === authorId)
  const regionsById = Object.fromEntries(data.regions.map(region => [region.id, region]))
  const readCount = books.filter(book => book.state === 'READ').length

  return (
    <Drawer open title={author.name} subtitle={[author.country, author.period].filter(Boolean).join(' · ')} onClose={onClose}>
      <div className="flex flex-wrap items-center gap-2">
        <StateBadge state={author.state} />
        <span className="text-xs text-slate-500">{readCount} de {books.length} obras del catálogo leídas</span>
      </div>

      {author.state === 'LOCKED' && (
        <div className="mt-4 rounded-xl border border-sky-500/20 bg-sky-500/[0.06] p-4 text-sm leading-relaxed text-slate-300">
          Todavía no has leído a <strong className="text-white">{author.name}</strong>. Puedes marcar cualquiera de sus obras cuando quieras explorarlo.
        </div>
      )}

      {author.movements.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {author.movements.map(item => <span key={item} className="rounded-full border border-white/10 px-2.5 py-0.5 text-[11px] text-slate-300">{item}</span>)}
        </div>
      )}

      <Section title="Obras">
        <div className="space-y-1">
          {books.map(book => (
            <button key={book.id} type="button" onClick={() => editBook(book.id)} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-white/[0.04]">
              <span className={cx('flex items-center gap-2 text-sm', book.state === 'LOCKED' ? 'text-slate-400' : 'text-slate-100')}>
                {book.state === 'LOCKED' ? <Lock size={13} className="text-slate-600" /> : <BookOpen size={13} className="text-sky-400" />}
                {book.title}
              </span>
              <StateBadge state={book.state} />
            </button>
          ))}
          {books.length === 0 && <p className="text-sm text-slate-500">No hay obras de este autor en el catálogo.</p>}
        </div>
      </Section>

      {author.regions.length > 0 && (
        <Section title="Territorios">
          <div className="flex flex-wrap gap-2">
            {author.regions.map(regionId => {
              const region = regionsById[regionId]
              if (!region) return null
              const locked = region.state === 'LOCKED'
              return (
                <span key={regionId} className={cx('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs', locked ? 'border-white/5 text-slate-500' : 'border-sky-500/30 bg-sky-500/10 text-sky-200')}>
                  {locked && <Lock size={11} />}{region.name}
                </span>
              )
            })}
          </div>
        </Section>
      )}

      {author.related.length > 0 && (
        <Section title="Conexiones">
          <div className="space-y-1">
            {author.related.map(relatedId => {
              const related = data.authors[relatedId]
              if (!related) return null
              return (
                <button key={relatedId} type="button" onClick={() => openAuthor(relatedId)} className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm text-slate-200 transition hover:bg-white/[0.04]">
                  {related.name}<StateBadge state={related.state} />
                </button>
              )
            })}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">Una conexión indica afinidad dentro del catálogo; no implica necesariamente una influencia histórica documentada.</p>
        </Section>
      )}
    </Drawer>
  )
}