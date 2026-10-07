/**
 * Progreso — Fase 8.8. Lee repos y delega las agregaciones en domain/metrics. Descriptivo: nada se interpreta,
 * nada se escribe salvo los registros que el usuario captura (cintura, BIA).
 */
import { ulid } from 'ulid'
import type { Baseline, BodyMeasurement, DayString, MonthlyTest, Settings } from '@domain/entities'
import { AppError } from '@domain/errors'
import { validateEntity } from '@domain/validation/entities'
import { addDays } from '@domain/time/day'
import {
  average7, biaRecords, goalVsReal, habitSummary, keyLiftHistories, latestWaist, latestWeight, monthlyTestComparison,
  previousAverage7, tonnageHistory, trendPerWeek, waistSeries, weeklyCardio, weightSeries, inWindow,
  type Avg, type GoalVsReal, type HabitSummary, type LiftPoint, type SessionTonnage, type TestComparison, type WaistPoint,
  type WeekCardio, type WeightPoint, KEY_LIFT_IDS,
} from '@domain/metrics'
import type { Repos, Storage } from '@repo/index'

export type { Avg, GoalVsReal, HabitSummary, LiftPoint, SessionTonnage, TestComparison, WaistPoint, WeekCardio, WeightPoint }
export { KEY_LIFT_IDS }
export type Period = 7 | 30 | 'all'

export interface ProgressView {
  today: DayString
  period: Period
  body: {
    latest: WeightPoint | null
    avg7: Avg
    prev7: Avg
    trend_kg_week: number | null
    series: WeightPoint[] // del periodo
    all_points: number
    waist_latest: WaistPoint | null
    waist_series: WaistPoint[]
    bia: BodyMeasurement[]
  }
  strength: {
    tonnage: SessionTonnage[]
    key_lifts: Array<{ id: string; name: string; history: LiftPoint[] }>
  }
  cardio: { weeks: WeekCardio[]; tests: TestComparison[] }
  habits: HabitSummary
  goals: GoalVsReal[]
  settings: Settings | null
}

async function latestSettings(repos: Repos): Promise<Settings | null> {
  return (await repos.settings.getLive()).sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0] ?? null
}

export async function loadProgress(storage: Storage, today: DayString, period: Period = 30): Promise<ProgressView> {
  const r = storage.repos
  const [settings, checkIns, measurements, sessions, sets, cardio, tests, mealLogs, recipes, foods, goals, baselines, exercises] = await Promise.all([
    latestSettings(r), r.daily_check_ins.getLive(), r.body_measurements.getLive(), r.workout_sessions.getLive(), r.exercise_sets.getLive(),
    r.cardio_sessions.getLive(), r.monthly_tests.getLive(), r.meal_logs.getLive(), r.recipes.getLive(), r.foods.getLive(),
    r.monthly_goals.getLive(), r.baselines.getLive(), r.exercises.getLive(),
  ])
  const days = period === 'all' ? null : period
  const series = weightSeries(checkIns)
  const periodSeries = days ? inWindow(series, today, days) : series
  const since = days ? addDays(today, -(days - 1)) : null
  const inPeriod = (d: string) => since === null || d >= since
  const baseline: Baseline | null = baselines[0] ?? null
  const target = settings?.protein_target_g ?? 180, floor = settings?.protein_floor_g ?? 160
  const lifts = keyLiftHistories(sessions, sets)
  return {
    today, period,
    body: {
      latest: latestWeight(series), avg7: average7(series, today), prev7: previousAverage7(series, today),
      trend_kg_week: trendPerWeek(periodSeries), series: periodSeries, all_points: series.length,
      waist_latest: latestWaist(measurements), waist_series: waistSeries(measurements).filter(w => inPeriod(w.date)),
      bia: biaRecords(measurements),
    },
    strength: {
      tonnage: tonnageHistory(sessions, sets).filter(t => inPeriod(t.date)),
      key_lifts: KEY_LIFT_IDS.map(id => ({ id, name: exercises.find(e => e.id === id)?.name ?? id, history: lifts[id].filter(p => inPeriod(p.date)) })),
    },
    cardio: { weeks: weeklyCardio(cardio, today, days ? Math.max(1, Math.ceil(days / 7)) : 12), tests: monthlyTestComparison(tests) },
    habits: habitSummary({ checkIns, mealLogs, recipes, foods, endDate: today, days: days ?? 30, target_g: target, floor_g: floor }),
    goals: goals.sort((a, b) => (a.month < b.month ? -1 : 1)).map(goal => goalVsReal({ goal, baseline, weight: series, measurements, sessions, cardio, today })),
    settings,
  }
}

// ───────────────────────── Registro de cintura / BIA ─────────────────────────

export async function logWaist(storage: Storage, date: DayString, waist_cm: number, now: string): Promise<BodyMeasurement> {
  return storage.run(['body_measurements'], async repos => {
    const existing = (await repos.body_measurements.whereEquals('date', date)).find(m => m.type === 'waist' && !m.deleted_at)
    const row: BodyMeasurement = { id: existing?.id ?? ulid(), created_at: existing?.created_at ?? now, updated_at: now, source: 'user', date, type: 'waist', waist_cm }
    const v = validateEntity('body_measurements', row)
    if (!v.ok) throw new AppError('validation', v.issues.map(i => `${i.path}: ${i.message}`).join('; '))
    await repos.body_measurements.put(row)
    return row
  })
}

export type BiaInput = Partial<Pick<BodyMeasurement, 'bia_weight_kg' | 'bia_fat_pct' | 'bia_ffm_kg' | 'bia_muscle_kg' | 'bia_visceral' | 'bia_bmr'>>

export async function logBia(storage: Storage, date: DayString, input: BiaInput, now: string): Promise<BodyMeasurement> {
  const clean = Object.fromEntries(Object.entries(input).filter(([, v]) => typeof v === 'number' && Number.isFinite(v)))
  if (Object.keys(clean).length === 0) throw new AppError('validation', 'Captura al menos un valor de la báscula.')
  return storage.run(['body_measurements'], async repos => {
    const existing = (await repos.body_measurements.whereEquals('date', date)).find(m => m.type === 'bia' && !m.deleted_at)
    const row: BodyMeasurement = { id: existing?.id ?? ulid(), created_at: existing?.created_at ?? now, updated_at: now, source: 'user', date, type: 'bia', ...clean }
    const v = validateEntity('body_measurements', row)
    if (!v.ok) throw new AppError('validation', v.issues.map(i => `${i.path}: ${i.message}`).join('; '))
    await repos.body_measurements.put(row)
    return row
  })
}

export type { MonthlyTest }
