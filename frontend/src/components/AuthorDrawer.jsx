import { useState } from 'react'
import { ExternalLink, Lock } from 'lucide-react'
import Cover from './Cover'
import { Drawer, StateBadge, cx } from './ui'

function Section({ title, children }) {
  return (
    <div className="mt-7">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">{title}</div>
      {children}
    </div>
  )
}

function Portrait({ src, name }) {
  const [failed, setFailed] = useState(false)
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
  if (src && !failed) {
    return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className="h-20 w-20 shrink-0 rounded-2xl border border-white/10 object-cover" />
  }
  return (
    <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl border border-white/10 text-lg font-semibold text-slate-400" style={{ background: 'linear-gradient(160deg,#1E293B,#0F172A)' }}>
      {initials}
    </div>
  )
}

function AuthorLinks({ ids, data, openAuthor }) {
  return (
    <div className="space-y-1">
      {ids.map(id => {
        const linked = data.authors[id]
        if (!linked) return null
        const locked = linked.state === 'LOCKED'
        return (
          <button key={id} type="button" onClick={() => openAuthor(id)} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-white/[0.04]">
            <span className={cx('flex items-center gap-2', locked ? 'text-slate-400' : 'text-slate-100')}>
              {locked && <Lock size={12} className="text-slate-600" />}{linked.name}
            </span>
            <StateBadge state={linked.state} />
          </button>
        )
      })}
    </div>
  )
}

const formatYear = y => (y < 0 ? `${-y} a. C.` : String(y))

export default function AuthorDrawer({ authorId, data, onClose, openAuthor, editBook }) {
  const author = data.authors[authorId]
  if (!author) return null

  const books = data.books
    .filter(book => book.author === authorId)
    .sort((a, b) => Number(b.state === 'READ') - Number(a.state === 'READ') || (a.published ?? 9999) - (b.published ?? 9999))
  const regionsById = Object.fromEntries(data.regions.map(region => [region.id, region]))
  const readCount = books.filter(book => book.state === 'READ').length
  const influencedBy = author.influencedBy || []
  const influenced = author.influenced || []
  const others = (author.related || []).filter(id => !influencedBy.includes(id) && !influenced.includes(id))
  const lifespan = author.birth != null
    ? `${formatYear(author.birth)} – ${author.death != null ? formatYear(author.death) : ''}`
    : null

  return (
    <Drawer open title={author.name} subtitle={[author.country, author.period].filter(Boolean).join(' · ')} onClose={onClose}>
      <div className="flex items-center gap-4">
        <Portrait src={author.image} name={author.name} />
        <div className="min-w-0">
          {lifespan && <div className="text-sm tabular-nums text-slate-300">{lifespan}</div>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StateBadge state={author.state} />
            <span className="text-xs text-slate-500">{readCount} de {books.length} obras del catálogo leídas</span>
          </div>
        </div>
      </div>

      {author.state === 'LOCKED' && (
        <div className="mt-5 rounded-xl border border-sky-500/20 bg-sky-500/[0.06] p-4 text-sm leading-relaxed text-slate-300">
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
            <button key={book.id} type="button" onClick={() => editBook(book.id)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-white/[0.04]">
              <Cover src={book.cover} size="sm" />
              <span className="min-w-0 flex-1">
                <span className={cx('block truncate text-sm', book.state === 'LOCKED' ? 'text-slate-400' : 'text-slate-100')}>{book.title}</span>
                {book.published && <span className="text-[11px] tabular-nums text-slate-500">{formatYear(book.published)}</span>}
              </span>
              <StateBadge state={book.state} />
            </button>
          ))}
          {books.length === 0 && <p className="text-sm text-slate-500">No hay obras de este autor en el catálogo.</p>}
        </div>
      </Section>

      {influencedBy.length > 0 && (
        <Section title="Influido por">
          <AuthorLinks ids={influencedBy} data={data} openAuthor={openAuthor} />
        </Section>
      )}

      {influenced.length > 0 && (
        <Section title="Influyó en">
          <AuthorLinks ids={influenced} data={data} openAuthor={openAuthor} />
        </Section>
      )}

      {others.length > 0 && (
        <Section title="Otras conexiones">
          <AuthorLinks ids={others} data={data} openAuthor={openAuthor} />
        </Section>
      )}

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

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-4 text-[11px] text-slate-500">
        <span>Biografía e influencias: Wikidata · Portadas: Open Library</span>
        {author.qid && (
          <a href={`https://www.wikidata.org/wiki/${author.qid}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-sky-300">
            Ver en Wikidata<ExternalLink size={11} />
          </a>
        )}
      </div>
    </Drawer>
  )
}