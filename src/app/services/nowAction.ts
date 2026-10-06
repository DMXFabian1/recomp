/**
 * Acción dominante de AHORA — Fase 8.5. Pura: decide UNA acción a partir del estado ya calculado.
 * Prioridad: check-in pendiente → sesión abierta → estado de ayer sin registrar → sesión sugerida →
 * día ya entrenado / programa no iniciado → sin programa.
 */
import type { DailyCheckIn } from '@domain/entities'
import type { TodayState } from '@domain/rotation/getToday'

export type NowAction =
  | 'check_in' // registrar el check-in matutino
  | 'continue_session' // hay una sesión abierta
  | 'register_yesterday' // check-in guardado sin food_yesterday
  | 'start_session' // toca sesión y no hay abierta
  | 'rest' // hoy ya se completó
  | 'prepare' // programa no iniciado: preparar
  | 'none' // sin programa

export function decideNowAction(checkIn: DailyCheckIn | null, today: TodayState): NowAction {
  if (!checkIn) return 'check_in'
  if (today.kind === 'session_open') return 'continue_session'
  if (checkIn.food_yesterday === undefined) return 'register_yesterday'
  switch (today.kind) {
    case 'suggested': return 'start_session'
    case 'done_today': return 'rest'
    case 'not_started': return 'prepare'
    default: return 'none'
  }
}
