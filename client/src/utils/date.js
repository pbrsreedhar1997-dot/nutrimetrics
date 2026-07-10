// Local-calendar-day date string, e.g. "2026-07-10" — NOT UTC.
// `date.toISOString()` always returns UTC, so for anyone east of Greenwich
// (e.g. IST, UTC+5:30) the "day" would flip hours after real local midnight
// instead of at 12:00am. Every day-boundary computation must use this.
export function localDateStr(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Groups daily {date, steps} rows (as returned by /api/activity-log) into
// Mon–Sun week buckets, most recent first.
export function groupByWeek(logs) {
  const weeks = new Map()
  for (const l of logs) {
    const [y, m, d] = l.date.split('-').map(Number)
    const day = new Date(y, m - 1, d)
    const dow = (day.getDay() + 6) % 7 // Mon=0 .. Sun=6
    const monday = new Date(day); monday.setDate(day.getDate() - dow)
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
    const key = localDateStr(monday)
    if (!weeks.has(key)) weeks.set(key, { key, start: monday, end: sunday, total: 0, days: 0 })
    const w = weeks.get(key)
    w.total += l.steps || 0
    w.days += 1
  }
  return [...weeks.values()].sort((a, b) => b.key.localeCompare(a.key))
}

// Groups daily {date, steps} rows into calendar-month buckets, most recent first.
export function groupByMonth(logs) {
  const months = new Map()
  for (const l of logs) {
    const key = l.date.slice(0, 7) // YYYY-MM
    if (!months.has(key)) months.set(key, { key, total: 0, days: 0 })
    const m = months.get(key)
    m.total += l.steps || 0
    m.days += 1
  }
  return [...months.values()].sort((a, b) => b.key.localeCompare(a.key))
}

const FMT_SHORT = { day: 'numeric', month: 'short' }
export function fmtWeekRange(w) {
  const startLabel = w.start.toLocaleDateString('en', FMT_SHORT)
  const endLabel = w.end.toLocaleDateString('en', FMT_SHORT)
  return `${startLabel} – ${endLabel}`
}
export function fmtMonth(key) {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en', { month: 'long', year: 'numeric' })
}
