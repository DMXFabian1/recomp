/**
 * Entradas de las reglas — Fase 8.9. Puro. Convierte datos crudos en medidas con semántica "missing ≠ zero".
 * Reutiliza las métricas de 8.8 (average7, waistSeries, keyLiftHistories); no duplica algoritmos.
 *
 *  - Peso: average7 de la semana 2 (end) vs average7 de la semana 1 (end − 7); cada una ≥4 puntos reales; si no → null.
 *  - Adherencia: % de días plan+almost sobre días con check-in respondido (food_yesterday) en la ventana; ≥10/14; si no → null.
 *  - Cintura: última medición de cada semana de la ventana; falta alguna → null.
 *  - Hambre / ánimo: últimos 7 días de la ventana, solo días con dato.
 *  - Sueño: días de la ventana con bucket '<6'.
 *  - Pasos: media de steps_yesterday en días con dato; sin datos → null.
 *  - Fuerza: por key lift, última sesión comparable (no sustituida, series válidas) de la ventana vs la anterior.
 */
import type { BodyMeasurement, DailyCheckIn, DayString, ExerciseSet, WorkoutSession } from '@domain/entities'
import { average7, keyLiftHistories, KEY_LIFT_IDS, waistSeries, weightSeries, type LiftPoint } from '@domain/metrics'
import { addDays } from '@domain/time/day'
import { previousWindow, type EvaluationWindow } from './window'

export const MIN_ADHERENCE_DAYS = 10
export const RECENT_DAYS = 7

export interface WeightInput {
  week1_avg: number | null
  week2_avg: number | null
  week1_points: number
  week2_points: number
  /** % de pérdida por semana (positivo = pérdida). null = sin datos suficientes. */
  loss_pct_week: number | null
  /** Δ absoluto en kg (semana 2 − semana 1). null = sin datos. */
  delta_kg: number | null
}

export interface AdherenceInput { answered: number; plan: number; almost: number; off: number; pct: number | null }
export interface WaistInput { week1_cm: number | null; week2_cm: number | null; delta_cm: number | null }
export interface RecentInput { days_with_data: number; hunger_high_days: number; mood_low_days: number }
export interface SleepInput { days_with_data: number; under6_days: number }
export interface StepsInput { days_with_data: number; avg: number | null }

export type LiftComparison =
  | { exercise_id: string; comparable: false; reason: 'no_current' | 'no_previous' }
  | { exercise_id: string; comparable: true; current: LiftPoint; previous: LiftPoint; falls: boolean }

export interface StrengthInput { lifts: LiftComparison[]; comparable: number; falling: number }

export interface AdjustmentInputs {
  window: EvaluationWindow
  weight: WeightInput
  adherence: AdherenceInput
  waist: WaistInput
  recent: RecentInput
  sleep: SleepInput
  steps: StepsInput
  strength: StrengthInput
}

const live = <T extends { deleted_at?: string }>(xs: T[]) => xs.filter(x => !x.deleted_at)
const within = (d: DayString, w: { start: DayString; end: DayString }) => d >= w.start && d <= w.end
const round2 = (n: number) => Math.round(n * 100) / 100

export function weightInput(checkIns: DailyCheckIn[], w: EvaluationWindow): WeightInput {
  const series = weightSeries(checkIns)
  const w2 = average7(series, w.end)
  const w1 = average7(series, addDays(w.end, -7))
  const ok = w1.kg !== null && w2.kg !== null
  return {
    week1_avg: w1.kg, week2_avg: w2.kg, week1_points: w1.points, week2_points: w2.points,
    loss_pct_week: ok ? round2(((w1.kg! - w2.kg!) / w1.kg!) * 100) : null,
    delta_kg: ok ? round2(w2.kg! - w1.kg!) : null,
  }
}

