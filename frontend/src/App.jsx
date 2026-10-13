import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, BookMarked, Fingerprint, Globe, LayoutDashboard, Library, Loader2, Map as MapIcon, Route, Search } from 'lucide-react'
import { api } from './api'
import Overview from './pages/Overview'
import WorldPage from './pages/WorldPage'
import StatsPage from './pages/StatsPage'
import MapPage from './pages/MapPage'
import PathsPage from './pages/PathsPage'
import LibraryPage from './pages/LibraryPage'
import AuthorDrawer from './components/AuthorDrawer'
import BookModal from './components/BookModal'
import CommandPalette from './components/CommandPalette'
import { CompassModal, DiscoveryModal } from './components/DiscoveryModal'
import { detectDiscovery } from './lib/discovery'
import { useHashRoute } from './lib/router'
import { ProgressBar, Toast, cx } from './components/ui'

const NAV = [
  { id: 'overview', label: 'Resumen', icon: LayoutDashboard },
  { id: 'world', label: 'Mundo', icon: Globe },
  { id: 'map', label: 'Territorios', icon: MapIcon },
  { id: 'paths', label: 'Caminos', icon: Route },
  { id: 'library', label: 'Biblioteca', icon: Library },
  { id: 'stats', label: 'ADN lector', icon: Fingerprint },
]

const PAGES = { overview: Overview, world: WorldPage, map: MapPage, paths: PathsPage, library: LibraryPage, stats: StatsPage }

const isTyping = target =>
  target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)

