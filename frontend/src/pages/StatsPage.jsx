import { useMemo, useState } from 'react'
import { BookCheck, Calendar, Fingerprint, Globe, MapPin, RotateCcw, Sparkles, Star, Timer, Trophy, Users } from 'lucide-react'
import Cover from '../components/Cover'
import { Card, PageHeader, Segmented, StatCard, cx } from '../components/ui'
import { MONTHS, buildStats, yearReview } from '../lib/stats'

function Title({ children, hint }) {
  return (
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-white">{children}</h3>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

function Empty({ children }) {
  return <p className="rounded-xl border border-white/5 p-4 text-sm text-slate-500">{children}</p>
}

function HBars({ items, max, format }) {
  return (
    <div className="space-y-2.5">
      {items.map(item => (
        <div key={item.key} className="grid grid-cols-[minmax(0,150px)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate text-slate-300">{item.key}</span>
          <div className="h-2 overflow-hidden rounded-full bg-white/[0.05]">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(2, (item.value / max) * 100)}%`, background: 'linear-gradient(90deg,#2563EB,#38BDF8)' }} />
          </div>
          <span className="w-24 text-right text-xs tabular-nums text-slate-400">{format(item)}</span>
        </div>
      ))}
    </div>
  )
}

function Columns({ items, height = 120 }) {
  const max = Math.max(1, ...items.map(item => item.count))
  return (
    <div className="flex items-end gap-2" style={{ height: height + 44 }}>
      {items.map(item => (
        <div key={item.key} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
          <span className="text-[11px] tabular-nums text-slate-400">{item.count || ''}</span>
          <div
            className="w-full max-w-10 rounded-md transition-all duration-700"
            style={{
              height: `${Math.max(item.count ? 4 : 2, (item.count / max) * height)}px`,
              background: item.count ? 'linear-gradient(180deg,#38BDF8,#2563EB)' : 'rgba(255,255,255,0.05)',
            }}
          />
          <span className="w-full truncate text-center text-[10px] leading-tight text-slate-500">{item.label ?? item.key}</span>
        </div>
      ))}
    </div>
  )
}

function Heatmap({ calendar }) {
  const max = Math.max(1, ...calendar.flatMap(row => row.months))
  return (
    <div className="overflow-x-auto">
      <table className="text-[10px] text-slate-500">
        <thead>
          <tr>
            <th />
            {MONTHS.map(month => <th key={month} className="px-0.5 pb-1 font-normal">{month}</th>)}
            <th className="px-2 pb-1 font-normal">Sin mes</th>
          </tr>
        </thead>
        <tbody>
          {calendar.map(row => (
            <tr key={row.year}>
              <td className="pr-2 text-right tabular-nums">{row.year}</td>
              {row.months.map((count, i) => (
                <td key={i} className="p-0.5">
                  <div
                    title={`${MONTHS[i]} ${row.year}: ${count}`}
                    className="h-6 w-8 rounded"
                    style={{ background: count ? `rgba(56,189,248,${0.25 + (0.75 * count) / max})` : 'rgba(255,255,255,0.04)' }}
                  />
                </td>
              ))}
              <td className="px-2 text-center tabular-nums text-slate-400">{row.undated || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Initials({ author }) {
  const [failed, setFailed] = useState(false)
  if (author.image && !failed) {
    return <img src={author.image} alt="" loading="lazy" onError={() => setFailed(true)} className="h-8 w-8 shrink-0 rounded-lg border border-white/10 object-cover" />
  }
  const text = author.name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
  return <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-[10px] font-semibold text-slate-500">{text}</span>
}

function Profile({ stats, openAuthor }) {
  const countryMax = Math.max(1, ...stats.byCountry.map(c => c.count))
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={BookCheck} label="Lecturas" value={stats.finished.length} hint={`${stats.readBooks.length} obras · ${stats.rereads} relecturas`} tone="blue" />
        <StatCard icon={Users} label="Autores leídos" value={stats.byAuthor.length} hint={`De ${stats.byCountry.length} países`} tone="violet" />
        <StatCard icon={Star} label="Nota media" value={stats.avgRating != null ? stats.avgRating.toFixed(1) : '—'} hint={`${stats.rated.length} lecturas puntuadas`} tone="amber" />
        <StatCard
          icon={Timer}
          label="Ritmo"
          value={stats.avgDays ? `${Math.round(stats.avgDays)} días` : `${stats.perMonth.toFixed(1)}/mes`}
          hint={stats.avgDays ? `Duración media · ${stats.durations.length} con fechas` : `Lecturas al mes en ${new Date().getFullYear()}`}
          tone="sky"
        />
      </div>

      <Card className="mt-6 p-6">
        <Title>Lo que dicen tus lecturas</Title>
        <ul className="grid gap-3 md:grid-cols-2">
          {stats.insights.map(text => (
            <li key={text} className="flex gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] p-4 text-sm leading-relaxed text-slate-300">
              <Sparkles size={15} className="mt-0.5 shrink-0 text-sky-400" />{text}
            </li>
          ))}
        </ul>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <Title hint="Obras leídas y nota media por literatura">Por país</Title>
          {stats.byCountry.length
            ? <HBars items={stats.byCountry.slice(0, 10).map(c => ({ ...c, value: c.count }))} max={countryMax} format={c => `${c.count}${c.avg != null ? ` · ★ ${c.avg.toFixed(1)}` : ''}`} />
            : <Empty>Aún no hay lecturas ubicadas en el mapa.</Empty>}
        </Card>
        <Card className="p-6">
          <Title hint="Según la época de actividad de cada autor">Por época</Title>
          {stats.byEra.length ? <Columns items={stats.byEra} /> : <Empty>Sin datos de época todavía.</Empty>}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <Title hint="Cuántas obras hay en cada tramo de nota">Tus notas</Title>
          {stats.rated.length ? <Columns items={stats.histogram} /> : <Empty>Puntúa tus lecturas para ver tu distribución.</Empty>}
        </Card>
        <Card className="p-6">
          <Title hint="Territorios con al menos dos lecturas puntuadas">Nota media por territorio</Title>
          {stats.byRegion.length
            ? <HBars items={stats.byRegion.slice(0, 8).map(r => ({ ...r, value: r.avg }))} max={10} format={r => `★ ${r.avg.toFixed(1)} · ${r.count}`} />
            : <Empty>Todavía no hay territorios con suficientes notas.</Empty>}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <Title>Autores más leídos</Title>
          <div className="space-y-1">
            {stats.byAuthor.slice(0, 8).map(entry => (
              <button key={entry.key} type="button" onClick={() => openAuthor(entry.key)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-white/[0.04]">
                <Initials author={entry.author} />
                <span className="min-w-0 flex-1 truncate text-sm text-slate-100">{entry.author.name}</span>
                <span className="text-xs tabular-nums text-slate-400">{entry.count} {entry.count === 1 ? 'obra' : 'obras'}</span>
                {entry.avg != null && <span className="w-12 text-right text-xs tabular-nums text-amber-300">★ {entry.avg.toFixed(1)}</span>}
              </button>
            ))}
          </div>
        </Card>
        <Card className="p-6">
          <Title hint={stats.streak ? `Racha actual: ${stats.streak} ${stats.streak === 1 ? 'mes' : 'meses'} seguidos terminando algún libro` : 'Las lecturas con mes aparecerán aquí; las antiguas solo tienen año'}>
            Calendario
          </Title>
          {stats.calendar.length ? <Heatmap calendar={stats.calendar} /> : <Empty>Sin lecturas con fecha todavía.</Empty>}
        </Card>
      </div>
    </>
  )
}

function YearView({ stats, data, openAuthor, editBook }) {
  const [year, setYear] = useState(stats.years[0] || null)
  const review = useMemo(() => (year ? yearReview(stats, year) : null), [stats, year])
  const regionsById = Object.fromEntries(data.regions.map(r => [r.id, r]))

  if (!review) return <Empty>Todavía no hay lecturas con año.</Empty>

  const hasMonths = review.months.some(Boolean)
  const chips = [
    [review.newAuthors.length, review.newAuthors.length === 1 ? 'autor nuevo' : 'autores nuevos'],
    [review.newCountries.length, review.newCountries.length === 1 ? 'literatura nueva' : 'literaturas nuevas'],
    [review.newRegions.length, review.newRegions.length === 1 ? 'territorio nuevo' : 'territorios nuevos'],
  ]

  return (
    <>
      <div className="mb-6 flex flex-wrap gap-2">
        {stats.years.map(y => (
          <button key={y} type="button" onClick={() => setYear(y)} className={cx('rounded-lg border px-4 py-1.5 text-sm tabular-nums transition', y === year ? 'border-sky-500/40 bg-sky-500/10 text-white' : 'border-white/[0.06] text-slate-400 hover:text-slate-200')}>
            {y}
          </button>
        ))}
      </div>

      <div
        key={year}
        className="fade-in relative overflow-hidden rounded-3xl border border-white/10 p-8"
        style={{ background: 'radial-gradient(700px 260px at 10% 0%, rgba(37,99,235,0.35), transparent 70%), radial-gradient(500px 240px at 100% 100%, rgba(139,92,246,0.22), transparent 70%), #0E1830' }}
      >
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-300">Tu año en libros · {year}</div>
        <div className="mt-4 flex flex-wrap items-end gap-x-10 gap-y-4">
          <div>
            <div className="text-6xl font-semibold tracking-tight text-white tabular-nums">{review.items.length}</div>
            <div className="mt-1 text-sm text-slate-300">{review.items.length === 1 ? 'lectura terminada' : 'lecturas terminadas'}</div>
          </div>
          {chips.map(([value, label]) => (
            <div key={label}>
              <div className="text-3xl font-semibold text-white tabular-nums">{value}</div>
              <div className="text-xs text-slate-400">{label}</div>
            </div>
          ))}
          {review.avgRating != null && (
            <div>
              <div className="text-3xl font-semibold text-amber-300 tabular-nums">★ {review.avgRating.toFixed(1)}</div>
              <div className="text-xs text-slate-400">nota media</div>
            </div>
          )}
        </div>
        {(review.rereads > 0 || review.avgDays) && (
          <div className="mt-5 flex flex-wrap gap-4 text-xs text-slate-400">
            {review.rereads > 0 && <span className="inline-flex items-center gap-1.5"><RotateCcw size={12} />{review.rereads} {review.rereads === 1 ? 'relectura' : 'relecturas'}</span>}
            {review.avgDays && <span className="inline-flex items-center gap-1.5"><Timer size={12} />{Math.round(review.avgDays)} días de media por libro</span>}
          </div>
        )}
      </div>

      {review.best.length > 0 && (
        <Card className="mt-6 p-6">
          <Title>Tus mejor valoradas</Title>
          <div className="grid gap-4 sm:grid-cols-3">
            {review.best.map((f, i) => (
              <button key={f.book.id} type="button" onClick={() => editBook(f.book.id)} className="flex items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-left transition hover:border-white/15">
                <span className="text-2xl font-semibold text-slate-600 tabular-nums">{i + 1}</span>
                <Cover src={f.book.cover} size="md" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium leading-snug text-slate-100">{f.book.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">{f.book.authorName}</span>
                  <span className="mt-1 inline-flex items-center gap-1 text-xs text-amber-300"><Trophy size={11} />{f.book.rating}</span>
                </span>
              </button>
            ))}
          </div>
        </Card>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="p-6">
          <Title hint="Leídos por primera vez este año">Autores descubiertos</Title>
          <div className="flex flex-wrap gap-2">
            {review.newAuthors.map(id => data.authors[id] && (
              <button key={id} type="button" onClick={() => openAuthor(id)} className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-200 transition hover:border-sky-500/40 hover:text-sky-200">
                {data.authors[id].name}
              </button>
            ))}
            {!review.newAuthors.length && <span className="text-sm text-slate-500">Ninguno nuevo: este año profundizaste.</span>}
          </div>
        </Card>
        <Card className="p-6">
          <Title hint="Países de los que leíste por primera vez">Literaturas nuevas</Title>
          <div className="flex flex-wrap gap-2">
            {review.newCountries.map(name => (
              <span key={name} className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs text-sky-200"><Globe size={11} />{name}</span>
            ))}
            {!review.newCountries.length && <span className="text-sm text-slate-500">Ninguna nueva este año.</span>}
          </div>
        </Card>
        <Card className="p-6">
          <Title hint="Territorios que pisaste por primera vez">Territorios nuevos</Title>
          <div className="flex flex-wrap gap-2">
            {review.newRegions.map(id => regionsById[id] && (
              <span key={id} className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs text-violet-200"><MapPin size={11} />{regionsById[id].name}</span>
            ))}
            {!review.newRegions.length && <span className="text-sm text-slate-500">Ninguno nuevo este año.</span>}
          </div>
        </Card>
      </div>

      <Card className="mt-6 p-6">
        <Title hint={hasMonths ? null : 'Las lecturas de este año no tienen mes registrado; a partir de ahora se guardan solas.'}>
          <span className="inline-flex items-center gap-2"><Calendar size={14} />Lecturas por mes</span>
        </Title>
        <Columns items={review.months.map((count, i) => ({ key: MONTHS[i], count }))} height={90} />
        {review.undated > 0 && hasMonths && <p className="mt-2 text-[11px] text-slate-500">{review.undated} lecturas de este año no tienen mes.</p>}
      </Card>

      <Card className="mt-6 p-6">
        <Title>Todas las lecturas de {year}</Title>
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-5 lg:grid-cols-8">
          {review.items.map((f, i) => (
            <button key={`${f.book.id}-${i}`} type="button" onClick={() => editBook(f.book.id)} className="group text-left" title={`${f.book.title} — ${f.book.authorName}`}>
              <Cover src={f.book.cover} size="lg" className="w-full !h-auto aspect-[2/3] transition group-hover:border-sky-400/50" />
              <span className="mt-1.5 block truncate text-[11px] text-slate-300">{f.book.title}</span>
              {f.reading?.reread && <span className="text-[10px] text-sky-300">Relectura</span>}
            </button>
          ))}
        </div>
      </Card>
    </>
  )
}

export default function StatsPage({ data, openAuthor, editBook }) {
  const [mode, setMode] = useState('profile')
  const stats = useMemo(() => buildStats(data), [data])

  return (
    <>
      <PageHeader
        eyebrow="ADN lector"
        title="Cómo lees"
        subtitle="Tus lecturas vistas como un mapa de gustos, épocas y ritmos. Es una descripción, no una meta."
        actions={<Segmented value={mode} onChange={setMode} options={[{ value: 'profile', label: 'Perfil' }, { value: 'year', label: 'Tu año en libros' }]} />}
      />
      {stats.finished.length === 0 ? (
        <Card className="p-10 text-center">
          <Fingerprint className="mx-auto mb-3 text-slate-600" />
          <p className="text-sm text-slate-400">Cuando termines tus primeras lecturas, aquí aparecerá tu ADN lector.</p>
        </Card>
      ) : mode === 'profile'
        ? <Profile stats={stats} openAuthor={openAuthor} />
        : <YearView stats={stats} data={data} openAuthor={openAuthor} editBook={editBook} />}
      {stats.undated > 0 && (
        <p className="mt-6 text-[11px] text-slate-500">{stats.undated} lecturas no tienen año y no cuentan en las vistas por año.</p>
      )}
    </>
  )
}