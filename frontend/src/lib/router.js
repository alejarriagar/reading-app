import { useCallback, useEffect, useState } from 'react'

export const PAGE_SLUGS = {
  overview: 'resumen',
  world: 'mundo',
  map: 'territorios',
  paths: 'caminos',
  library: 'biblioteca',
  stats: 'adn',
  shelves: 'estanterias',
}
const SLUG_PAGES = Object.fromEntries(Object.entries(PAGE_SLUGS).map(([page, slug]) => [slug, page]))

export function parseHash(hash = window.location.hash) {
  const raw = hash.replace(/^#\/?/, '')
  const [pathPart, queryPart = ''] = raw.split('?')
  const segments = pathPart.split('/').filter(Boolean).map(segment => {
    try { return decodeURIComponent(segment) } catch { return segment }
  })
  const params = new URLSearchParams(queryPart)
  return {
    page: SLUG_PAGES[segments[0]] || 'overview',
    sub: segments[1] || null,
    author: params.get('autor'),
    book: params.get('obra'),
  }
}

export function buildHash({ page, sub, author, book }) {
  let hash = `#/${PAGE_SLUGS[page] || 'resumen'}`
  if (sub) hash += `/${encodeURIComponent(sub)}`
  const params = new URLSearchParams()
  if (author) params.set('autor', author)
  if (book) params.set('obra', book)
  const query = params.toString()
  return query ? `${hash}?${query}` : hash
}

export function useHashRoute() {
  const [route, setRoute] = useState(() => parseHash())

  useEffect(() => {
    const onChange = () => setRoute(parseHash())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const navigate = useCallback((patch, { replace = false } = {}) => {
    const hash = buildHash({ ...parseHash(), ...patch })
    if (hash === window.location.hash) return
    if (replace) {
      window.history.replaceState(null, '', hash)
      setRoute(parseHash(hash))
    } else {
      window.location.hash = hash
    }
  }, [])

  return [route, navigate]
}