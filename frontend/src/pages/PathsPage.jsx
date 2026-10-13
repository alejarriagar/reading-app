import { useState } from 'react'
import { BookOpen, Check, Eye, Library, Lock, Sparkles, Users } from 'lucide-react'
import { api } from '../api'
import Cover from '../components/Cover'
import { Card, PageHeader, STATE_META, STATE_ORDER, StatCard, StateBadge, TIER_META, TierBadge, cx } from '../components/ui'

const GAP = 150
const PAD = 90
const TOP = 84
const LOW = 176
const BRANCH_TOP = 286
const STEP = 78

const FILL = { LOCKED: '#131C2C', DISCOVERED: '#334155', READING: '#0EA5E9', READ: '#2563EB', MASTERED: '#7C3AED' }
const STROKE = { LOCKED: '#2A3649', DISCOVERED: '#64748B', READING: '#7DD3FC', READ: '#93C5FD', MASTERED: '#C4B5FD' }
const LABEL = { LOCKED: '#64748B', DISCOVERED: '#CBD5E1', READING: '#BAE6FD', READ: '#E0E7FF', MASTERED: '#EDE9FE' }
const STATE_ICONS = { LOCKED: Lock, DISCOVERED: Eye, READING: BookOpen, READ: Check }

const isRead = state => state === 'READ' || state === 'MASTERED'

function hexagon(cx0, cy0, r) {
  const points = []
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 3) * i - Math.PI / 6
    points.push(`${(cx0 + r * Math.cos(angle)).toFixed(1)},${(cy0 + r * Math.sin(angle)).toFixed(1)}`)
  }
  return points.join(' ')
}

function NodeIcon({ state, x, y, size }) {
  const props = { x: x - size / 2, y: y - size / 2, width: size, height: size, color: state === 'LOCKED' ? '#64748B' : '#FFFFFF', strokeWidth: 2.4 }
  if (isRead(state)) return <Check {...props} />
  if (state === 'READING') return <BookOpen {...props} />
  if (state === 'LOCKED') return <Lock {...props} />
  return null
}

