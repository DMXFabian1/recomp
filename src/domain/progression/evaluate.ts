/**
 * Evaluación de UNA sesión del historial para UN ejercicio (Fase 8.4). Pura y determinista.
 *
 * Decisiones documentadas:
 *  - Solo sesiones 'completed' son evaluables; abandonadas/abiertas → not_evaluable.
 *  - Series de calentamiento (is_warmup) no cuentan. Sin series de trabajo → not_evaluable.
 *  - Carga de la sesión = máximo weight_kg de las series de trabajo.
 *  - Objetivos: los que la serie guardó al ejecutarse (target_reps_*, target_rir), no los de la plantilla actual;
 *    así el historial no se reinterpreta si la plantilla cambia. Si las series discrepan entre sí → invalid_data.
 *  - BLOQUEO (no evidencia en ningún sentido): RIR 0 en is_basic, pain_flag, technique_flag, sesión short,
 *    sesión minimal, ejercicio sustituido en esa sesión (como original o como sustituto).
 *    Las sesiones short/minimal cuentan como adherencia y ejecución, pero NO como evidencia para subir carga
 *    NI como evidencia de bajo rendimiento.
 *  - reached_max y performance_below_floor se calculan siempre, pero solo se usan si la sesión no está bloqueada.
 */
import type { Exercise, ExerciseSet, WorkoutSession } from '@domain/entities'
import type { ExerciseHistoryEntry, ProgressionBlockReason, SessionEvaluation } from './types'

function isSubstitutedIn(session: WorkoutSession, exerciseId: string): boolean {
  return (session.substitutions ?? []).some(s => s.original_exercise_id === exerciseId || s.substitute_exercise_id === exerciseId)
}

function validSet(s: ExerciseSet): boolean {
  return Number.isFinite(s.weight_kg) && s.weight_kg >= 0 && Number.isInteger(s.reps) && s.reps >= 0
    && Number.isInteger(s.target_reps_min) && Number.isInteger(s.target_reps_max) && s.target_reps_min > 0
    && s.target_reps_min <= s.target_reps_max && s.rir >= 0 && s.rir <= 4
}

export function evaluateSession(exercise: Exercise, entry: ExerciseHistoryEntry): SessionEvaluation {
  const { session } = entry
  const base: SessionEvaluation = {
    session_id: session.id, date: session.date, version: session.version, outcome: 'not_evaluable', blocked_by: [],
    load_kg: null, working_sets: 0, reps: [], rirs: [], reached_max: false, performance_below_floor: false,
    targets: { reps_min: 0, reps_max: 0, target_rir: 0 },
  }
  if (session.status !== 'completed') return { ...base, not_evaluable_reason: 'not_completed' }

  const blocked: ProgressionBlockReason[] = []
  if (session.version === 'short') blocked.push('short_session')
  if (session.version === 'minimal') blocked.push('minimal_session')
  if (isSubstitutedIn(session, exercise.id)) blocked.push('substituted')

  const working = entry.sets.filter(s => !s.is_warmup && !s.deleted_at && s.exercise_id === exercise.id)
    .sort((a, b) => a.set_number - b.set_number)
  if (working.length === 0) {
    // Sustituido sin series propias: bloqueado (hay sesión) pero sin datos de rendimiento.
    if (blocked.length > 0) return { ...base, outcome: 'blocked', blocked_by: blocked }
    return { ...base, not_evaluable_reason: 'no_working_sets' }
  }
  if (!working.every(validSet)) return { ...base, not_evaluable_reason: 'invalid_data' }
  const first = working[0]!
  const targets = { reps_min: first.target_reps_min, reps_max: first.target_reps_max, target_rir: first.target_rir }
  if (!working.every(s => s.target_reps_min === targets.reps_min && s.target_reps_max === targets.reps_max && s.target_rir === targets.target_rir)) {
    return { ...base, not_evaluable_reason: 'invalid_data' }
  }

  if (exercise.is_basic && working.some(s => s.rir === 0)) blocked.push('rir_zero_on_basic')
  if (working.some(s => s.pain_flag)) blocked.push('pain')
  if (working.some(s => s.technique_flag)) blocked.push('technique')

  const load = Math.max(...working.map(s => s.weight_kg))
  const reps = working.map(s => s.reps)
  const rirs = working.map(s => s.rir)
  const reachedMax = working.every(s => s.reps >= targets.reps_max && s.rir >= targets.target_rir)
  const belowFloor = working.some(s => s.reps < targets.reps_min)

  return {
    ...base,
    outcome: blocked.length > 0 ? 'blocked' : 'no_progress', // 'progressed'/'incomparable' los fija decideProgression con contexto
    blocked_by: blocked,
    load_kg: load, working_sets: working.length, reps, rirs,
    reached_max: reachedMax, performance_below_floor: belowFloor, targets,
  }
}
