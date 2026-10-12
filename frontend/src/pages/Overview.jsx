import { ArrowUpRight, BookCheck, BookOpen, Compass, Lock, Star, Users } from 'lucide-react'
import { Button, Card, PageHeader, ProgressBar, StatCard } from '../components/ui'

function CardTitle({ title, action }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      {action}
    </div>
  )
}

function LinkButton({ onClick, children }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 text-xs text-slate-400 transition hover:text-sky-300">
      {children}<ArrowUpRight size={12} />
    </button>
  )
}

export default function Overview({ data, go, openAuthor, editBook, openCompass }) {
  const { summary, regions, authors, books } = data
  const unlocked = regions.filter(r => r.state !== 'LOCKED').sort((a, b) => b.rate - a.rate)
  const years = Object.entries(summary.byYear).sort(([a], [b]) => Number(a) - Number(b))
  const maxCount = Math.max(1, ...years.map(([, count]) => count))
  const topRated = books.filter(b => b.state === 'READ' && b.rating != null).sort((a, b) => b.rating - a.rating).slice(0, 5)

  const seen = new Set()
  const pending = []
  unlocked.forEach(region => region.authors.forEach(entry => {
    if (entry.tier === 'ESSENTIAL' && !['READ', 'MASTERED'].includes(entry.state) && !seen.has(entry.id)) {
      seen.add(entry.id)
      pending.push({ ...entry, regionName: region.name })
    }
  }))

  return (
    <>
      <PageHeader
        eyebrow="Resumen"
        title="Tu mapa de la literatura"
        subtitle="No se trata de cuántos libros has leído, sino de qué territorios has explorado y cuáles te quedan por descubrir."
        actions={<Button variant="primary" onClick={() => openCompass({ regionId: unlocked[0]?.id ?? null })}><Compass size={15} />¿Hacia dónde ahora?</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={BookCheck} label="Obras leídas" value={summary.booksRead} hint={summary.averageRating != null ? `Nota media ${summary.averageRating.toFixed(1)}` : 'Lecturas terminadas'} tone="blue" />
        <StatCard icon={BookOpen} label="En lectura" value={summary.reading} hint="Exploraciones activas" tone="sky" />
        <StatCard icon={Users} label="Autores leídos" value={summary.authorsRead} hint="Con al menos una obra" tone="violet" />
        <StatCard icon={Compass} label="Territorios" value={`${summary.regionsUnlocked}/${summary.regionsTotal}`} hint="Desbloqueados en el catálogo" tone="amber" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <CardTitle title="Territorios explorados" action={<LinkButton onClick={() => go('map')}>Ver mapa</LinkButton>} />
          <div className="mt-5 space-y-4">
            {unlocked.slice(0, 8).map(region => (
              <div key={region.id}>
                <div className="mb-1.5 flex items-center justify-between gap-4 text-sm">
                  <span className="truncate text-slate-200">{region.name}</span>
                  <span className="shrink-0 tabular-nums text-slate-300">
                    {Math.round(region.rate * 100)}%
                    <span className="ml-2 text-xs text-slate-500">{region.tiers.ESSENTIAL.read}/{region.tiers.ESSENTIAL.total} esenciales</span>
                  </span>
                </div>
                <ProgressBar value={region.rate} />
              </div>
            ))}
            {unlocked.length === 0 && <p className="text-sm text-slate-500">Aún no has desbloqueado ningún territorio.</p>}
          </div>
        </Card>

        <Card className="p-6">
          <CardTitle title="Lecturas por año" />
          <div className="mt-6 flex h-44 items-end gap-3">
            {years.map(([year, count]) => (
              <div key={year} className="flex flex-1 flex-col items-center justify-end gap-2">
                <span className="text-xs tabular-nums text-slate-300">{count}</span>
                <div className="w-full max-w-12 rounded-md transition-all duration-700" style={{ height: `${Math.max(6, (count / maxCount) * 120)}px`, background: 'linear-gradient(180deg,#38BDF8,#2563EB)' }} />
                <span className="text-[11px] text-slate-500">{year}</span>
              </div>
            ))}
            {years.length === 0 && <p className="text-sm text-slate-500">Sin años registrados.</p>}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <CardTitle title="Esenciales por descubrir en tus territorios" />
          <p className="mt-1 text-xs text-slate-500">No es una lista obligatoria: son autores clave de territorios que ya has pisado.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {pending.slice(0, 8).map(entry => (
              <button key={entry.id} type="button" onClick={() => openAuthor(entry.id)} className="group flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] p-3 text-left transition hover:border-sky-500/30">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/[0.04] text-slate-500 group-hover:text-sky-300"><Lock size={14} /></span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-200">{authors[entry.id]?.name}</span>
                  <span className="block truncate text-[11px] text-slate-500">{entry.regionName}</span>
                </span>
              </button>
            ))}
            {pending.length === 0 && <p className="text-sm text-slate-500">Has leído a todos los esenciales de tus territorios.</p>}
          </div>
        </Card>

        <Card className="p-6">
          <CardTitle title="Mejor valoradas" action={<LinkButton onClick={() => go('library')}>Biblioteca</LinkButton>} />
          <div className="mt-4 space-y-1">
            {topRated.map(book => (
              <button key={book.id} type="button" onClick={() => editBook(book.id)} className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-white/[0.04]">
                <span className="min-w-0">
                  <span className="block truncate text-sm text-slate-200">{book.title}</span>
                  <span className="block truncate text-[11px] text-slate-500">{book.authorName}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-sm tabular-nums text-amber-300"><Star size={12} fill="currentColor" />{book.rating.toFixed(1)}</span>
              </button>
            ))}
            {topRated.length === 0 && <p className="text-sm text-slate-500">Todavía no has puntuado lecturas.</p>}
          </div>
        </Card>
      </div>
    </>
  )
}