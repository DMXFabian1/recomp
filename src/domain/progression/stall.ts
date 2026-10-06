/**
 * Alerta de estancamiento — Fase 8.4. El motor solo detecta y reporta: devuelve el contenido de una Alert
 * 'stall' (sin id ni sellos: eso lo pone la capa app al persistir). No cambia ejercicio, rango, volumen ni programa.
 */
import type { Alert, Exercise } from '@domain/entities'
import type { ProgressionDecision } from './types'

export type StallAlertDraft = Omit<Alert, 'id' | 'created_at' | 'updated_at' | 'source'>

export function buildStallAlert(exercise: Exercise, decision: ProgressionDecision): StallAlertDraft | null {
  if (!decision.stalled) return null
  const considered = decision.evaluations.filter(e => e.outcome === 'no_progress').slice(0, decision.sessions_without_progress)
  return {
    type: 'stall',
    message: `${exercise.name}: ${decision.sessions_without_progress} sesiones sin progreso a ${decision.current_weight_kg} kg.`,
    context: {
      exercise_id: exercise.id,
      exercise_name: exercise.name,
      is_key_lift: exercise.is_key_lift,
      load_kg: decision.current_weight_kg,
      sessions_without_progress: decision.sessions_without_progress,
      sessions_under_floor: decision.sessions_under_floor,
      sessions: considered.map(e => ({ session_id: e.session_id, date: e.date, reps: e.reps, rirs: e.rirs, targets: e.targets })),
      action_taken: 'none', // solo informe; cualquier cambio pasa por una Recommendation aceptada
    },
  }
}