export function adherenceInput(checkIns: DailyCheckIn[], w: EvaluationWindow): AdherenceInput {
  const rows = live(checkIns).filter(c => within(c.date, w) && c.food_yesterday !== undefined)
  const plan = rows.filter(c => c.food_yesterday === 'plan').length
  const almost = rows.filter(c => c.food_yesterday === 'almost').length
  const off = rows.filter(c => c.food_yesterday === 'off').length
  const answered = rows.length
  return { answered, plan, almost, off, pct: answered >= MIN_ADHERENCE_DAYS ? round2(((plan + almost) / answered) * 100) : null }
}

export function waistInput(measurements: BodyMeasurement[], w: EvaluationWindow): WaistInput {
  const series = waistSeries(measurements)
  const mid = addDays(w.start, 6)
  const last = (from: DayString, to: DayString) => series.filter(p => p.date >= from && p.date <= to).at(-1)?.cm ?? null
  const week1_cm = last(w.start, mid), week2_cm = last(addDays(mid, 1), w.end)
  return { week1_cm, week2_cm, delta_cm: week1_cm !== null && week2_cm !== null ? round2(week2_cm - week1_cm) : null }
}

export function recentInput(checkIns: DailyCheckIn[], w: EvaluationWindow): RecentInput {
  const from = addDays(w.end, -(RECENT_DAYS - 1))
  const rows = live(checkIns).filter(c => c.date >= from && c.date <= w.end)
  const hungerRows = rows.filter(c => typeof c.hunger === 'number')
  const moodRows = rows.filter(c => typeof c.mood === 'number')
  return {
    days_with_data: rows.length,
    hunger_high_days: hungerRows.filter(c => c.hunger! >= 4).length,
    mood_low_days: moodRows.filter(c => c.mood! <= 2).length,
  }
}

export function sleepInput(checkIns: DailyCheckIn[], w: EvaluationWindow): SleepInput {
  const rows = live(checkIns).filter(c => within(c.date, w) && c.sleep_bucket !== undefined)
  return { days_with_data: rows.length, under6_days: rows.filter(c => c.sleep_bucket === '<6').length }
}

export function stepsInput(checkIns: DailyCheckIn[], w: EvaluationWindow): StepsInput {
  const rows = live(checkIns).filter(c => within(c.date, w) && typeof c.steps_yesterday === 'number')
  return { days_with_data: rows.length, avg: rows.length ? Math.round(rows.reduce((a, c) => a + c.steps_yesterday!, 0) / rows.length) : null }
}

/** "Fuerza cae": carga menor, o misma carga con menos reps totales. Solo sesiones comparables (no sustituidas). */
export function strengthInput(sessions: WorkoutSession[], sets: ExerciseSet[], w: EvaluationWindow): StrengthInput {
  const prev = previousWindow(w)
  const histories = keyLiftHistories(sessions, sets)
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
  const lifts: LiftComparison[] = KEY_LIFT_IDS.map(id => {
    const comparable = histories[id].filter(p => !p.substituted)
    const current = comparable.filter(p => within(p.date, w)).at(-1)
    const previous = comparable.filter(p => within(p.date, prev)).at(-1)
    if (!current) return { exercise_id: id, comparable: false, reason: 'no_current' }
    if (!previous) return { exercise_id: id, comparable: false, reason: 'no_previous' }
    const falls = current.load_kg < previous.load_kg || (current.load_kg === previous.load_kg && sum(current.reps) < sum(previous.reps))
    return { exercise_id: id, comparable: true, current, previous, falls }
  })
  return { lifts, comparable: lifts.filter(l => l.comparable).length, falling: lifts.filter(l => l.comparable && l.falls).length }
}

export function buildInputs(data: {
  window: EvaluationWindow; checkIns: DailyCheckIn[]; measurements: BodyMeasurement[]; sessions: WorkoutSession[]; sets: ExerciseSet[]
}): AdjustmentInputs {
  const { window: w, checkIns } = data
  return {
    window: w,
    weight: weightInput(checkIns, w),
    adherence: adherenceInput(checkIns, w),
    waist: waistInput(data.measurements, w),
    recent: recentInput(checkIns, w),
    sleep: sleepInput(checkIns, w),
    steps: stepsInput(checkIns, w),
    strength: strengthInput(data.sessions, data.sets, w),
  }
}
