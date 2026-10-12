async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!response.ok) {
    let detail = `Error ${response.status}`
    try {
      const body = await response.json()
      if (typeof body.detail === 'string') detail = body.detail
    } catch {
      // respuesta sin JSON
    }
    throw new Error(detail)
  }
  return response.json()
}

const json = (method, body) => ({ method, body: JSON.stringify(body) })
const id = value => encodeURIComponent(value)

export const api = {
  state: () => request('/state'),
  updateBook: (bookId, body) => request(`/books/${id(bookId)}`, json('PATCH', body)),
  addBook: body => request('/books', json('POST', body)),
  setTier: body => request('/tiers', json('PUT', body)),
  toggleMastery: regionId => request(`/regions/${id(regionId)}/mastery`, { method: 'POST' }),
  discoverRegion: regionId => request(`/regions/${id(regionId)}/discover`, { method: 'POST' }),
  setPathWork: (pathId, body) => request(`/paths/${id(pathId)}/works`, json('POST', body)),
}