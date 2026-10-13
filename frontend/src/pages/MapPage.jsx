import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Flag, Lock, Search, Sparkles } from 'lucide-react'
import { api } from '../api'
import { Button, Drawer, PageHeader, ProgressBar, Segmented, StateBadge, TIER_META, TierBadge, cx, inputClass } from '../components/ui'

const TIERS = ['ESSENTIAL', 'RECOMMENDED', 'SPECIALIZED']

function RegionTile({ region, onClick }) {
  const locked = region.state === 'LOCKED'
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'group relative overflow-hidden rounded-2xl border p-5 text-left transition-all duration-200 hover:-translate-y-0.5',
        locked ? 'border-white/[0.04] bg-[#0C1424] hover:border-white/10' : 'border-white/[0.07] bg-[#111A2C] hover:border-sky-500/30 hover:shadow-lg hover:shadow-blue-950/40',
      )}
    >
      {!locked && (
        <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full blur-2xl" style={{ background: `radial-gradient(circle, rgba(37,99,235,${0.15 + region.rate * 0.5}), transparent 70%)` }} />
      )}
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-slate-500">{region.type}</div>
          <div className={cx('mt-1 truncate text-[15px] font-semibold', locked ? 'text-slate-400' : 'text-white')}>{region.name}</div>
        </div>
        {locked
          ? <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.03] text-slate-500"><Lock size={14} /></span>
          : <StateBadge state={region.state} />}
      </div>

      {locked ? (
        <div className="relative mt-6 text-xs text-slate-500">{region.total} autores · {region.works} obras por descubrir</div>
      ) : (
        <div className="relative mt-6">
          <div className="mb-2 flex items-end justify-between">
            <span className="text-2xl font-semibold tabular-nums text-white">{Math.round(region.rate * 100)}%</span>
            <span className="text-xs text-slate-400">{region.read}/{region.total} autores</span>
          </div>
          <ProgressBar value={region.rate} />
          <div className="mt-3 flex gap-4 text-[11px] text-slate-500">
            <span>Esenciales {region.tiers.ESSENTIAL.read}/{region.tiers.ESSENTIAL.total}</span>
            <span>Recomendados {region.tiers.RECOMMENDED.read}/{region.tiers.RECOMMENDED.total}</span>
          </div>
        </div>
      )}
      <ChevronRight size={16} className="absolute bottom-5 right-5 text-slate-600 opacity-0 transition group-hover:opacity-100" />
    </button>
  )
}

