import { useState } from 'react'
import { ChevronDown, KeyRound, LogOut, UserPlus } from 'lucide-react'
import { api } from '../api'
import { Button, Field, Modal, cx, inputClass } from './ui'

const initials = name => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()

function MenuItem({ icon: Icon, onClick, children }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-slate-300 transition hover:bg-white/[0.05] hover:text-white">
      <Icon size={14} className="text-slate-500" />{children}
    </button>
  )
}

function PinDialog({ onClose }) {
  const [form, setForm] = useState({ old: '', new: '', repeat: '' })
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))

  const submit = async () => {
    if (form.new !== form.repeat) { setError('Los PIN nuevos no coinciden.'); return }
    try {
      await api.changePin({ old: form.old, new: form.new })
      setDone(true)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <Modal open title="Cambiar PIN" onClose={onClose} footer={done
      ? <Button variant="primary" onClick={onClose}>Cerrar</Button>
      : <><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={submit}>Guardar</Button></>}>
      {done ? <p className="text-sm text-emerald-300">PIN actualizado.</p> : (
        <div className="space-y-4">
          <Field label="PIN actual"><input className={inputClass} type="password" autoComplete="current-password" value={form.old} onChange={e => set('old', e.target.value)} autoFocus /></Field>
          <Field label="PIN nuevo" hint="Al menos 6 caracteres."><input className={inputClass} type="password" autoComplete="new-password" value={form.new} onChange={e => set('new', e.target.value)} /></Field>
          <Field label="Repite el PIN nuevo"><input className={inputClass} type="password" autoComplete="new-password" value={form.repeat} onChange={e => set('repeat', e.target.value)} /></Field>
          {error && <p className="text-xs text-amber-400">{error}</p>}
        </div>
      )}
    </Modal>
  )
}

function UserDialog({ onClose }) {
  const [form, setForm] = useState({ name: '', pin: '', repeat: '' })
  const [error, setError] = useState('')
  const [created, setCreated] = useState(null)
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))

  const submit = async () => {
    if (form.pin !== form.repeat) { setError('Los PIN no coinciden.'); return }
    try {
      const user = await api.createUser({ name: form.name, pin: form.pin })
      setCreated(user)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <Modal open title="Añadir perfil" subtitle="Cada perfil tiene sus propias lecturas, notas y estadísticas." onClose={onClose} footer={created
      ? <Button variant="primary" onClick={onClose}>Cerrar</Button>
      : <><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={submit}>Crear perfil</Button></>}>
      {created ? (
        <p className="text-sm leading-relaxed text-slate-300">
          Perfil <strong className="text-white">{created.name}</strong> creado. Dale su PIN: podrá cambiarlo desde su menú al entrar.
        </p>
      ) : (
        <div className="space-y-4">
          <Field label="Nombre"><input className={inputClass} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Papá" autoFocus /></Field>
          <Field label="PIN o contraseña inicial" hint="Al menos 6 caracteres; para uso por internet, mejor 8 o más.">
            <input className={inputClass} type="password" autoComplete="new-password" value={form.pin} onChange={e => set('pin', e.target.value)} />
          </Field>
          <Field label="Repite el PIN"><input className={inputClass} type="password" autoComplete="new-password" value={form.repeat} onChange={e => set('repeat', e.target.value)} /></Field>
          {error && <p className="text-xs text-amber-400">{error}</p>}
        </div>
      )}
    </Modal>
  )
}

export default function ProfileMenu({ me }) {
  const [open, setOpen] = useState(false)
  const [dialog, setDialog] = useState(null)
  if (!me) return null

  const logout = async () => {
    try { await api.logout() } finally { window.location.reload() }
  }
  const openDialog = name => { setOpen(false); setDialog(name) }

  return (
    <div className="relative mb-4">
      <button type="button" onClick={() => setOpen(o => !o)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-white/[0.04]">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/[0.06] text-xs font-semibold text-slate-200">{initials(me.name)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-slate-100">{me.name}</span>
          <span className="block text-[11px] text-slate-500">{me.isOwner ? 'Perfil principal' : 'Perfil'}</span>
        </span>
        <ChevronDown size={14} className={cx('text-slate-500 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-xl border border-white/10 bg-[#0F172A] shadow-2xl">
          <MenuItem icon={KeyRound} onClick={() => openDialog('pin')}>Cambiar PIN</MenuItem>
          {me.isOwner && <MenuItem icon={UserPlus} onClick={() => openDialog('user')}>Añadir perfil</MenuItem>}
          <MenuItem icon={LogOut} onClick={logout}>Cerrar sesión</MenuItem>
        </div>
      )}
      {dialog === 'pin' && <PinDialog onClose={() => setDialog(null)} />}
      {dialog === 'user' && <UserDialog onClose={() => setDialog(null)} />}
    </div>
  )
}