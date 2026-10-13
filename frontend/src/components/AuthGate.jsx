import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowLeft, BookMarked, Loader2 } from 'lucide-react'
import App from '../App'
import { api } from '../api'
import { Button, Field, cx, inputClass } from './ui'

const initials = name => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()

function Shell({ title, subtitle, children }) {
  return (
    <div className="grid min-h-full place-items-center p-6">
      <div className="pop-in w-full max-w-md rounded-3xl border border-white/10 bg-[#0F172A]/90 p-8 shadow-2xl backdrop-blur">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl text-white shadow-lg shadow-blue-600/30" style={{ background: 'linear-gradient(135deg,#2563EB,#0EA5E9)' }}>
            <BookMarked size={20} />
          </div>
          <div>
            <div className="text-base font-semibold text-white">Atlas</div>
            <div className="text-[11px] text-slate-500">Exploración literaria</div>
          </div>
        </div>
        <h1 className="text-xl font-semibold text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-sm leading-relaxed text-slate-400">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  )
}

function Setup() {
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async event => {
    event.preventDefault()
    if (pin !== repeat) { setError('Los PIN no coinciden.'); return }
    setBusy(true)
    setError('')
    try {
      await api.setup({ name, pin })
      window.location.reload()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Shell title="Crea tu perfil" subtitle="Serás el perfil principal. Todas tus lecturas actuales quedarán en él, y después podrás añadir otros perfiles.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Tu nombre"><input className={inputClass} value={name} onChange={e => setName(e.target.value)} autoFocus /></Field>
        <Field label="PIN o contraseña" hint="Al menos 6 caracteres. Si vas a usar la app por internet, mejor 8 o más.">
          <input className={inputClass} type="password" autoComplete="new-password" value={pin} onChange={e => setPin(e.target.value)} />
        </Field>
        <Field label="Repite el PIN"><input className={inputClass} type="password" autoComplete="new-password" value={repeat} onChange={e => setRepeat(e.target.value)} /></Field>
        {error && <p className="text-xs text-amber-400">{error}</p>}
        <Button type="submit" variant="primary" className="w-full" disabled={busy}>Crear perfil y entrar</Button>
      </form>
    </Shell>
  )
}

function Login({ users }) {
  const [selected, setSelected] = useState(users.length === 1 ? users[0] : null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async event => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.login({ user_id: selected.id, pin })
      window.location.reload()
    } catch (err) {
      setError(err.message)
      setPin('')
      setBusy(false)
    }
  }

  if (!selected) {
    return (
      <Shell title="¿Quién eres?" subtitle="Elige tu perfil para ver tu mapa de lecturas.">
        <div className="grid gap-2 sm:grid-cols-2">
          {users.map(user => (
            <button key={user.id} type="button" onClick={() => setSelected(user)} className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 text-left transition hover:border-sky-500/40 hover:bg-sky-500/[0.05]">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/[0.06] text-sm font-semibold text-slate-200">{initials(user.name)}</span>
              <span className="truncate text-sm font-medium text-slate-100">{user.name}</span>
            </button>
          ))}
        </div>
      </Shell>
    )
  }

  return (
    <Shell title={`Hola, ${selected.name}`} subtitle="Escribe tu PIN o contraseña para entrar.">
      <form onSubmit={submit} className="space-y-4">
        <input className={cx(inputClass, 'h-11 text-base')} type="password" autoComplete="current-password" value={pin} onChange={e => setPin(e.target.value)} autoFocus placeholder="PIN o contraseña" />
        {error && <p className="text-xs text-amber-400">{error}</p>}
        <Button type="submit" variant="primary" className="w-full" disabled={busy || !pin}>Entrar</Button>
        {users.length > 1 && (
          <button type="button" onClick={() => { setSelected(null); setPin(''); setError('') }} className="inline-flex items-center gap-1.5 text-xs text-slate-400 transition hover:text-sky-300">
            <ArrowLeft size={12} />Cambiar de perfil
          </button>
        )}
      </form>
    </Shell>
  )
}

export default function AuthGate() {
  const [status, setStatus] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.authStatus().then(setStatus).catch(err => setError(err.message))
  }, [])

  if (error) {
    return (
      <Shell title="No se pudo conectar" subtitle={error}>
        <p className="flex items-center gap-2 text-xs text-slate-500"><AlertTriangle size={14} className="text-amber-400" />Comprueba que el servidor está en marcha.</p>
      </Shell>
    )
  }
  if (!status) return <div className="grid h-full place-items-center text-slate-400"><Loader2 className="animate-spin" /></div>
  if (status.setup) return <Setup />
  if (!status.me) return <Login users={status.users} />
  return <App />
}