function PathMap({ authors, selectedId, onSelect, selectedWork, onSelectWork }) {
  const nodes = authors.map((author, i) => ({ ...author, i, x: PAD + i * GAP, y: i % 2 === 0 ? TOP : LOW }))
  const entry = authors.every(a => !isRead(a.state) && a.state !== 'READING')
  const selected = nodes.find(n => n.id === selectedId) || null
  const baseWidth = PAD * 2 + Math.max(0, nodes.length - 1) * GAP
  const labelLeft = selected ? selected.x + 340 > baseWidth && selected.x > 360 : false
  const width = selected && !labelLeft ? Math.max(baseWidth, selected.x + 360) : baseWidth
  const works = selected
    ? selected.works.map((work, j) => ({ ...work, j, x: selected.x + (j % 2 === 0 ? 16 : -16), y: BRANCH_TOP + j * STEP }))
    : []
  const height = works.length ? works[works.length - 1].y + 64 : LOW + 84

  const curve = (a, b) => `M ${a.x} ${a.y} C ${a.x + GAP / 2} ${a.y}, ${b.x - GAP / 2} ${b.y}, ${b.x} ${b.y}`
  const branchCurve = (a, b) => `M ${a.x} ${a.y} C ${a.x} ${a.y + (b.y - a.y) * 0.55}, ${b.x} ${b.y - (b.y - a.y) * 0.45}, ${b.x} ${b.y}`
  const onKey = action => event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); action() }
  }

  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {nodes.slice(1).map((node, k) => {
          const prev = nodes[k]
          const lit = isRead(prev.state) && isRead(node.state)
          return <path key={`seg-${node.id}`} d={curve(prev, node)} fill="none" stroke={lit ? '#3B82F6' : '#1C2638'} strokeWidth={lit ? 5 : 4} strokeLinecap="round" filter={lit ? 'url(#glow)' : undefined} />
        })}

        {selected && works.map((work, j) => {
          const from = j === 0 ? selected : works[j - 1]
          const lit = isRead(work.state)
          return <path key={`branch-${j}`} className="branch-in" style={{ animationDelay: `${j * 60}ms` }} d={branchCurve(from, work)} fill="none" stroke={lit ? '#3B82F6' : '#273449'} strokeWidth="3" strokeDasharray={lit ? undefined : '5 6'} strokeLinecap="round" />
        })}

        {nodes.map(node => {
          const isSelected = node.id === selectedId
          const essential = node.tier === 'ESSENTIAL'
          const r = essential ? 25 : 20
          const isEntry = entry && node.i === 0
          const above = node.y === TOP
          const toggle = () => onSelect(isSelected ? null : node.id)
          return (
            <g key={node.id} className="path-node" role="button" tabIndex={0} aria-label={`${node.name}: ${STATE_META[node.state]?.label}`} onClick={toggle} onKeyDown={onKey(toggle)}>
              {isEntry && <circle cx={node.x} cy={node.y} r={r + 4} fill="none" stroke="#94A3B8" strokeWidth="2" className="pulse-ring" />}
              {isSelected && <circle cx={node.x} cy={node.y} r={r + 9} fill="none" stroke="#38BDF8" strokeOpacity="0.6" strokeWidth="2" />}
              {essential
                ? <polygon className="node-shape" points={hexagon(node.x, node.y, r)} fill={FILL[node.state]} stroke={STROKE[node.state]} strokeWidth="2" filter={isRead(node.state) ? 'url(#glow)' : undefined} />
                : <circle className="node-shape" cx={node.x} cy={node.y} r={r} fill={FILL[node.state]} stroke={STROKE[node.state]} strokeWidth="2" filter={isRead(node.state) ? 'url(#glow)' : undefined} />}
              <NodeIcon state={node.state} x={node.x} y={node.y} size={essential ? 16 : 14} />
              <text x={node.x} y={above ? node.y - r - 30 : node.y + r + 37} textAnchor="middle" fill="#475569" fontSize="10" fontWeight="600" letterSpacing="1">{String(node.i + 1).padStart(2, '0')}</text>
              <text x={node.x} y={above ? node.y - r - 14 : node.y + r + 22} textAnchor="middle" fill={LABEL[node.state]} fontSize="12.5" fontWeight="600">{node.short || node.name}</text>
            </g>
          )
        })}

        {works.map(work => {
          const active = work.j === selectedWork
          const tx = labelLeft ? work.x - 24 : work.x + 24
          const anchor = labelLeft ? 'end' : 'start'
          const select = () => onSelectWork(work.j)
          return (
            <g key={`work-${work.j}`} className="path-node branch-in" style={{ animationDelay: `${work.j * 60 + 40}ms` }} role="button" tabIndex={0} aria-label={`${work.title}: ${STATE_META[work.state]?.label}`} onClick={select} onKeyDown={onKey(select)}>
              {active && <circle cx={work.x} cy={work.y} r="19" fill="none" stroke="#38BDF8" strokeOpacity="0.7" strokeWidth="2" />}
              <circle className="node-shape" cx={work.x} cy={work.y} r="13" fill={FILL[work.state]} stroke={STROKE[work.state]} strokeWidth="2" />
              <NodeIcon state={work.state} x={work.x} y={work.y} size={11} />
              <text x={tx} y={work.y - 2} textAnchor={anchor} fill={LABEL[work.state]} fontSize="13" fontWeight="500">{work.title}</text>
              <text x={tx} y={work.y + 14} textAnchor={anchor} fill="#64748B" fontSize="11">{[work.year, STATE_META[work.state]?.label].filter(Boolean).join(' · ')}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function Legend() {
  return (
    <div className="hidden items-center gap-4 text-[11px] text-slate-500 md:flex">
      <span className="flex items-center gap-1.5"><svg width="12" height="12" viewBox="0 0 24 24"><polygon points={hexagon(12, 12, 11)} fill="#2563EB" /></svg>Esencial</span>
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-600" />Otros</span>
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-sky-500" />Leyendo</span>
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border border-slate-600 bg-slate-800" />Bloqueado</span>
    </div>
  )
}

function AuthorPanel({ author, position, total, workIndex, onSelectWork }) {
  const readCount = author.works.filter(w => isRead(w.state)).length
  const tierLabel = (TIER_META[author.tier]?.label || 'relevante').toLowerCase()
  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Posición {position} de {total}</div>
          <h3 className="mt-1 text-xl font-semibold text-white">{author.name}</h3>
        </div>
        <div className="flex gap-2"><TierBadge tier={author.tier} /><StateBadge state={author.state} /></div>
      </div>

      {author.state === 'LOCKED' ? (
        <div className="mt-5 flex gap-3 rounded-xl border border-sky-500/20 bg-sky-500/[0.06] p-4 text-sm leading-relaxed text-slate-300">
          <Sparkles size={16} className="mt-0.5 shrink-0 text-sky-400" />
          <p>Has descubierto a <strong className="text-white">{author.name}</strong>. Se considera {tierLabel} dentro de este camino. ¿Quieres explorarlo? Una buena puerta de entrada es <em className="text-sky-200">{author.works[0]?.title}</em>.</p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-400">Has leído {readCount} de {author.works.length} obras de este camino.</p>
      )}

      <div className="mt-6 text-[11px] font-medium uppercase tracking-wider text-slate-500">Rama de obras · orden de lectura sugerido</div>
      <div className="mt-2 space-y-1">
        {author.works.map((work, index) => (
          <button key={work.title} type="button" onClick={() => onSelectWork(index)} className={cx('flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition', index === workIndex ? 'border-sky-500/30 bg-sky-500/[0.06]' : 'border-transparent hover:bg-white/[0.03]')}>
            <span className="w-5 text-xs tabular-nums text-slate-500">{index + 1}</span>
            <Cover src={work.cover} title={work.title} size="xs" />
            <span className={cx('flex-1 text-sm', work.state === 'LOCKED' ? 'text-slate-400' : 'text-slate-100')}>
              {work.title}<span className="ml-2 text-xs text-slate-500">{work.year}</span>
            </span>
            <StateBadge state={work.state} />
          </button>
        ))}
      </div>

      {author.otherRead.length > 0 && <p className="mt-4 text-xs text-slate-500">También has leído de este autor: {author.otherRead.join(', ')}</p>}
    </Card>
  )
}

function WorkPanel({ work, onChange }) {
  return (
    <Card className="p-6">
      <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Obra seleccionada</div>
      <h4 className="mt-1 text-lg font-semibold text-white">{work.title}</h4>
      <div className="mt-1 text-xs text-slate-500">{work.year}</div>
      <div className="mt-5 grid grid-cols-2 gap-2">
        {STATE_ORDER.map(state => {
          const Icon = STATE_ICONS[state]
          const active = work.state === state
          return (
            <button key={state} type="button" onClick={() => !active && onChange(state)} className={cx('flex items-center gap-2 rounded-xl border px-3 py-3 text-sm transition', active ? 'border-sky-500/40 bg-sky-500/10 text-white' : 'border-white/[0.06] text-slate-400 hover:border-white/15 hover:text-slate-200')}>
              <Icon size={15} />{STATE_META[state].label}
            </button>
          )
        })}
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-slate-500">Si la obra no estaba en tu biblioteca, se añade automáticamente al cambiar su estado.</p>
    </Card>
  )
}

export default function PathsPage({ data, run }) {
  const paths = data.paths
  const [pathId, setPathId] = useState(paths[0]?.id)
  const [selection, setSelection] = useState({})

  const path = paths.find(p => p.id === pathId) || paths[0]
  if (!path) {
    return <PageHeader eyebrow="Caminos" title="Caminos literarios" subtitle="No hay caminos definidos en assets/paths.json." />
  }

  const current = selection[path.id] || { author: null, work: 0 }
  const setCurrent = next => setSelection(prev => ({ ...prev, [path.id]: { ...current, ...next } }))
  const authors = path.authors
  const selected = authors.find(a => a.id === current.author) || null
  const workIndex = selected && current.work < selected.works.length ? current.work : 0

  const readAuthors = authors.filter(a => isRead(a.state)).length
  const essentials = authors.filter(a => a.tier === 'ESSENTIAL')
  const essentialsRead = essentials.filter(a => isRead(a.state)).length
  const totalWorks = authors.reduce((sum, a) => sum + a.works.length, 0)
  const readWorks = authors.reduce((sum, a) => sum + a.works.filter(w => isRead(w.state)).length, 0)
  const anyStarted = authors.some(a => isRead(a.state) || a.state === 'READING')

  const changeState = state => {
    const work = selected.works[workIndex]
    run(() => api.setPathWork(path.id, { author_id: selected.id, work_index: workIndex, state }), `«${work.title}» · ${STATE_META[state].label}`)
  }

  return (
    <>
      <PageHeader
        eyebrow="Caminos"
        title="Caminos literarios"
        subtitle="Recorridos visuales por una tradición. El orden refleja relevancia, no obligación: puedes empezar por cualquier punto."
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {paths.map(p => {
          const active = p.id === path.id
          const count = p.authors.filter(a => isRead(a.state)).length
          return (
            <button key={p.id} type="button" onClick={() => setPathId(p.id)} className={cx('rounded-xl border px-4 py-2.5 text-left transition', active ? 'border-sky-500/40 bg-sky-500/10' : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15')}>
              <div className={cx('text-sm font-medium', active ? 'text-white' : 'text-slate-300')}>{p.name}</div>
              <div className="mt-0.5 text-[11px] text-slate-500">{count}/{p.authors.length} autores leídos</div>
            </button>
          )
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Users} label="Autores leídos" value={`${readAuthors}/${authors.length}`} hint="Con al menos una obra" tone="blue" />
        <StatCard icon={Sparkles} label="Esenciales" value={`${essentialsRead}/${essentials.length}`} hint="Autores clave del camino" tone="amber" />
        <StatCard icon={Library} label="Obras del camino" value={`${readWorks}/${totalWorks}`} hint="Incluidas en este recorrido" tone="violet" />
      </div>

      <Card className="mt-6 p-2">
        <div className="flex items-center justify-between px-4 pt-3">
          <div className="text-sm font-medium text-white">{path.name}</div>
          <Legend />
        </div>
        {!anyStarted && (
          <p className="px-4 pt-1 text-xs text-slate-400">Todavía no has leído nada de este camino. El punto de entrada sugerido es {authors[0].name}, pero puedes empezar por cualquiera.</p>
        )}
        <PathMap
          authors={authors}
          selectedId={current.author}
          onSelect={id => setCurrent({ author: id, work: 0 })}
          selectedWork={selected ? workIndex : null}
          onSelectWork={index => setCurrent({ work: index })}
        />
        {!selected && <p className="px-4 pb-4 text-xs text-slate-500">Haz clic en un autor para abrir su rama de obras.</p>}
      </Card>

      {selected && (
        <div key={selected.id} className="fade-in mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
          <AuthorPanel author={selected} position={authors.indexOf(selected) + 1} total={authors.length} workIndex={workIndex} onSelectWork={index => setCurrent({ work: index })} />
          <WorkPanel work={selected.works[workIndex]} onChange={changeState} />
        </div>
      )}
    </>
  )
}