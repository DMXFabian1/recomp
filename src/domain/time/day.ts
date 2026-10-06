/**
 * Aritmética de días 'YYYY-MM-DD' sin zona horaria: cada día se trata como fecha de calendario
 * (se interpreta en UTC solo para calcular). Puro; sin Date.now().
 */
import type { DayString } from '@domain/entities'

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isValidDay(s: string): boolean {
  const m = DAY_RE.exec(s)
  if (!m) return false
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false
  const dt = new Date(Date.UTC(y, mo - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
}

export function dayToUtc(day: DayString): Date {
  const m = DAY_RE.exec(day)
  if (!m || !isValidDay(day)) throw new RangeError(`Día inválido: ${day}`)
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
}

export function utcToDay(d: Date): DayString {
  return d.toISOString().slice(0, 10)
}

export function addDays(day: DayString, n: number): DayString {
  const d = dayToUtc(day)
  d.setUTCDate(d.getUTCDate() + n)
  return utcToDay(d)
}

/** b − a en días enteros. */
export function diffDays(a: DayString, b: DayString): number {
  return Math.round((dayToUtc(b).getTime() - dayToUtc(a).getTime()) / 86_400_000)
}

/** 0 = domingo … 6 = sábado. */
export function weekdayOf(day: DayString): number {
  return dayToUtc(day).getUTCDay()
}

/** Día local 'YYYY-MM-DD' de un Date, en la zona del dispositivo. Úsalo en app/, no en domain. */
export function localDay(d: Date): DayString {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}
