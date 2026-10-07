/** Cardio — Fase 8.8. Semanas (lunes a domingo) y comparación descriptiva de pruebas mensuales. */
import type { CardioSession, DayString, MonthlyTest } from '@domain/entities'
import { addDays, weekdayOf } from '@domain/time/day'

/** Lunes de la semana que contiene `day`. */
export function weekStart(day: DayString): DayString {
  const wd = weekdayOf(day) // 0 = domingo
  return addDays(day, -((wd + 6) % 7))
}

export interface WeekCardio { week_start: DayString; week_end: DayString; sessions: number; minutes: number; distance_m: number | null; rpe_avg: number | null }

export function weeklyCardio(sessions: CardioSession[], endDate: DayString, weeks: number): WeekCardio[] {
  const live = sessions.filter(s => !s.deleted_at)
  const out: WeekCardio[] = []
  let start = weekStart(endDate)
  for (let i = 0; i < weeks; i++) {
    const end = addDays(start, 6)
    const inWeek = live.filter(s => s.date >= start && s.date <= end)
    const withDist = inWeek.filter(s => typeof s.distance_m === 'number')
    out.push({
      week_start: start, week_end: end, sessions: inWeek.length,
      minutes: Math.round(inWeek.reduce((a, s) => a + s.duration_s, 0) / 60),
      distance_m: withDist.length > 0 ? withDist.reduce((a, s) => a + s.distance_m!, 0) : null,
      rpe_avg: inWeek.length > 0 ? Math.round((inWeek.reduce((a, s) => a + s.rpe, 0) / inWeek.length) * 10) / 10 : null,
    })
    start = addDays(start, -7)
  }
  return out
}

export interface TestComparison { test: MonthlyTest; distance_delta_m: number | null; split_delta_s: number | null }

/** Más reciente primero; deltas respecto a la prueba anterior (solo aritmética). */
export function monthlyTestComparison(tests: MonthlyTest[]): TestComparison[] {
  const sorted = tests.filter(t => !t.deleted_at).sort((a, b) => (a.month < b.month ? -1 : 1))
  return sorted.map((t, i) => {
    const prev = sorted[i - 1]
    return { test: t, distance_delta_m: prev ? t.distance_m - prev.distance_m : null, split_delta_s: prev ? Math.round((t.split_avg_s - prev.split_avg_s) * 10) / 10 : null }
  }).reverse()
}

export function formatSplit(seconds: number): string {
  const m = Math.floor(seconds / 60), s = seconds - m * 60
  return `${m}:${s.toFixed(1).padStart(4, '0')} /500 m`
}