function RegionDrawer({ region, data, regionsById, run, openAuthor, onSelect, onClose }) {
  const mastered = region.state === 'MASTERED'
  const showFrontiers = region.rate >= 0.25 || mastered
  const groups = TIERS.map(tier => ({ tier, entries: region.authors.filter(e => e.tier === tier) })).filter(g => g.entries.length)

  return (
    <Drawer
      open
      title={region.name}
      subtitle={region.type}
      onClose={onClose}
      footer={
        <Button variant={mastered ? 'secondary' : 'primary'} onClick={() => run(() => api.toggleMastery(region.id), mastered ? 'Marca retirada' : 'Territorio marcado como exploración profunda')}>
          {mastered ? 'Quitar exploración profunda' : 'Marcar exploración profunda'}
        </Button>
      }
    >
      <div className="grid grid-cols-3 gap-3">
        {TIERS.map(tier => (
          <div key={tier} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
            <div className="text-[11px] text-slate-500">{TIER_META[tier].label}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-white">
              {region.tiers[tier].read}<span className="text-sm text-slate-500">/{region.tiers[tier].total}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex justify-between text-xs text-slate-400"><span>Exploración</span><span className="tabular-nums">{Math.round(region.rate * 100)}%</span></div>
        <ProgressBar value={region.rate} />
      </div>

      {region.state === 'LOCKED' && (
        <div className="mt-5 flex gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-4 text-sm text-slate-400">
          <Lock size={15} className="mt-0.5 shrink-0" />
          Este territorio está bloqueado, pero puedes ver lo que contiene. Lee cualquiera de sus obras para desbloquearlo.
        </div>
      )}

      {groups.map(group => (
        <div key={group.tier} className="mt-6">
          <div className="mb-2 flex items-center gap-2">
            <TierBadge tier={group.tier} />
            <span className="text-xs text-slate-500">{group.entries.filter(e => ['READ', 'MASTERED'].includes(e.state)).length}/{group.entries.length}</span>
          </div>
          <div className="divide-y divide-white/5 rounded-xl border border-white/5">
            {group.entries.map(entry => (
              <div key={entry.id} className="flex items-center gap-3 px-3 py-2.5">
                <button type="button" onClick={() => openAuthor(entry.id)} className={cx('flex min-w-0 flex-1 items-center gap-2 text-left text-sm transition hover:text-sky-300', entry.state === 'LOCKED' ? 'text-slate-400' : 'text-slate-100')}>
                  {entry.state === 'LOCKED' && <Lock size={12} className="shrink-0 text-slate-600" />}
                  <span className="truncate">{data.authors[entry.id]?.name}</span>
                </button>
                <StateBadge state={entry.state} />
                <select
                  aria-label="Clasificación en este territorio"
                  value={entry.tier}
                  onChange={e => run(() => api.setTier({ region_id: region.id, author_id: entry.id, tier: e.target.value }), 'Clasificación actualizada')}
                  className="h-7 rounded-md border border-white/10 bg-transparent px-1.5 text-[11px] text-slate-300 outline-none"
                >
                  {TIERS.map(tier => <option key={tier} value={tier}>{TIER_META[tier].label}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="mt-8">
        <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white"><Flag size={14} className="text-sky-400" />Fronteras</h4>
        {showFrontiers && region.frontiers.length > 0 ? (
          <>
            <p className="mb-3 text-xs text-slate-400">Has explorado una parte importante de este territorio. Estas regiones están cerca; tú decides si quieres ir hacia ellas.</p>
            <div className="space-y-2">
              {region.frontiers.map(id => {
                const frontier = regionsById[id]
                if (!frontier) return null
                return (
                  <div key={id} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 px-3 py-2">
                    <span className="text-sm text-slate-200">{frontier.name}</span>
                    {frontier.state === 'LOCKED'
                      ? <Button size="sm" onClick={() => run(() => api.discoverRegion(id), 'Territorio descubierto')}><Sparkles size={13} />Descubrir</Button>
                      : <Button size="sm" variant="ghost" onClick={() => onSelect(id)}>Ver</Button>}
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <p className="text-xs text-slate-500">Las fronteras aparecerán cuando hayas explorado al menos un 25% de este territorio.</p>
        )}
      </div>
    </Drawer>
  )
}

export default function MapPage({ data, run, openAuthor, routeSub, openRegion, closeRegion }) {
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const selectedId = routeSub
  const setSelectedId = id => (id ? openRegion(id) : closeRegion())
  const regionsById = useMemo(() => Object.fromEntries(data.regions.map(r => [r.id, r])), [data.regions])

  const q = query.trim().toLowerCase()
  const visible = data.regions
    .filter(r => filter === 'all' || (filter === 'unlocked' ? r.state !== 'LOCKED' : r.state === 'LOCKED'))
    .filter(r => !q || r.name.toLowerCase().includes(q))
    .sort((a, b) => (a.state === 'LOCKED') - (b.state === 'LOCKED') || b.rate - a.rate)

  const selected = selectedId ? regionsById[selectedId] : null
  const unlockedCount = data.regions.filter(r => r.state !== 'LOCKED').length

  return (
    <>
      <PageHeader
        eyebrow="Mapa"
        title="Territorios literarios"
        subtitle="Cada lectura desbloquea territorios. Los bloqueados son visibles: puedes ver qué contienen y empezar por donde quieras."
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `Todos · ${data.regions.length}` },
            { value: 'unlocked', label: `Desbloqueados · ${unlockedCount}` },
            { value: 'locked', label: `Bloqueados · ${data.regions.length - unlockedCount}` },
          ]}
        />
        <div className="relative w-full sm:w-72">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar territorio…" className={cx(inputClass, 'pl-9')} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map(region => <RegionTile key={region.id} region={region} onClick={() => setSelectedId(region.id)} />)}
      </div>

      {selected && (
        <RegionDrawer region={selected} data={data} regionsById={regionsById} run={run} openAuthor={openAuthor} onSelect={setSelectedId} onClose={() => setSelectedId(null)} />
      )}
    </>
  )
}