const READ = new Set(['READ', 'MASTERED'])

export const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const HISTOGRAM = [
  [0, 5, 'Menos de 5'],
  [5, 6, '5–6'],
  [6, 7, '6–7'],
  [7, 8, '7–8'],
  [8, 9, '8–9'],
  [9, 10.01, '9–10'],
]

export const average = list => (list.length ? list.reduce((sum, v) => sum + v, 0) / list.length : null)

function median(list) {
  if (!list.length) return null
  const sorted = [...list].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function daysBetween(start, end) {
  const [y1, m1, d1] = start.split('-').map(Number)
  const [y2, m2, d2] = end.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000) + 1
}

function eraPhrase(label) {
  return label.startsWith('Siglo') ? `el ${label.replace('Siglo', 'siglo')}` : `la ${label}`
}

export function buildStats(data) {
  const authorCountry = {}
  for (const country of data.world?.countries || []) {
    for (const entry of country.authors) authorCountry[entry.id] = country.name
  }
  const authorEra = {}
  const eraOrder = []
  for (const bucket of data.world?.timeline || []) {
    eraOrder.push(bucket.label)
    for (const entry of bucket.authors) authorEra[entry.id] = bucket.label
  }

  const readBooks = data.books.filter(book => READ.has(book.state))

  const finished = []
  for (const book of data.books) {
    const done = (book.readings || []).filter(r => r.status === 'done')
    if (done.length) {
      for (const reading of done) {
        finished.push({
          book,
          reading,
          date: reading.finished || null,
          year: reading.finished ? reading.finished.slice(0, 4) : book.year ? String(book.year) : null,
        })
      }
    } else if (READ.has(book.state)) {
      finished.push({ book, reading: null, date: null, year: book.year ? String(book.year) : null })
    }
  }

  const durations = finished
    .filter(f => f.reading?.started?.length === 10 && f.date?.length === 10)
    .map(f => ({ ...f, days: daysBetween(f.reading.started, f.date) }))
    .filter(f => f.days > 0)
    .sort((a, b) => a.days - b.days)

  const rated = readBooks.filter(book => typeof book.rating === 'number')
  const histogram = HISTOGRAM.map(([low, high, label]) => ({
    key: label,
    count: rated.filter(book => book.rating >= low && book.rating < high).length,
  }))

  const group = keyFn => {
    const map = new Map()
    for (const book of readBooks) {
      const key = keyFn(book)
      if (!key) continue
      const entry = map.get(key) || { key, count: 0, ratings: [] }
      entry.count += 1
      if (typeof book.rating === 'number') entry.ratings.push(book.rating)
      map.set(key, entry)
    }
    return [...map.values()].map(entry => ({ ...entry, avg: average(entry.ratings) }))
  }

  const byCountry = group(book => authorCountry[book.author]).sort((a, b) => b.count - a.count)
  const eraGroups = new Map(group(book => authorEra[book.author]).map(entry => [entry.key, entry]))
  const byEra = eraOrder.filter(label => eraGroups.has(label)).map(label => eraGroups.get(label))
  const byAuthor = group(book => book.author)
    .map(entry => ({ ...entry, author: data.authors[entry.key] }))
    .filter(entry => entry.author)
    .sort((a, b) => b.count - a.count || (b.avg ?? 0) - (a.avg ?? 0))
  const byRegion = data.regions
    .map(region => {
      const books = rated.filter(book => book.regions.includes(region.id))
      return { key: region.name, id: region.id, count: books.length, avg: average(books.map(book => book.rating)) }
    })
    .filter(entry => entry.count >= 2)
    .sort((a, b) => b.avg - a.avg)

  const years = [...new Set(finished.map(f => f.year).filter(Boolean))].sort((a, b) => b.localeCompare(a))
  const calendar = [...years].reverse().map(year => {
    const months = Array(12).fill(0)
    let undated = 0
    for (const f of finished) {
      if (f.year !== year) continue
      if (f.date && f.date.length >= 7) months[Number(f.date.slice(5, 7)) - 1] += 1
      else undated += 1
    }
    return { year, months, undated }
  })

  const monthsWithReading = new Set(finished.filter(f => f.date?.length >= 7).map(f => f.date.slice(0, 7)))
  const now = new Date()
  let y = now.getFullYear()
  let m = now.getMonth() + 1
  const monthKey = () => `${y}-${String(m).padStart(2, '0')}`
  const previous = () => {
    m -= 1
    if (m === 0) { m = 12; y -= 1 }
  }
  if (!monthsWithReading.has(monthKey())) previous()
  let streak = 0
  while (monthsWithReading.has(monthKey())) {
    streak += 1
    previous()
  }

  const currentYear = String(now.getFullYear())
  const thisYear = finished.filter(f => f.year === currentYear).length
  const avgRating = average(rated.map(book => book.rating))
  const avgDays = average(durations.map(d => d.days))
  const rereads = finished.filter(f => f.reading?.reread).length

  const insights = []
  const total = readBooks.length
  if (byCountry[0] && total) {
    const pct = Math.round((byCountry[0].count / total) * 100)
    insights.push(`Tu literatura más leída es la de ${byCountry[0].key}: ${pct}% de las obras que has leído.`)
    if (pct > 50) insights.push('Más de la mitad de tus lecturas vienen de una sola tradición: el mapa tiene muchas literaturas esperándote.')
  }
  if (byCountry.length) insights.push(`Has leído autores de ${byCountry.length} ${byCountry.length === 1 ? 'país' : 'países'}.`)
  const topEra = [...byEra].sort((a, b) => b.count - a.count)[0]
  if (topEra) insights.push(`Tu época más visitada es ${eraPhrase(topEra.key)}.`)
  if (byRegion[0]) {
    insights.push(`Donde mejor puntúas es ${byRegion[0].key}: ${byRegion[0].avg.toFixed(1)} de media en ${byRegion[0].count} lecturas.`)
    const last = byRegion[byRegion.length - 1]
    if (byRegion.length > 1 && last.avg < byRegion[0].avg - 1) insights.push(`Y donde menos: ${last.key} (${last.avg.toFixed(1)}).`)
  }
  if (rereads) insights.push(`Has releído ${rereads} ${rereads === 1 ? 'libro' : 'libros'}.`)
  insights.push(avgDays
    ? `Tardas de media ${Math.round(avgDays)} días en terminar un libro.`
    : 'Cuando registres fechas de inicio y fin, aquí verás tu ritmo de lectura.')

  return {
    finished,
    durations,
    readBooks,
    rated,
    histogram,
    byCountry,
    byEra,
    byAuthor,
    byRegion,
    years,
    calendar,
    streak,
    thisYear,
    perMonth: thisYear / (now.getMonth() + 1),
    authorCountry,
    avgRating,
    avgDays,
    medianDays: median(durations.map(d => d.days)),
    rereads,
    undated: finished.filter(f => !f.year).length,
    insights,
  }
}

