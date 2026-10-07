/**
 * Alertas de reglas — Fase 8.9. Puro. SOLO reporte: `context.action_taken = 'none'` siempre.
 *  adherence_low  (A)      adherencia <80 %
 *  adherence_high          adherencia >85 %
 *  weight_flat             |Δ promedio 7 d| ≤0.5 kg con datos suficientes (sin datos ≠ estable)
 *  strength_drop  (C)      ≥2/4 key lifts caen (solo sesiones comparables)
 *  sleep_drop              bucket '<6' en ≥4 días de la ventana
 *  mood                    ánimo ≤2 en ≥4 de los últimos 7 días con dato
 * `stall` no se toca ni se duplica aquí.
 */
import type { Alert } from '@domain/entities'
import type { AdjustmentInputs } from './inputs'
import { THRESHOLDS, type RuleResult } from './rules'

export const SLEEP_UNDER6_DAYS = 4
export const MOOD_LOW_DAYS = 4

export type AlertDraft = Omit<Alert, 'id' | 'created_at' | 'updated_at' | 'source'>

function draft(i: AdjustmentInputs, type: Alert['type'], message: string, extra: Record<string, unknown>): AlertDraft {
  return { type, message, context: { ...extra, period_start: i.window.start, period_end: i.window.end, action_taken: 'none' } }
}

export function buildAdjustmentAlerts(i: AdjustmentInputs, r: { A: RuleResult; C: RuleResult }): AlertDraft[] {
  const out: AlertDraft[] = []
  const adh = i.adherence.pct
  if (r.A.fired) out.push(draft(i, 'adherence_low', `Adherencia ${adh} % (<80 %) en ${i.window.start} → ${i.window.end}. Sin ajuste de calorías.`, { adherence_pct: adh, answered: i.adherence.answered }))
  if (adh !== null && adh > THRESHOLDS.adherence_high_pct) out.push(draft(i, 'adherence_high', `Adherencia ${adh} % (>85 %) en ${i.window.start} → ${i.window.end}.`, { adherence_pct: adh, answered: i.adherence.answered }))
  const dw = i.weight.delta_kg
  if (dw !== null && Math.abs(dw) <= THRESHOLDS.weight_stable_kg) out.push(draft(i, 'weight_flat', `Peso estable: ${dw} kg entre promedios de 7 d (${i.weight.week1_avg} → ${i.weight.week2_avg} kg).`, { delta_kg: dw, week1_avg: i.weight.week1_avg, week2_avg: i.weight.week2_avg }))
  if (r.C.fired) out.push(draft(i, 'strength_drop', `Fuerza a la baja en ${i.strength.falling} de ${i.strength.comparable} key lifts comparables. Sin cambio de carga.`, { falling: i.strength.falling, comparable: i.strength.comparable, lifts: i.strength.lifts.filter(l => l.comparable && l.falls).map(l => l.exercise_id) }))
  if (i.sleep.under6_days >= SLEEP_UNDER6_DAYS) out.push(draft(i, 'sleep_drop', `Sueño <6 h en ${i.sleep.under6_days} días de la ventana.`, { under6_days: i.sleep.under6_days, days_with_data: i.sleep.days_with_data }))
  if (i.recent.mood_low_days >= MOOD_LOW_DAYS) out.push(draft(i, 'mood', `Ánimo ≤2 en ${i.recent.mood_low_days} de los últimos 7 días con dato.`, { mood_low_days: i.recent.mood_low_days, days_with_data: i.recent.days_with_data }))
  return out
}
