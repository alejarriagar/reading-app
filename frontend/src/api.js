async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (response.status === 401 && !path.startsWith('/auth')) {
    window.location.reload()
    throw new Error('La sesión ha caducado')
  }
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
  undo: () => request('/undo', { method: 'POST' }),
  history: () => request('/history'),
  dismissRecommendation: bookId => request(`/recommendations/${id(bookId)}/dismiss`, { method: 'POST' }),
  reread: bookId => request(`/books/${id(bookId)}/reread`, { method: 'POST' }),
  createPath: body => request('/paths/custom', json('POST', body)),
  updatePath: (pathId, body) => request(`/paths/custom/${id(pathId)}`, json('PUT', body)),
  deletePath: pathId => request(`/paths/custom/${id(pathId)}`, { method: 'DELETE' }),
  duplicatePath: pathId => request(`/paths/${id(pathId)}/duplicate`, { method: 'POST' }),
  authStatus: () => request('/auth/status'),
  setup: body => request('/auth/setup', json('POST', body)),
  login: body => request('/auth/login', json('POST', body)),
  logout: () => request('/auth/logout', { method: 'POST' }),
  changePin: body => request('/auth/pin', json('POST', body)),
  createUser: body => request('/auth/users', json('POST', body)),
  library: () => request('/library'),
  addCopy: body => request('/library/copies', json('POST', body)),
  updateCopy: (copyId, body) => request(`/library/copies/${id(copyId)}`, json('PUT', body)),
  deleteCopy: copyId => request(`/library/copies/${id(copyId)}`, { method: 'DELETE' }),
  arrived: copyId => request(`/library/copies/${id(copyId)}/arrived`, { method: 'POST' }),
  addHouse: body => request('/library/houses', json('POST', body)),
  renameHouse: (houseId, body) => request(`/library/houses/${id(houseId)}`, json('PUT', body)),
  deleteHouse: houseId => request(`/library/houses/${id(houseId)}`, { method: 'DELETE' }),
  isbn: value => request(`/isbn/${id(value)}`),
  importPreview: body => request('/library/import/preview', json('POST', body)),
  importRows: body => request('/library/import', json('POST', body)),
  wishlist: () => request('/wishlist'),
  addWish: body => request('/wishlist', json('POST', body)),
  updateWish: (wishId, body) => request(`/wishlist/${id(wishId)}`, json('PUT', body)),
  deleteWish: wishId => request(`/wishlist/${id(wishId)}`, { method: 'DELETE' }),
  reserveWish: (wishId, reserved) => request(`/wishlist/${id(wishId)}/reserve`, json('POST', { reserved })),
  acquireWish: (wishId, body) => request(`/wishlist/${id(wishId)}/acquire`, json('POST', body)),
  catalogDetail: (kind, resourceId) => request(`/catalog/${kind}/${id(resourceId)}`),
  updateCatalog: (kind, resourceId, body) => request(`/catalog/${kind}/${id(resourceId)}`, json('PUT', body)),
  resetCatalog: (kind, resourceId, body) => request(`/catalog/${kind}/${id(resourceId)}/reset`, json('POST', body)),
  catalogReview: () => request('/catalog/review'),
}