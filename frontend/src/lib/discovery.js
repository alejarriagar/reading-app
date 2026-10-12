export const isRead = state => state === 'READ' || state === 'MASTERED'

const TIER_ORDER = { ESSENTIAL: 0, RECOMMENDED: 1, SPECIALIZED: 2 }
const TIER_LABEL = { ESSENTIAL: 'esencial', RECOMMENDED: 'recomendado', SPECIALIZED: 'especializado' }
const COUNTRY_TYPE = /pa[ií]s|regi[oó]n|tradici/i
const PERIOD_ONLY = /^periodo$/i
const IDEA_TYPE = /movimiento|tema|g[eé]nero/i

const prefix = region => region.name.trim().split(/\s+/)[0]

function pickPrimary(regions) {
  if (!regions.length) return null
  return [...regions].sort((a, b) =>
    Number(COUNTRY_TYPE.test(b.type)) - Number(COUNTRY_TYPE.test(a.type)) || b.total - a.total)[0]
}

export function isIdeaRegion(region) {
  return IDEA_TYPE.test(region.type || '')
}

export function detectDiscovery(before, after) {
  const oldBooks = new Map(before.books.map(b => [b.id, b]))
  const book = after.books.find(b => b.state === 'READ' && oldBooks.get(b.id)?.state !== 'READ')
  if (!book) return null

  const oldRegions = new Map(before.regions.map(r => [r.id, r]))
  const wasLocked = region => (oldRegions.get(region.id)?.state ?? 'LOCKED') === 'LOCKED'

  const newlyUnlocked = after.regions.filter(r => r.state !== 'LOCKED' && wasLocked(r))
  const touched = after.regions.filter(r => book.regions.includes(r.id))
  const primary = pickPrimary(touched.filter(wasLocked)) || pickPrimary(touched)
  const previousAuthor = before.authors[book.author]

  return {
    book,
    author: after.authors[book.author],
    firstOfAuthor: !previousAuthor || !isRead(previousAuthor.state),
    newlyUnlocked,
    touched,
    primary,
    before: primary ? oldRegions.get(primary.id) || null : null,
  }
}

function authorItem(data, id, extra = {}) {
  const author = data.authors[id]
  return author ? { kind: 'author', id, title: author.name, state: author.state, ...extra } : null
}

function regionItem(region) {
  return {
    kind: 'region',
    id: region.id,
    title: region.name,
    state: region.state,
    subtitle: region.state === 'LOCKED'
      ? `Bloqueado · ${region.total} autores por descubrir`
      : `${Math.round(region.rate * 100)}% explorado · ${region.read}/${region.total} autores`,
  }
}

export function buildCompass(data, anchor = {}) {
  const regionsById = new Map(data.regions.map(r => [r.id, r]))
  const region = anchor.regionId ? regionsById.get(anchor.regionId) || null : null
  const author = anchor.authorId ? data.authors[anchor.authorId] || null : null
  const frontiers = new Set(region?.frontiers || [])
  const byInterest = (a, b) =>
    Number(frontiers.has(b.id)) - Number(frontiers.has(a.id)) || a.rate - b.rate || b.total - a.total

  const deepen = region
    ? region.authors
      .filter(entry => !isRead(entry.state))
      .sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier])
      .slice(0, 5)
      .map(entry => authorItem(data, entry.id, {
        tier: entry.tier,
        subtitle: `Considerado ${TIER_LABEL[entry.tier]} en este territorio · ¿Quieres explorarlo?`,
      }))
      .filter(Boolean)
    : []

  const other = data.regions
    .filter(r => r.id !== region?.id && COUNTRY_TYPE.test(r.type) && (!region || prefix(r) !== prefix(region)))
    .sort(byInterest)
    .slice(0, 4)
    .map(regionItem)

  const ideaRegions = [...new Set([...(author?.regions || []), ...(region?.frontiers || [])])]
    .map(id => regionsById.get(id))
    .filter(r => r && r.id !== region?.id && isIdeaRegion(r))
  const related = (author?.related || [])
    .map(id => authorItem(data, id, { subtitle: `Conectado con ${author.name}` }))
    .filter(Boolean)
  const influence = [...related, ...ideaRegions.map(regionItem)].slice(0, 5)

  const samePrefix = region ? data.regions.filter(r => r.id !== region.id && prefix(r) === prefix(region)) : []
  const periods = data.regions.filter(r => PERIOD_ONLY.test(r.type) && r.id !== region?.id && !samePrefix.includes(r))
  const period = [...samePrefix, ...periods].slice(0, 4).map(regionItem)

  return { region, deepen, other, influence, period }
}

export function surprise(data, excludeId = null) {
  const seen = new Set()
  const candidates = []
  data.regions.filter(r => r.state === 'LOCKED').forEach(region => region.authors.forEach(entry => {
    if (entry.tier === 'ESSENTIAL' && entry.state === 'LOCKED' && !seen.has(entry.id)) {
      seen.add(entry.id)
      candidates.push({ id: entry.id, region, tier: 'ESSENTIAL' })
    }
  }))

  let pool = candidates.filter(c => c.id !== excludeId)
  if (!pool.length) {
    pool = Object.values(data.authors)
      .filter(a => a.state === 'LOCKED' && a.id !== excludeId)
      .map(a => ({ id: a.id, region: null, tier: null }))
  }
  if (!pool.length) return null

  const choice = pool[Math.floor(Math.random() * pool.length)]
  const firstBook = data.books.find(b => b.author === choice.id)
  return authorItem(data, choice.id, {
    tier: choice.tier,
    subtitle: [
      choice.region ? `Esencial en ${choice.region.name}` : 'Territorio sin explorar',
      firstBook ? `puerta de entrada: «${firstBook.title}»` : null,
    ].filter(Boolean).join(' · '),
  })
}