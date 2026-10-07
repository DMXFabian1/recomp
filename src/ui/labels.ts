import type { WorkoutSession } from '@domain/entities'
export const VERSION_LABEL: Record<WorkoutSession['version'], string> = { full: 'Completa', short: 'Corta', minimal: 'Mínima' }
export function blockLabel(b: string): string {
  return ({ rir_zero_on_basic: 'RIR 0 en básico', pain: 'dolor', technique: 'técnica', short_session: 'sesión corta', minimal_session: 'sesión mínima', substituted: 'sustitución', no_history: 'sin historial' } as Record<string, string>)[b] ?? b
}

/** 8.9 — etiquetas de reglas y métricas de ajuste (UI). */
export const RULE_LABEL: Record<string, string> = {
  adherence_low: 'adherencia baja (<80 %) — sin ajuste',
  weight_loss_too_fast: 'pérdida demasiado rápida',
  strength_drop: 'fuerza a la baja — solo aviso',
  hunger_sustained: 'hambre sostenida',
  weight_waist_stable: 'peso y cintura estables',
  weight_loss_adequate: 'pérdida adecuada — mantener',
}
export const METRIC_LABEL: Record<string, string> = {
  weight_loss_pct_week: 'Pérdida %/sem',
  weight_avg7_week1_kg: 'Promedio 7 d sem 1',
  weight_avg7_week2_kg: 'Promedio 7 d sem 2',
  adherence_pct: 'Adherencia',
  checkins_answered: 'Check-ins',
  hunger_ge4_days_last7: 'Días hambre ≥4 (7 d)',
  weight_delta_kg: 'Δ peso kg',
  waist_delta_cm: 'Δ cintura cm',
  steps_avg: 'Pasos promedio',
  key_lifts_falling: 'Key lifts a la baja',
  key_lifts_comparable: 'Key lifts comparables',
}
