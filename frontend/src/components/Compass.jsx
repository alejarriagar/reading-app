import { useMemo, useState } from 'react'
import { Brain, ChevronRight, Dices, Globe, Hourglass, Lock, Map as MapIcon, MapPin, RefreshCw, User } from 'lucide-react'
import { buildCompass, surprise } from '../lib/discovery'
import { StateBadge, TierBadge, cx } from './ui'

function Suggestion({ item, onAuthor, onRegion, delay }) {
  const locked = item.state === 'LOCKED'
  return (
    <button
      type="button"
      onClick={() => (item.kind === 'author' ? onAuthor(item.id) : onRegion(item.id))}
      className="chip-in group flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-left transition hover:border-sky-500/30 hover:bg-sky-500/[0.04]"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-lg', locked ? 'bg-white/[0.04] text-slate-500' : 'bg-blue-500/10 text-sky-300')}>
        {locked ? <Lock size={13} /> : item.kind === 'author' ? <User size={14} /> : <MapIcon size={14} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-slate-100">{item.title}</span>
          {item.tier && <TierBadge tier={item.tier} />}
        </span>
        {item.subtitle && <span className="mt-0.5 block text-xs text-slate-500">{item.subtitle}</span>}
      </span>
      <StateBadge state={item.state} />
      <ChevronRight size={15} className="shrink-0 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-sky-300" />
    </button>
  )
}

export default function Compass({ data, anchor, onAuthor, onRegion }) {
  const regionId = anchor?.regionId ?? null
  const authorId = anchor?.authorId ?? null
  const compass = useMemo(() => buildCompass(data, { regionId, authorId }), [data, regionId, authorId])
  const [active, setActive] = useState(null)
  const [pick, setPick] = useState(null)

  const options = [
    { id: 'deepen', icon: MapPin, label: compass.region ? `Profundizar en ${compass.region.name}` : 'Profundizar en un territorio', hint: 'Autores que aún no has leído aquí' },
    { id: 'other', icon: Globe, label: 'Explorar otra literatura', hint: 'Otros países y tradiciones' },
    { id: 'influence', icon: Brain, label: 'Seguir la influencia', hint: 'Conexiones, corrientes e ideas' },
    { id: 'period', icon: Hourglass, label: 'Explorar otro periodo', hint: 'Otros siglos de la misma tradición' },
    { id: 'surprise', icon: Dices, label: 'Sorpréndeme', hint: 'Un autor esencial de un territorio bloqueado' },
  ]

  const choose = id => {
    setActive(id)
    if (id === 'surprise') setPick(surprise(data))
  }

  const items = active === 'surprise' ? (pick ? [pick] : []) : active ? compass[active] : []

  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map(option => {
          const Icon = option.icon
          const isActive = active === option.id
          const count = option.id === 'surprise' ? null : compass[option.id].length
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => choose(option.id)}
              className={cx(
                'flex items-start gap-3 rounded-xl border p-4 text-left transition',
                isActive ? 'border-sky-500/40 bg-sky-500/10' : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15',
                option.id === 'surprise' && 'sm:col-span-2',
              )}
            >
              <span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-lg', isActive ? 'bg-sky-500/20 text-sky-200' : 'bg-white/[0.05] text-sky-300')}>
                <Icon size={16} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-white">{option.label}</span>
                <span className="mt-0.5 block text-xs text-slate-500">{option.hint}{count != null && ` · ${count}`}</span>
              </span>
            </button>
          )
        })}
      </div>

      {active && (
        <div key={`${active}-${pick?.id || ''}`} className="mt-4 space-y-2">
          {items.length > 0
            ? items.map((item, index) => (
              <Suggestion key={`${item.kind}-${item.id}`} item={item} onAuthor={onAuthor} onRegion={onRegion} delay={index * 60} />
            ))
            : <p className="rounded-xl border border-white/5 p-4 text-sm text-slate-500">No hay sugerencias en esta dirección todavía.</p>}
          {active === 'surprise' && (
            <button type="button" onClick={() => setPick(surprise(data, pick?.id))} className="inline-flex items-center gap-2 px-1 pt-1 text-xs text-slate-400 transition hover:text-sky-300">
              <RefreshCw size={12} />Otra sorpresa
            </button>
          )}
        </div>
      )}

      <p className="mt-4 text-[11px] text-slate-500">Son direcciones posibles, no obligaciones: tú decides hacia dónde ir.</p>
    </div>
  )
}