import { useEffect } from 'react'
import { AlertTriangle, CheckCircle2, X } from 'lucide-react'

export const STATE_ORDER = ['LOCKED', 'DISCOVERED', 'READING', 'READ']

export const STATE_META = {
  LOCKED: { label: 'Bloqueado', badge: 'border-slate-700/80 bg-slate-800/40 text-slate-400', dot: 'bg-slate-600' },
  DISCOVERED: { label: 'Descubierto', badge: 'border-slate-500/40 bg-slate-500/10 text-slate-200', dot: 'bg-slate-300' },
  READING: { label: 'Leyendo', badge: 'border-sky-500/30 bg-sky-500/10 text-sky-300', dot: 'bg-sky-400' },
  READ: { label: 'Leído', badge: 'border-blue-500/30 bg-blue-500/10 text-blue-300', dot: 'bg-blue-500' },
  MASTERED: { label: 'Exploración profunda', badge: 'border-violet-500/30 bg-violet-500/10 text-violet-300', dot: 'bg-violet-400' },
}

export const TIER_META = {
  ESSENTIAL: { label: 'Esencial', badge: 'border-amber-400/30 bg-amber-400/10 text-amber-300' },
  RECOMMENDED: { label: 'Recomendado', badge: 'border-sky-400/30 bg-sky-400/10 text-sky-300' },
  SPECIALIZED: { label: 'Especializado', badge: 'border-slate-400/20 bg-slate-400/10 text-slate-300' },
}

export const inputClass =
  'h-9 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-sky-500/60 focus:bg-white/[0.05]'

export function cx(...classes) {
  return classes.filter(Boolean).join(' ')
}

export function useEscape(active, onClose) {
  useEffect(() => {
    if (!active) return undefined
    const handler = event => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [active, onClose])
}

export function Card({ className = '', children, ...props }) {
  return (
    <div className={cx('rounded-2xl border border-white/[0.06] bg-[#111A2C]/80 backdrop-blur-sm', className)} {...props}>
      {children}
    </div>
  )
}

export function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-400">{eyebrow}</div>}
        <h1 className="text-3xl font-semibold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  )
}

export function Button({ variant = 'secondary', size = 'md', type = 'button', className = '', children, ...props }) {
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-600/20',
    secondary: 'border border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]',
    ghost: 'text-slate-400 hover:bg-white/[0.05] hover:text-white',
  }
  const sizes = { sm: 'h-8 px-3 text-xs', md: 'h-9 px-4 text-sm' }
  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40',
        variants[variant], sizes[size], className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function StateBadge({ state }) {
  const meta = STATE_META[state] || STATE_META.LOCKED
  return (
    <span className={cx('inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium', meta.badge)}>
      <span className={cx('h-1.5 w-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  )
}

export function TierBadge({ tier }) {
  const meta = TIER_META[tier] || TIER_META.SPECIALIZED
  return <span className={cx('inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-[11px] font-medium', meta.badge)}>{meta.label}</span>
}

export function ProgressBar({ value, className = '' }) {
  const pct = Math.max(0, Math.min(100, Math.round((value || 0) * 100)))
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]', className)}>
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#2563EB,#38BDF8)' }} />
    </div>
  )
}

const TONES = {
  blue: 'bg-blue-500/10 text-blue-400',
  sky: 'bg-sky-500/10 text-sky-400',
  violet: 'bg-violet-500/10 text-violet-400',
  amber: 'bg-amber-400/10 text-amber-300',
}

export function StatCard({ icon: Icon, label, value, hint, tone = 'blue' }) {
  return (
    <Card className="p-5 transition hover:border-white/10">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400">{label}</span>
        <span className={cx('grid h-8 w-8 place-items-center rounded-lg', TONES[tone])}><Icon size={16} /></span>
      </div>
      <div className="mt-4 text-3xl font-semibold tracking-tight text-white tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </Card>
  )
}

export function Segmented({ options, value, onChange }) {
  return (
    <div className="inline-flex flex-wrap rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cx(
            'rounded-md px-3 py-1.5 text-xs font-medium transition',
            value === option.value ? 'bg-white/10 text-white shadow' : 'text-slate-400 hover:text-slate-200',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Field({ label, hint, children, as: Tag = 'label', className = '' }) {
  return (
    <Tag className={cx('block', className)}>
      <span className="mb-1.5 block text-xs font-medium text-slate-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
    </Tag>
  )
}

export function Modal({ open, title, subtitle, onClose, children, footer, width = 'max-w-lg' }) {
  useEscape(open, onClose)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fade-in absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" className={cx('pop-in relative w-full rounded-2xl border border-white/10 bg-[#0F172A] shadow-2xl', width)}>
        <div className="flex items-start justify-between gap-4 border-b border-white/5 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-white">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-md p-1 text-slate-400 hover:bg-white/5 hover:text-white"><X size={16} /></button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-white/5 px-6 py-4">{footer}</div>}
      </div>
    </div>
  )
}

export function Drawer({ open, title, subtitle, onClose, children, footer }) {
  useEscape(open, onClose)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="fade-in absolute inset-0 bg-black/50" onClick={onClose} />
      <aside role="dialog" aria-modal="true" className="slide-in relative flex h-full w-full max-w-xl flex-col border-l border-white/10 bg-[#0D1526] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/5 px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-md p-1 text-slate-400 hover:bg-white/5 hover:text-white"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-white/5 px-6 py-4">{footer}</div>}
      </aside>
    </div>
  )
}

export function Toast({ message, kind, action }) {
  return (
    <div className="pop-in fixed bottom-6 right-6 z-[60] flex items-center gap-2 rounded-xl border border-white/10 bg-[#111A2C] px-4 py-3 text-sm text-slate-200 shadow-2xl">
      {kind === 'error' ? <AlertTriangle size={16} className="text-amber-400" /> : <CheckCircle2 size={16} className="text-emerald-400" />}
      {message}
      {action && (
        <button type="button" onClick={action.onClick} className="ml-2 rounded-md px-2 py-1 text-xs font-semibold text-sky-300 transition hover:bg-white/5">
          {action.label}
        </button>
      )}
    </div>
  )
}