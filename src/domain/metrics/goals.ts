/**
 * Metas mensuales — Fase 8.8. META vs REAL como datos; sin juicio ni recálculo.
 *  - Peso meta: weight_kg_range si existe; si no, derivado aritméticamente de baseline.weight_avg_kg × (1 + pct/100)
 *    cuando hay baseline; si no, solo el rango en %.
 *  - Peso real: promedio 7 d al último día del mes con datos (o al día de hoy si el mes está en curso); null si no hay base.
 *  - Cintura meta: baseline.waist_cm + delta si hay baseline; real: último registro del mes.
 *  - Sesiones de fuerza y cardio: conteo real del mes.
 */
import type { Baseline, BodyMeasurement, CardioSession, DayString, MonthlyGoal, WorkoutSession } from '@domain/entities'
import { average7, type WeightPoint } from './weight'
import { waistSeries } from './body'
import { completedSessions } from './strength'

export interface GoalVsReal {
  goal: MonthlyGoal
  month: string
  weight_goal_kg: [number, number] | null
  weight_goal_pct: [number, number]
  weight_real_kg: number | null
  weight_real_points: number
  waist_goal_cm: [number, number] | null
  waist_delta_goal_cm: [number, number]
  waist_real_cm: number | null
  waist_real_date: DayString | null
  strength_sessions_real: number
  cardio_sessions_real: number
  steps_target: number
}

export function goalVsReal(input: { goal: MonthlyGoal; baseline: Baseline | null; weight: WeightPoint[]; measurements: BodyMeasurement[]; sessions: WorkoutSession[]; cardio: CardioSession[]; today: DayString }): GoalVsReal {
  const { goal, baseline } = input
  const m = goal.month
  const inMonth = (d: string) => d.startsWith(m)
  const base = baseline?.weight_avg_kg
  const weightGoal: [number, number] | null = goal.weight_kg_range ?? (base ? [Math.round(base * (1 + goal.weight_pct_range[0] / 100) * 10) / 10, Math.round(base * (1 + goal.weight_pct_range[1] / 100) * 10) / 10] : null)
  const monthWeights = input.weight.filter(p => inMonth(p.date))
  const endDate = monthWeights.length > 0 ? monthWeights[monthWeights.length - 1]!.date : (inMonth(input.today) ? input.today : null)
  const avg = endDate ? average7(input.weight, endDate) : null
  const waistGoal: [number, number] | null = baseline?.waist_cm ? [baseline.waist_cm + goal.waist_delta_cm_range[0], baseline.waist_cm + goal.waist_delta_cm_range[1]] : null
  const waistMonth = waistSeries(input.measurements).filter(w => inMonth(w.date))
  const lastWaist = waistMonth[waistMonth.length - 1] ?? null
  return {
    goal, month: m,
    weight_goal_kg: weightGoal, weight_goal_pct: goal.weight_pct_range,
    weight_real_kg: avg?.kg ?? null, weight_real_points: avg?.points ?? 0,
    waist_goal_cm: waistGoal, waist_delta_goal_cm: goal.waist_delta_cm_range,
    waist_real_cm: lastWaist?.cm ?? null, waist_real_date: lastWaist?.date ?? null,
    strength_sessions_real: completedSessions(input.sessions).filter(s => inMonth(s.date)).length,
    cardio_sessions_real: input.cardio.filter(c => !c.deleted_at && inMonth(c.date)).length,
    steps_target: goal.steps_target,
  }
}
