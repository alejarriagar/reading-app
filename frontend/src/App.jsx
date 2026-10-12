import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, BookMarked, LayoutDashboard, Library, Loader2, Map as MapIcon, Route } from 'lucide-react'
import { api } from './api'
import Overview from './pages/Overview'
import MapPage from './pages/MapPage'
import PathsPage from './pages/PathsPage'
import LibraryPage from './pages/LibraryPage'
import AuthorDrawer from './components/AuthorDrawer'
import BookModal from './components/BookModal'
import { CompassModal, DiscoveryModal } from './components/DiscoveryModal'
import { detectDiscovery } from './lib/discovery'
import { ProgressBar, Toast, cx } from './components/ui'

const NAV = [
  { id: 'overview', label: 'Resumen', icon: LayoutDashboard },
  { id: 'map', label: 'Mapa', icon: MapIcon },
  { id: 'paths', label: 'Caminos', icon: Route },
  { id: 'library', label: 'Biblioteca', icon: Library },
]

const PAGES = { overview: Overview, map: MapPage, paths: PathsPage, library: LibraryPage }

export default function App() {
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [page, setPage] = useState('overview')
  const [toast, setToast] = useState(null)
  const [authorId, setAuthorId] = useState(null)
  const [bookId, setBookId] = useState(null)
  const [discovery, setDiscovery] = useState(null)
  const [compassAnchor, setCompassAnchor] = useState(null)
  const [focusRegionId, setFocusRegionId] = useState(null)
  const dataRef = useRef(null)

  useEffect(() => {
    api.state()
      .then(next => { dataRef.current = next; setData(next) })
      .catch(error => setLoadError(error.message))
  }, [])

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(timer)
  }, [toast])

  const run = useCallback(async (action, message) => {
    const before = dataRef.current
    try {
      const next = await action()
      dataRef.current = next
      setData(next)
      const found = before ? detectDiscovery(before, next) : null
      if (found) setDiscovery(found)
      else if (message) setToast({ kind: 'success', message })
      return true
    } catch (error) {
      setToast({ kind: 'error', message: error.message })
      return false
    }
  }, [])

  const closeAuthor = useCallback(() => setAuthorId(null), [])
  const closeBook = useCallback(() => setBookId(null), [])
  const closeDiscovery = useCallback(() => setDiscovery(null), [])
  const closeCompass = useCallback(() => setCompassAnchor(null), [])
  const clearFocus = useCallback(() => setFocusRegionId(null), [])

  const exploreAuthor = useCallback(id => {
    setDiscovery(null)
    setCompassAnchor(null)
    setAuthorId(id)
  }, [])

  const exploreRegion = useCallback(id => {
    setDiscovery(null)
    setCompassAnchor(null)
    setAuthorId(null)
    setFocusRegionId(id)
    setPage('map')
  }, [])

  if (loadError) {
    return (
      <div className="grid h-full place-items-center p-8">
        <div className="max-w-md text-center">
          <AlertTriangle className="mx-auto mb-3 text-amber-400" />
          <h1 className="text-lg font-semibold text-white">No se pudo conectar con el backend</h1>
          <p className="mt-2 text-sm text-slate-400">{loadError}</p>
          <p className="mt-4 text-xs text-slate-500">Arranca la aplicación con start.ps1.</p>
        </div>
      </div>
    )
  }

  if (!data) {
    return <div className="grid h-full place-items-center text-slate-400"><Loader2 className="animate-spin" /></div>
  }

  const Page = PAGES[page]
  const book = bookId ? data.books.find(item => item.id === bookId) : null
  const ctx = {
    data,
    run,
    go: setPage,
    openAuthor: setAuthorId,
    editBook: setBookId,
    openCompass: setCompassAnchor,
    focusRegionId,
    clearFocus,
  }
  const { summary } = data

  return (
    <div className="flex h-full">
      <aside className="flex w-64 shrink-0 flex-col border-r border-white/5 bg-[#0A111F]/90 px-4 py-6">
        <div className="mb-8 flex items-center gap-3 px-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl text-white shadow-lg shadow-blue-600/30" style={{ background: 'linear-gradient(135deg,#2563EB,#0EA5E9)' }}>
            <BookMarked size={18} />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-wide text-white">Atlas</div>
            <div className="text-[11px] text-slate-500">Exploración literaria</div>
          </div>
        </div>

        <nav className="space-y-1">
          {NAV.map(item => {
            const Icon = item.icon
            const active = page === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setPage(item.id)}
                className={cx(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition',
                  active ? 'bg-white/[0.07] text-white' : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200',
                )}
              >
                <Icon size={16} className={active ? 'text-sky-400' : ''} />
                {item.label}
                {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-sky-400" />}
              </button>
            )
          })}
        </nav>

        <div className="mt-auto rounded-xl border border-white/5 bg-white/[0.02] p-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Tu atlas</div>
          <div className="mt-2 text-2xl font-semibold text-white tabular-nums">
            {summary.regionsUnlocked}<span className="text-sm font-normal text-slate-500"> / {summary.regionsTotal}</span>
          </div>
          <div className="text-xs text-slate-400">territorios desbloqueados</div>
          <ProgressBar value={summary.regionsUnlocked / Math.max(1, summary.regionsTotal)} className="mt-3" />
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">Sin rutas obligatorias: tú decides hacia dónde explorar.</p>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div key={page} className="fade-in mx-auto max-w-7xl px-10 py-10">
          <Page {...ctx} />
        </div>
      </main>

      {authorId && <AuthorDrawer authorId={authorId} {...ctx} onClose={closeAuthor} />}
      {book && <BookModal key={book.id} book={book} run={run} onClose={closeBook} />}
      {discovery && <DiscoveryModal discovery={discovery} data={data} onClose={closeDiscovery} onAuthor={exploreAuthor} onRegion={exploreRegion} />}
      {compassAnchor && <CompassModal anchor={compassAnchor} data={data} onClose={closeCompass} onAuthor={exploreAuthor} onRegion={exploreRegion} />}
      {toast && <Toast {...toast} />}
    </div>
  )
}