import { useMemo, useRef, useState } from 'react'
import { geoNaturalEarth1, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import world from 'world-atlas/countries-110m.json'
import { Clock, Globe, Lock, Trophy, Users } from 'lucide-react'
import { Card, Drawer, PageHeader, ProgressBar, Segmented, StatCard, StateBadge, TierBadge, cx } from '../components/ui'

const WIDTH = 960
const HEIGHT = 500
const FEATURES = feature(world, world.objects.countries).features.filter(f => f.id !== '010')
const VIEWS = {
  world: null,
  europe: [[-12, 35], [42, 35], [42, 70], [-12, 70]],
  americas: [[-125, -55], [-35, -55], [-35, 60], [-125, 60]],
  asia: [[25, -10], [150, -10], [150, 60], [25, 60]],
}
const READ = new Set(['READ', 'MASTERED'])

const hex = value => [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16))
function mix(a, b, t) {
  const A = hex(a)
  const B = hex(b)
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`
}

function fillFor(item) {
  if (!item) return '#0D1524'
  if (item.read > 0) return mix('#1E40AF', '#38BDF8', Math.sqrt(Math.min(1, item.rate)))
  if (item.state === 'READING') return '#0E7490'
  if (item.state === 'DISCOVERED') return '#26344B'
  return '#172235'
}

function Avatar({ author }) {
  const [failed, setFailed] = useState(false)
  if (author.image && !failed) {
    return <img src={author.image} alt="" loading="lazy" onError={() => setFailed(true)} className="h-8 w-8 shrink-0 rounded-lg border border-white/10 object-cover" />
  }
  const initials = author.name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
  return <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-[10px] font-semibold text-slate-500">{initials}</span>
}

function AuthorRows({ entries, data, openAuthor }) {
  return (
    <div className="space-y-1">
      {entries.map(entry => {
        const author = data.authors[entry.id]
        if (!author) return null
        const locked = entry.state === 'LOCKED'
        return (
          <button key={entry.id} type="button" onClick={() => openAuthor(entry.id)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-white/[0.04]">
            <Avatar author={author} />
            <span className={cx('min-w-0 flex-1 truncate text-sm', locked ? 'text-slate-400' : 'text-slate-100')}>
              {locked && <Lock size={11} className="mr-1.5 inline text-slate-600" />}{author.name}
            </span>
            <TierBadge tier={entry.tier} />
            <StateBadge state={entry.state} />
          </button>
        )
      })}
    </div>
  )
}

function GroupDetail({ group, data, openAuthor }) {
  const read = group.authors.filter(e => READ.has(e.state))
  const rest = group.authors.filter(e => !READ.has(e.state))
  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        {[
          ['Autores leídos', `${group.read}/${group.total}`],
          ['Obras leídas', group.booksRead],
          ['Explorado', `${Math.round(group.rate * 100)}%`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
            <div className="text-[11px] text-slate-500">{label}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-white">{value}</div>
          </div>
        ))}
      </div>
      <ProgressBar value={group.rate} className="mt-4" />

      {read.length === 0 && (
        <div className="mt-5 flex gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-4 text-sm text-slate-400">
          <Lock size={15} className="mt-0.5 shrink-0" />
          Todavía no has leído nada aquí. Puedes ver todo lo que contiene y empezar por cualquier autor.
        </div>
      )}
      {read.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">Has leído · {read.length}</div>
          <AuthorRows entries={read} data={data} openAuthor={openAuthor} />
        </div>
      )}
      {rest.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">Por descubrir · {rest.length}</div>
          <AuthorRows entries={rest} data={data} openAuthor={openAuthor} />
        </div>
      )}
    </>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500">
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: '#0D1524', border: '1px solid #1E293B' }} />Sin autores</span>
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: '#172235' }} />Bloqueado</span>
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: '#0E7490' }} />Leyendo</span>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-16 rounded-sm" style={{ background: 'linear-gradient(90deg,#1E40AF,#38BDF8)' }} />Explorado
      </span>
    </div>
  )
}

function WorldMap({ countries, view, selectedId, onSelect }) {
  const byCode = useMemo(() => Object.fromEntries(countries.map(c => [c.id, c])), [countries])
  const path = useMemo(() => {
    const projection = geoNaturalEarth1()
    const target = VIEWS[view]
      ? { type: 'MultiPoint', coordinates: VIEWS[view] }
      : { type: 'FeatureCollection', features: FEATURES }
    projection.fitExtent([[12, 12], [WIDTH - 12, HEIGHT - 12]], target)
    return geoPath(projection)
  }, [view])
  const [hover, setHover] = useState(null)
  const ref = useRef(null)

  const move = (event, item, name) => {
    const rect = ref.current.getBoundingClientRect()
    setHover({
      item,
      name,
      x: Math.min(event.clientX - rect.left + 14, rect.width - 220),
      y: event.clientY - rect.top + 14,
    })
  }

  return (
    <div ref={ref} className="relative">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="block h-auto w-full" role="img" aria-label="Mapa mundial de tu exploración literaria">
        <path d={path({ type: 'Sphere' })} fill="#0A1120" />
        {FEATURES.map((f, index) => {
          const item = byCode[f.id]
          const d = path(f)
          if (!d) return null
          const active = (hover?.item && hover.item === item) || (selectedId && item?.id === selectedId)
          return (
            <path
              key={f.id ?? `f-${index}`}
              d={d}
              fill={fillFor(item)}
              stroke={active ? '#38BDF8' : '#0B1220'}
              strokeWidth={active ? 1.4 : 0.6}
              style={{ transition: 'fill 300ms ease' }}
              className={item ? 'cursor-pointer' : undefined}
              onMouseMove={e => move(e, item, f.properties?.name)}
              onMouseLeave={() => setHover(null)}
              onClick={() => item && onSelect(item.id)}
            />
          )
        })}
        {FEATURES.map(f => {
          const item = byCode[f.id]
          if (!item || item.read > 0 || item.total < 3 || path.area(f) < 250) return null
          const [x, y] = path.centroid(f)
          if (!Number.isFinite(x)) return null
          return <Lock key={`lock-${f.id}`} x={x - 5} y={y - 5} width={10} height={10} color="#475569" strokeWidth={2.5} pointerEvents="none" />
        })}
      </svg>

      {hover && (
        <div className="pointer-events-none absolute z-10 w-52 rounded-lg border border-white/10 bg-[#0F172A]/95 px-3 py-2 text-xs shadow-xl" style={{ left: hover.x, top: hover.y }}>
          <div className="font-semibold text-white">{hover.item?.name || hover.name}</div>
          {hover.item
            ? <div className="mt-0.5 text-slate-400">{hover.item.read}/{hover.item.total} autores leídos · {Math.round(hover.item.rate * 100)}%</div>
            : <div className="mt-0.5 text-slate-500">Sin autores en tu catálogo</div>}
        </div>
      )}
    </div>
  )
}

function Timeline({ buckets, selectedId, onSelect }) {
  const max = Math.max(1, ...buckets.map(b => b.total))
  return (
    <div className="overflow-x-auto">
      <div className="relative flex min-w-[820px] items-start px-2 py-4">
        <div className="absolute left-8 right-8 h-[2px] rounded-full" style={{ top: 80, background: 'linear-gradient(90deg, rgba(37,99,235,0.15), rgba(56,189,248,0.5), rgba(37,99,235,0.15))' }} />
        {buckets.map(b => {
          const size = b.total ? 20 + Math.sqrt(b.total / max) * 40 : 12
          const active = b.id === selectedId
          const lit = b.read > 0
          return (
            <button key={b.id} type="button" onClick={() => onSelect(active ? null : b.id)} className={cx('relative flex flex-1 flex-col items-center gap-2 rounded-xl px-1 pb-3 pt-1 transition hover:bg-white/[0.03]', active && 'bg-white/[0.04]')}>
              <span className="h-5 text-xs tabular-nums text-slate-400">{b.total ? `${b.read}/${b.total}` : ''}</span>
              <span className="grid h-16 w-16 place-items-center">
                <span
                  className={cx('grid place-items-center rounded-full border transition-all duration-300', active ? 'border-sky-300' : lit ? 'border-sky-400/40' : 'border-white/10')}
                  style={{
                    width: size,
                    height: size,
                    background: fillFor(b.total ? b : null),
                    boxShadow: lit ? `0 0 ${10 + b.rate * 30}px rgba(56,189,248,${0.25 + b.rate * 0.5})` : 'none',
                  }}
                >
                  {!lit && b.total > 0 && <Lock size={11} className="text-slate-500" />}
                </span>
              </span>
              <span className={cx('text-xs font-medium', lit ? 'text-slate-100' : 'text-slate-500')}>{b.label}</span>
              <span className="text-[10px] text-slate-600">{b.range}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function WorldPage({ data, openAuthor }) {
  const [mode, setMode] = useState('map')
  const [view, setView] = useState('world')
  const [countryId, setCountryId] = useState(null)
  const [bucketId, setBucketId] = useState(null)

  const worldData = data.world || { countries: [], timeline: [], unplaced: 0, unplacedNames: [] }
  const { countries, timeline } = worldData

  const explored = countries.filter(c => c.read > 0).length
  const strongest = [...countries].filter(c => c.total >= 3 && c.read > 0).sort((a, b) => b.rate - a.rate)[0]
  const eras = timeline.filter(b => b.total > 0)
  const erasRead = eras.filter(b => b.read > 0).length
  const placed = countries.reduce((sum, c) => sum + c.total, 0)
  const ranked = [...countries].sort((a, b) => b.read - a.read || b.rate - a.rate || b.total - a.total)
  const country = countryId ? countries.find(c => c.id === countryId) : null
  const bucket = bucketId ? timeline.find(b => b.id === bucketId) : null

  return (
    <>
      <PageHeader
        eyebrow="Mundo"
        title="Tu mapa de la literatura universal"
        subtitle="Cada lectura ilumina un país y una época. Lo que aún no has explorado se ve en gris oscuro, pero puedes abrirlo y ver qué contiene."
        actions={<Segmented value={mode} onChange={setMode} options={[{ value: 'map', label: 'Mapa mundial' }, { value: 'time', label: 'Línea temporal' }]} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Globe} label="Literaturas exploradas" value={`${explored}/${countries.length}`} hint="Países con al menos un autor leído" tone="blue" />
        <StatCard icon={Clock} label="Épocas exploradas" value={`${erasRead}/${eras.length}`} hint="De la Antigüedad al siglo XXI" tone="sky" />
        <StatCard icon={Trophy} label="Más explorada" value={strongest ? `${Math.round(strongest.rate * 100)}%` : '—'} hint={strongest ? strongest.name : 'Aún sin datos'} tone="amber" />
        <StatCard icon={Users} label="Autores en el mapa" value={placed} hint="Ubicados por país" tone="violet" />
      </div>

      {mode === 'map' ? (
        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_300px]">
          <Card className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <Segmented
                value={view}
                onChange={setView}
                options={[{ value: 'world', label: 'Mundo' }, { value: 'europe', label: 'Europa' }, { value: 'americas', label: 'América' }, { value: 'asia', label: 'Asia' }]}
              />
              <Legend />
            </div>
            <WorldMap countries={countries} view={view} selectedId={countryId} onSelect={setCountryId} />
            {worldData.unplaced > 0 && (
              <p className="mt-3 text-[11px] text-slate-500">
                {worldData.unplaced} autores no aparecen en el mapa porque su país no se ha podido ubicar
                {worldData.unplacedNames.length ? `: ${worldData.unplacedNames.join(', ')}` : ''}.
              </p>
            )}
          </Card>

          <Card className="p-4">
            <div className="mb-3 text-sm font-semibold text-white">Literaturas</div>
            <div className="max-h-[560px] space-y-1 overflow-y-auto pr-1">
              {ranked.map(c => (
                <button key={c.id} type="button" onClick={() => setCountryId(c.id)} className={cx('w-full rounded-lg px-2 py-2 text-left transition hover:bg-white/[0.04]', c.id === countryId && 'bg-white/[0.05]')}>
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                    <span className={cx('flex items-center gap-1.5 truncate', c.read > 0 ? 'text-slate-100' : 'text-slate-400')}>
                      {c.read === 0 && <Lock size={11} className="text-slate-600" />}{c.name}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-slate-500">{c.read}/{c.total}</span>
                  </div>
                  <ProgressBar value={c.rate} />
                </button>
              ))}
            </div>
          </Card>
        </div>
      ) : (
        <>
          <Card className="mt-6 p-4">
            <Timeline buckets={timeline} selectedId={bucketId} onSelect={setBucketId} />
          </Card>
          {bucket ? (
            <Card key={bucket.id} className="fade-in mt-6 p-6">
              <div className="mb-4 flex items-baseline gap-3">
                <h3 className="text-lg font-semibold text-white">{bucket.label}</h3>
                <span className="text-xs text-slate-500">{bucket.range}</span>
              </div>
              <GroupDetail group={bucket} data={data} openAuthor={openAuthor} />
            </Card>
          ) : (
            <p className="mt-4 text-xs text-slate-500">Haz clic en una época para ver sus autores. Cada autor se sitúa en su época de actividad (nacimiento + 35 años).</p>
          )}
        </>
      )}

      {country && (
        <Drawer open title={country.name} subtitle={`${country.read} de ${country.total} autores leídos · ${country.booksRead} obras leídas`} onClose={() => setCountryId(null)}>
          <GroupDetail group={country} data={data} openAuthor={openAuthor} />
        </Drawer>
      )}
    </>
  )
}