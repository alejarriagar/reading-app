export const FORMAT_LABELS = {
  HARDCOVER: 'Tapa dura',
  PAPERBACK: 'Tapa blanda',
  POCKET: 'Bolsillo',
  EBOOK: 'Libro electrónico',
  AUDIO: 'Audiolibro',
  OTHER: 'Otro',
}

export const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

export const initials = name => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()