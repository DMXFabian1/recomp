/**
 * Ventana de evaluación — Fase 8.9. Puro.
 * Ventanas cerradas de 14 días que parten de `effective_from` de los Settings vigentes: [from + 14k, from + 14k + 13].
 * Solo se evalúa la ÚLTIMA ventana completa (end < today). Si ninguna está completa → `window_incomplete`.
 * El día de hoy nunca forma parte de una ventana cerrada.
 */
import type { DayString } from '@domain/entities'
import { addDays, diffDays } from '@domain/time/day'

export const WINDOW_DAYS = 14

export interface EvaluationWindow { start: DayString; end: DayString; index: number }

export type WindowResult =
  | { kind: 'window_incomplete'; next_end: DayString; days_remaining: number }
  | { kind: 'ready'; window: EvaluationWindow }

export function evaluationWindow(effectiveFrom: DayString, today: DayString): WindowResult {
  const elapsed = diffDays(effectiveFrom, today) // días desde effective_from hasta hoy
  // La ventana k está completa cuando end = from + 14k + 13 < today ⇔ elapsed ≥ 14(k+1)
  const complete = Math.floor(elapsed / WINDOW_DAYS)
  if (complete <= 0) {
    const nextEnd = addDays(effectiveFrom, WINDOW_DAYS - 1)
    return { kind: 'window_incomplete', next_end: nextEnd, days_remaining: Math.max(0, diffDays(today, nextEnd) + 1) }
  }
  const index = complete - 1
  const start = addDays(effectiveFrom, index * WINDOW_DAYS)
  return { kind: 'ready', window: { start, end: addDays(start, WINDOW_DAYS - 1), index } }
}

/** Ventana inmediatamente anterior (para comparar fuerza). Puede caer antes de effective_from: solo se usa para leer. */
export function previousWindow(w: EvaluationWindow): EvaluationWindow {
  return { start: addDays(w.start, -WINDOW_DAYS), end: addDays(w.start, -1), index: w.index - 1 }
}