export default function App() {
  const [route, navigate] = useHashRoute()
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [toast, setToast] = useState(null)
  const [discovery, setDiscovery] = useState(null)
  const [compassAnchor, setCompassAnchor] = useState(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const dataRef = useRef(null)
  const depth = useRef(0)

  const page = PAGES[route.page] ? route.page : 'overview'

  useEffect(() => {
    api.state()
      .then(next => { dataRef.current = next; setData(next) })
      .catch(error => setLoadError(error.message))
  }, [])

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(null), toast.action ? 6000 : 2600)
    return () => clearTimeout(timer)
  }, [toast])

  // Cuando no hay nada abierto, el historial interno vuelve a cero.
  useEffect(() => {
    if (!route.author && !route.book && !(route.page === 'map' && route.sub)) depth.current = 0
  }, [route])

  useEffect(() => {
    const item = NAV.find(n => n.id === page)
    document.title = `${item ? item.label : 'Atlas'} · Atlas literario`
  }, [page])

  useEffect(() => {
    const onKey = event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(open => !open)
      } else if (event.key === '/' && !isTyping(event.target)) {
        event.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const undoRef = useRef(null)
  const undo = useCallback(async () => {
    setToast(null)
    setDiscovery(null)
    try {
      const next = await api.undo()
      dataRef.current = next
      setData(next)
      setToast({ kind: 'success', message: `Deshecho: ${next.undone}` })
    } catch (error) {
      setToast({ kind: 'error', message: error.message })
    }
  }, [])
  undoRef.current = undo

  const run = useCallback(async (action, message) => {
    const before = dataRef.current
    try {
      const next = await action()
      dataRef.current = next
      setData(next)
      const found = before ? detectDiscovery(before, next) : null
      if (found) setDiscovery(found)
      else if (message) setToast({ kind: 'success', message, action: { label: 'Deshacer', onClick: () => undoRef.current() } })
      return true
    } catch (error) {
      setToast({ kind: 'error', message: error.message })
      return false
    }
  }, [])

  // Las fichas y paneles se apilan en el historial: "atrás" los cierra en orden.
  const openOverlay = useCallback(patch => {
    depth.current += 1
    navigate(patch)
  }, [navigate])

  const closeOverlay = useCallback(patch => {
    if (depth.current > 0) {
      depth.current -= 1
      window.history.back()
    } else {
      navigate(patch, { replace: true })
    }
  }, [navigate])

  const goPage = useCallback(id => navigate({ page: id, sub: null, author: null, book: null }), [navigate])
  const openAuthor = useCallback(id => openOverlay({ author: id, book: null }), [openOverlay])
  const closeAuthor = useCallback(() => closeOverlay({ author: null, book: null }), [closeOverlay])
  const editBook = useCallback(id => openOverlay({ book: id }), [openOverlay])
  const closeBook = useCallback(() => closeOverlay({ book: null }), [closeOverlay])
  const openRegion = useCallback(id => openOverlay({ page: 'map', sub: id }), [openOverlay])
  const closeRegion = useCallback(() => closeOverlay({ sub: null }), [closeOverlay])
  const setSub = useCallback((sub, options) => navigate({ sub }, options), [navigate])
  const closeDiscovery = useCallback(() => setDiscovery(null), [])
  const closeCompass = useCallback(() => setCompassAnchor(null), [])
  const closePalette = useCallback(() => setPaletteOpen(false), [])

  const exploreAuthor = useCallback(id => {
    setDiscovery(null)
    setCompassAnchor(null)
    openAuthor(id)
  }, [openAuthor])

  const exploreRegion = useCallback(id => {
    setDiscovery(null)
    setCompassAnchor(null)
    depth.current = 1
    navigate({ page: 'map', sub: id, author: null, book: null })
  }, [navigate])

  const handleCommand = useCallback(entry => {
    setPaletteOpen(false)
    if (entry.type === 'page') goPage(entry.id)
    else if (entry.type === 'author') openAuthor(entry.id)
    else if (entry.type === 'book') editBook(entry.id)
    else if (entry.type === 'region') exploreRegion(entry.id)
    else if (entry.type === 'path') navigate({ page: 'paths', sub: entry.id, author: null, book: null })
    else if (entry.id === 'compass') setCompassAnchor({ regionId: null })
    else if (entry.id === 'add-book') navigate({ page: 'library', sub: 'nueva', author: null, book: null })
  }, [goPage, openAuthor, editBook, exploreRegion, navigate])

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
  const book = route.book ? data.books.find(item => item.id === route.book) : null
  const ctx = {
    data,
    run,
    go: goPage,
    openAuthor,
    editBook,
    openCompass: setCompassAnchor,
    routeSub: route.sub,
    setSub,
    openRegion,
    closeRegion,
  }
  const { summary } = data

  return (
    <div className="flex h-full">
      <aside className="flex w-64 shrink-0 flex-col border-r border-white/5 bg-[#0A111F]/90 px-4 py-6">
        <div className="mb-6 flex items-center gap-3 px-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl text-white shadow-lg shadow-blue-600/30" style={{ background: 'linear-gradient(135deg,#2563EB,#0EA5E9)' }}>
            <BookMarked size={18} />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-wide text-white">Atlas</div>
            <div className="text-[11px] text-slate-500">Exploración literaria</div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="mb-6 flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-400 transition hover:border-white/20 hover:text-slate-200"
        >
          <Search size={14} />Buscar…
          <kbd className="ml-auto rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-slate-400">Ctrl K</kbd>
        </button>

        <nav className="space-y-1">
          {NAV.map(item => {
            const Icon = item.icon
            const active = page === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => goPage(item.id)}
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
          <a href="/api/export" download className="mt-3 inline-flex text-[11px] text-slate-400 transition hover:text-sky-300">Exportar mis datos (JSON)</a>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div key={page} className="fade-in mx-auto max-w-7xl px-10 py-10">
          <Page {...ctx} />
        </div>
      </main>

      {route.author && <AuthorDrawer authorId={route.author} {...ctx} onClose={closeAuthor} />}
      {book && <BookModal key={book.id} book={book} run={run} onClose={closeBook} />}
      {discovery && <DiscoveryModal discovery={discovery} data={data} onClose={closeDiscovery} onAuthor={exploreAuthor} onRegion={exploreRegion} onUndo={undo} />}
      {compassAnchor && <CompassModal anchor={compassAnchor} data={data} onClose={closeCompass} onAuthor={exploreAuthor} onRegion={exploreRegion} />}
      <CommandPalette open={paletteOpen} data={data} onClose={closePalette} onSelect={handleCommand} />
      {toast && <Toast {...toast} />}
    </div>
  )
}