/**
 * Contratos del motor de entrenamiento (Fase 8.4). SOLO tipos: aquí no hay lógica.
 * Las reglas congeladas (doble progresión, bloqueos, −10 %, estancamiento, versión corta/mínima,
 * avance del cursor, sesión perdida, sustitución) se implementan en 8.4 contra estas interfaces.
 * Este módulo no debe importar domain/catalog (lo verifica el test de arquitectura).
 */
import type { DayString, Exercise, ExerciseSet, Program, TemplateExercise, WorkoutSession, WorkoutTemplate } from '@domain/entities'

/** Historial de un ejercicio: sesiones completadas, de la más reciente a la más antigua. */
export interface ExerciseHistoryEntry {
  session: WorkoutSession
  sets: ExerciseSet[]
}

export interface ProgressionInput {
  exercise: Exercise
  template_exercise: TemplateExercise
  history: ExerciseHistoryEntry[]
  increment_kg: number
}

export type ProgressionBlockReason = 'rir_zero_on_basic' | 'pain' | 'technique' | 'short_session' | 'minimal_session' | 'no_history'

export type ProgressionAction = 'increase' | 'hold' | 'decrease_10pct'

export interface ProgressionDecision {
  action: ProgressionAction
  suggested_weight_kg: number | null
  blocked_by: ProgressionBlockReason[]
  sessions_under_floor: number
  /** 3 sesiones sin progreso → solo alerta e informe; nunca cambia programa, rango ni volumen. */
  stalled: boolean
  rationale: string
}

export interface SessionCompletionInput {
  program: Program
  session: WorkoutSession
  today: DayString
}

/** Resultado de cerrar una sesión: el ÚNICO lugar donde el cursor avanza. */
export interface SessionCompletionResult {
  next_rotation_cursor: number
  advanced: boolean
}

export type SessionVersionReason = 'sleep_short' | 'time_mode' | 'user_choice' | 'full'

export interface SessionVersionSuggestion {
  version: WorkoutSession['version']
  reason: SessionVersionReason
  template: WorkoutTemplate
  exercises: TemplateExercise[]
}
