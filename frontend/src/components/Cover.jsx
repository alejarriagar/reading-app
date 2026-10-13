import { useState } from 'react'
import { BookOpen } from 'lucide-react'
import { cx } from './ui'

const SIZES = {
  xs: 'h-8 w-6 rounded',
  sm: 'h-12 w-9 rounded-md',
  md: 'h-24 w-16 rounded-lg',
  lg: 'h-36 w-24 rounded-lg',
}

export default function Cover({ src, size = 'sm', className = '' }) {
  const [failed, setFailed] = useState(false)
  const box = cx('relative shrink-0 overflow-hidden border border-white/10 bg-white/[0.03]', SIZES[size], className)
  if (src && !failed) {
    return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className={cx(box, 'object-cover')} />
  }
  return (
    <div className={cx(box, 'grid place-items-center')} style={{ background: 'linear-gradient(160deg,#1E293B,#0F172A)' }} aria-hidden="true">
      <BookOpen size={size === 'xs' ? 10 : 14} className="text-slate-600" />
    </div>
  )
}