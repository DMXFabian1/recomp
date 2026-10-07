/**
 * Peso — Fase 8.8. Puro y descriptivo. Nunca interpola ni rellena días.
 *  - weightSeries: registros reales con peso, ordenados por fecha.
 *  - average7(series, endDate): media de los registros de los 7 días naturales que terminan en endDate;
 *    requiere ≥ MIN_POINTS_FOR_AVG registros reales en esa ventana; si no, null ("sin datos suficientes").
 *  - previousAverage7: la ventana anterior (endDate − 7).
 *  - trendPerWeek: pendiente de regresión lineal (kg/semana) sobre los puntos del periodo; ≥ 4 puntos y ≥ 7 días de
 *    separación entre el primero y el último; si no, null. Es una descripción matemática, no un juicio.
 */
import type { DailyCheckIn, DayString } from '@domain/entities'
import { addDays, diffDays } from '@domain/time/day'

export const MIN_POINTS_FOR_AVG = 4

export interface WeightPoint { date: DayString; kg: number }

export function weightSeries(checkIns: DailyCheckIn[]): WeightPoint[] {
  return checkIns
    .filter(c => !c.deleted_at && typeof c.weight_kg === 'number')
    .map(c => ({ date: c.date, kg: c.weight_kg! }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

export function inWindow(series: WeightPoint[], endDate: DayString, days: number): WeightPoint[] {
  const start = addDays(endDate, -(days - 1))
  return series.filter(p => p.date >= start && p.date <= endDate)
}

export interface Avg { kg: number | null; points: number; window_start: DayString; window_end: DayString }

export function average7(series: WeightPoint[], endDate: DayString): Avg {
  const pts = inWindow(series, endDate, 7)
  const kg = pts.length >= MIN_POINTS_FOR_AVG ? round1(pts.reduce((a, p) => a + p.kg, 0) / pts.length) : null
  return { kg, points: pts.length, window_start: addDays(endDate, -6), window_end: endDate }
}

export function previousAverage7(series: WeightPoint[], endDate: DayString): Avg {
  return average7(series, addDays(endDate, -7))
}

export function latestWeight(series: WeightPoint[]): WeightPoint | null {
  return series.length > 0 ? series[series.length - 1]! : null
}

/** Pendiente en kg/semana por mínimos cuadrados. null si no hay base suficiente. */
export function trendPerWeek(series: WeightPoint[]): number | null {
  if (series.length < 4) return null
  const first = series[0]!
  const span = diffDays(first.date, series[series.length - 1]!.date)
  if (span < 7) return null
  const xs = series.map(p => diffDays(first.date, p.date))
  const ys = series.map(p => p.kg)
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0, den = 0
  for (let i = 0; i < n; i++) { num += (xs[i]! - mx) * (ys[i]! - my); den += (xs[i]! - mx) ** 2 }
  if (den === 0) return null
  return Math.round((num / den) * 7 * 100) / 100
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10
}
