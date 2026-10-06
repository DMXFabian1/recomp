/**
 * Contratos del motor de entrenamiento (Fase 8.4). Este módulo no importa domain/catalog
 * (lo verifica el test de arquitectura): la sustitución vive aparte, en domain/substitution.
 */
import type { DayString, Exercise, ExerciseSet, IsoDateTime, Program, TemplateExercise, WorkoutSession, WorkoutTemplate } from '@domain/entities'

/** Historial de un ejercicio: sesiones (cualquier estado) de la MÁS RECIENTE a la más antigua. */
export interface ExerciseHistoryEntry {
  session: WorkoutSession
  /** Series de ESTE ejercicio en esa sesión (puede estar vacío si se sustituyó o no se hizo). */
  sets: ExerciseSet[]
}

export interface ProgressionInput {
  exercise: Exercise
  template_exercise: TemplateExercise
  history: ExerciseHistoryEntry[]
  increment_kg: number
}

export type ProgressionBlockReason =
  | 'rir_zero_on_basic' | 'pain' | 'technique' | 'short_session' | 'minimal_session' | 'substituted' | 'no_history'

export type ProgressionAction = 'increase' | 'hold' | 'decrease_10pct'

/**
 * Clasificación de una sesión del historial respecto a un ejercicio:
 *  - not_evaluable: no completada, sin series de trabajo o datos inválidos → se ignora.
 *  - blocked: completada pero con bloqueo (RIR 0 en básico, dolor, técnica, corta, mínima, sustituida) → se ignora
 *    para progreso Y para bajo rendimiento; nunca cuenta como caída de rendimiento.
 *  - incomparable: relevante pero con objetivos o carga distintos a la sesión relevante más reciente → no suma rachas.
 *  - progressed: alcanzó reps_max con RIR suficiente (o subió de carga respecto a la relevante anterior).
 *  - no_progress: relevante sin progreso (incluye bajo piso).
 */
export type SessionOutcome = 'not_evaluable' | 'blocked' | 'incomparable' | 'progressed' | 'no_progress'

export interface SessionEvaluation {
  session_id: string
  date: DayString
  version: WorkoutSession['version']
  outcome: SessionOutcome
  blocked_by: ProgressionBlockReason[]
  not_evaluable_reason?: 'not_completed' | 'no_working_sets' | 'invalid_data'
  /** Carga de trabajo (máximo weight_kg de las series de trabajo). null si no evaluable. */
  load_kg: number | null
  working_sets: number
  reps: number[]
  rirs: number[]
  /** Todas las series de trabajo con reps ≥ reps_max y RIR ≥ target_rir. */
  reached_max: boolean
  /** Alguna serie de trabajo con reps < reps_min. Solo tiene sentido si outcome ∉ {blocked, not_evaluable}. */
  performance_below_floor: boolean
  targets: { reps_min: number; reps_max: number; target_rir: number }
}

export interface ProgressionDecision {
  exercise_id: string
  action: ProgressionAction
  /** Carga sugerida para la próxima sesión. null si no hay historial evaluable. */
  suggested_weight_kg: number | null
  current_weight_kg: number | null
  /** Bloqueos de la sesión relevante más reciente (vacío si no hay). */
  blocked_by: ProgressionBlockReason[]
  progression_blocked: boolean
  /** Sesiones relevantes consecutivas (desde la más reciente, misma carga) con rendimiento bajo el piso. */
  sessions_under_floor: number
  /** Sesiones relevantes consecutivas sin progreso. */
  sessions_without_progress: number
  /** 3 sesiones relevantes consecutivas sin progreso → solo alerta e informe. */
  stalled: boolean
  evaluations: SessionEvaluation[]
  rationale: string
}

export const DELOAD_FACTOR = 0.9
export const SESSIONS_UNDER_FLOOR_FOR_DELOAD = 2
export const SESSIONS_WITHOUT_PROGRESS_FOR_STALL = 3

export interface SessionCompletionInput {
  program: Program
  session: WorkoutSession
  finished_at: IsoDateTime
  today: DayString
}

/** Resultado de cerrar una sesión: el ÚNICO lugar donde el cursor avanza. Nada se muta: se devuelven copias. */
export interface SessionCompletionResult {
  program: Program
  session: WorkoutSession
  previous_rotation_cursor: number
  next_rotation_cursor: number
  advanced: boolean
  /**
   * advanced: la plantilla del cursor se completó.
   * advanced_out_of_order: se completó OTRA plantilla válida de la rotación; el cursor queda en la siguiente a esa;
   *   la que tocaba se considera perdida (no se recupera, no se inserta, no hay retroactiva). La UI de 8.6 avisa.
   * template_mismatch: la plantilla no pertenece a la rotación (inconsistencia); la sesión se cierra, el cursor no se mueve.
   */
  reason: 'advanced' | 'advanced_out_of_order' | 'already_completed' | 'template_mismatch' | 'not_open'
  /** Plantilla que tocaba y se dio por perdida (solo en advanced_out_of_order). */
  skipped_template_id?: string
}

export type SessionVersionReason = 'sleep_short' | 'time_mode_short' | 'time_mode_minimal' | 'none'

export interface SessionVersionSuggestion {
  version: WorkoutSession['version']
  reason: SessionVersionReason
  template: WorkoutTemplate
  exercises: TemplateExercise[]
  sleep_short_suggested: boolean
}
