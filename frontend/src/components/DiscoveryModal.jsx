import { Check, Circle, Sparkles } from 'lucide-react'
import Compass from './Compass'
import { Button, Modal, ProgressBar, cx } from './ui'
import { isIdeaRegion, isRead } from '../lib/discovery'

const SPARKS = [
  { left: '8%', top: '22%', delay: '0s' },
  { left: '22%', top: '72%', delay: '0.6s' },
  { left: '48%', top: '14%', delay: '1.1s' },
  { left: '70%', top: '62%', delay: '0.3s' },
  { left: '88%', top: '26%', delay: '1.5s' },
  { left: '94%', top: '78%', delay: '0.9s' },
]

function Stat({ value, label }) {
  return (
    <li className="flex items-baseline gap-2">
      <span className="w-8 text-right text-lg font-semibold tabular-nums text-white">{value}</span>
      <span className="text-sm text-slate-400">{label}</span>
    </li>
  )
}

export function DiscoveryModal({ discovery, data, onClose, onAuthor, onRegion }) {
  const { book, author, firstOfAuthor, newlyUnlocked, touched, primary, before } = discovery
  const isNew = newlyUnlocked.length > 0
  const title = isNew ? 'Nuevo territorio descubierto' : 'Territorio ampliado'
  const essentials = primary ? primary.authors.filter(e => e.tier === 'ESSENTIAL') : []
  const essentialsRead = essentials.filter(e => isRead(e.state)).length
  const delta = primary ? Math.round((primary.rate - (before?.rate || 0)) * 100) : 0
  const ideas = touched.filter(isIdeaRegion).length

  return (
    <Modal
      open
      title={title}
      subtitle={`«${book.title}» · ${author?.name || book.authorName}`}
      onClose={onClose}
      width="max-w-3xl"
      footer={<Button variant="ghost" onClick={onClose}>Seguir por mi cuenta</Button>}
    >
      <div
        className="relative overflow-hidden rounded-2xl border border-sky-500/20 p-6"
        style={{ background: 'radial-gradient(600px 220px at 15% 0%, rgba(37,99,235,0.28), transparent 70%), radial-gradient(400px 200px at 100% 100%, rgba(14,165,233,0.14), transparent 70%), #0E1830' }}
      >
        {SPARKS.map((spark, index) => (
          <span key={index} className="twinkle" style={{ left: spark.left, top: spark.top, animationDelay: spark.delay }} />
        ))}
        <div className="relative flex items-center gap-4">
          <span className="glow-pulse grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-white" style={{ background: 'linear-gradient(135deg,#2563EB,#0EA5E9)' }}>
            <Sparkles size={22} />
          </span>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-300">{isNew ? '🎉 ' : ''}{title}</div>
            <div className="mt-1 text-xl font-semibold text-white">Has terminado «{book.title}»</div>
            <div className="mt-0.5 text-xs text-slate-400">
              {author?.name || book.authorName}{firstOfAuthor && ' · tu primer libro de este autor'}
            </div>
          </div>
        </div>

        {isNew && (
          <div className="relative mt-5 flex flex-wrap gap-2">
            {newlyUnlocked.map((region, index) => (
              <button
                key={region.id}
                type="button"
                onClick={() => onRegion(region.id)}
                className="chip-in rounded-full border border-sky-400/40 bg-sky-400/10 px-3 py-1 text-xs font-medium text-sky-100 transition hover:bg-sky-400/20"
                style={{ animationDelay: `${200 + index * 90}ms` }}
              >
                {region.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {primary && (
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div>
            <button type="button" onClick={() => onRegion(primary.id)} className="text-left text-base font-semibold text-white transition hover:text-sky-300">{primary.name}</button>
            <div className="mt-1 text-xs text-slate-500">{isNew ? 'Has descubierto:' : 'En este territorio hay:'}</div>
            <ul className="mt-3 space-y-1.5">
              <Stat value={primary.tiers.ESSENTIAL.total} label="autores esenciales" />
              <Stat value={primary.tiers.RECOMMENDED.total} label="autores recomendados" />
              <Stat value={primary.works} label="obras" />
              {ideas > 0 && <Stat value={ideas} label={ideas === 1 ? 'corriente o tema' : 'corrientes y temas'} />}
              <Stat value={primary.frontiers.length} label="fronteras con otros territorios" />
            </ul>
          </div>

          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Autores esenciales</div>
            <ul className="mt-3 space-y-1.5">
              {essentials.slice(0, 8).map(entry => {
                const done = isRead(entry.state)
                return (
                  <li key={entry.id}>
                    <button type="button" onClick={() => onAuthor(entry.id)} className={cx('flex items-center gap-2 text-sm transition hover:text-sky-300', done ? 'text-slate-100' : 'text-slate-400')}>
                      {done ? <Check size={14} className="text-sky-400" /> : <Circle size={12} className="text-slate-600" />}
                      {data.authors[entry.id]?.name}
                    </button>
                  </li>
                )
              })}
              {essentials.length === 0 && <li className="text-sm text-slate-500">Este territorio no tiene autores esenciales definidos.</li>}
            </ul>
            <div className="mt-4">
              <div className="mb-1.5 flex justify-between text-xs text-slate-400">
                <span>Esenciales {essentialsRead} / {essentials.length}</span>
                <span className="tabular-nums">
                  {Math.round(primary.rate * 100)}% explorado
                  {delta > 0 && <span className="ml-1.5 text-emerald-400">+{delta}%</span>}
                </span>
              </div>
              <ProgressBar value={primary.rate} />
            </div>
          </div>
        </div>
      )}

      <h4 className="mt-8 mb-3 text-sm font-semibold text-white">¿Hacia dónde quieres explorar?</h4>
      <Compass data={data} anchor={{ regionId: primary?.id ?? null, authorId: book.author }} onAuthor={onAuthor} onRegion={onRegion} />
    </Modal>
  )
}

export function CompassModal({ anchor, data, onClose, onAuthor, onRegion }) {
  const region = anchor?.regionId ? data.regions.find(r => r.id === anchor.regionId) : null
  return (
    <Modal
      open
      title="¿Hacia dónde quieres explorar?"
      subtitle={region ? `Desde ${region.name}` : 'Elige una dirección'}
      onClose={onClose}
      width="max-w-2xl"
      footer={<Button variant="ghost" onClick={onClose}>Cerrar</Button>}
    >
      <Compass data={data} anchor={anchor} onAuthor={onAuthor} onRegion={onRegion} />
    </Modal>
  )
}