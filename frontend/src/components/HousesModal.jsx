import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { api } from '../api'
import { Button, Modal, cx, inputClass } from './ui'

export default function HousesModal({ lib, onClose, onSaved }) {
  const [names, setNames] = useState(() => Object.fromEntries(lib.houses.map(h => [h.id, h.name])))
  const [newName, setNewName] = useState('')
  const [error, setError] = useState('')
  const counts = {}
  lib.copies.forEach(c => { counts[c.houseId] = (counts[c.houseId] || 0) + 1 })

  const call = async (promise, message) => {
    try {
      const next = await promise
      setError('')
      onSaved(next, message)
      setNames(Object.fromEntries(next.houses.map(h => [h.id, h.name])))
      return true
    } catch (err) {
      setError(err.message)
      return false
    }
  }

  const rename = house => {
    const value = (names[house.id] || '').trim()
    if (value && value !== house.name) call(api.renameHouse(house.id, { name: value }), 'Casa renombrada')
  }

  const add = async () => {
    if (!newName.trim()) return
    if (await call(api.addHouse({ name: newName.trim() }), 'Casa añadida')) setNewName('')
  }

  const remove = house => {
    if (window.confirm(`¿Eliminar la casa «${house.name}»?`)) call(api.deleteHouse(house.id), 'Casa eliminada')
  }

  return (
    <Modal open title="Casas" subtitle="Dónde están vuestros libros." onClose={onClose} footer={<Button variant="primary" onClick={onClose}>Hecho</Button>}>
      <div className="space-y-2">
        {lib.houses.map(house => (
          <div key={house.id} className="flex items-center gap-2">
            <input
              className={inputClass}
              value={names[house.id] ?? ''}
              onChange={e => setNames(current => ({ ...current, [house.id]: e.target.value }))}
              onBlur={() => rename(house)}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
            />
            <span className="w-20 shrink-0 text-right text-xs tabular-nums text-slate-500">{counts[house.id] || 0} libros</span>
            <button
              type="button"
              aria-label={`Eliminar ${house.name}`}
              disabled={(counts[house.id] || 0) > 0 || lib.houses.length <= 1}
              onClick={() => remove(house)}
              className={cx('rounded-md p-2 text-slate-500 transition hover:bg-white/5 hover:text-rose-300 disabled:opacity-30')}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <input className={inputClass} value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add() }} placeholder="Nueva casa (por ejemplo, casa de verano)" />
        <Button onClick={add}><Plus size={14} />Añadir</Button>
      </div>
      <p className="mt-3 text-[11px] text-slate-500">Solo se pueden eliminar casas sin libros.</p>
      {error && <p className="mt-3 text-xs text-amber-400">{error}</p>}
    </Modal>
  )
}