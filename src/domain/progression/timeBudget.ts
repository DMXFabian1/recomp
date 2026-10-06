/**
 * "No tengo tiempo" — Fase 8.5. Regla PURA que orienta a una acción apropiada según el tiempo disponible.
 * No es fallo ni castigo; no elige ejercicios (eso es 8.6): solo propone la versión de sesión o una alternativa.
 *   5 min  → sin sesión: caminar o preparar el día (comida, ropa, bolsa).
 *   15 min → versión mínima (in_minimal).
 *   30 min → versión corta (in_short).
 *   60+    → versión completa.
 * Si hoy no toca sesión (kind ≠ suggested/session_open), cualquier presupuesto orienta a caminar/preparar.
 */
import type { WorkoutSession } from '@domain/entities'

export const TIME_BUDGETS = [5, 15, 30, 60] as const
export type TimeBudget = (typeof TIME_BUDGETS)[number]

export type TimeBudgetAction = 'walk_or_prep' | 'session_minimal' | 'session_short' | 'session_full'

export interface TimeBudgetPlan {
  minutes: TimeBudget
  action: TimeBudgetAction
  session_version: WorkoutSession['version'] | null
  time_mode: 'short' | 'minimal' | null
}

export function planForTimeBudget(minutes: TimeBudget, sessionAvailable: boolean): TimeBudgetPlan {
  if (!sessionAvailable || minutes === 5) return { minutes, action: 'walk_or_prep', session_version: null, time_mode: null }
  if (minutes === 15) return { minutes, action: 'session_minimal', session_version: 'minimal', time_mode: 'minimal' }
  if (minutes === 30) return { minutes, action: 'session_short', session_version: 'short', time_mode: 'short' }
  return { minutes, action: 'session_full', session_version: 'full', time_mode: null }
}