export function yearReview(stats, year) {
  const items = stats.finished
    .filter(f => f.year === year)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))

  const earliest = keyFn => {
    const map = {}
    for (const f of stats.finished) {
      if (!f.year) continue
      for (const key of [].concat(keyFn(f) || [])) {
        if (!map[key] || f.year < map[key]) map[key] = f.year
      }
    }
    return map
  }
  const authorFirst = earliest(f => f.book.author)
  const countryFirst = earliest(f => stats.authorCountry[f.book.author])
  const regionFirst = earliest(f => f.book.regions)

  const rated = items.filter(f => typeof f.book.rating === 'number').sort((a, b) => b.book.rating - a.book.rating)
  const best = [...new Map(rated.map(f => [f.book.id, f])).values()].slice(0, 3)

  const months = Array(12).fill(0)
  let undated = 0
  for (const f of items) {
    if (f.date && f.date.length >= 7) months[Number(f.date.slice(5, 7)) - 1] += 1
    else undated += 1
  }
  const durations = stats.durations.filter(d => d.year === year)

  return {
    year,
    items,
    newAuthors: Object.keys(authorFirst).filter(id => authorFirst[id] === year),
    newCountries: Object.keys(countryFirst).filter(key => countryFirst[key] === year),
    newRegions: Object.keys(regionFirst).filter(id => regionFirst[id] === year),
    best,
    avgRating: average(rated.map(f => f.book.rating)),
    months,
    undated,
    rereads: items.filter(f => f.reading?.reread).length,
    avgDays: average(durations.map(d => d.days)),
  }
}