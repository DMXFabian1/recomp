/**
 * FIXTURES DE TEST — datos sintéticos, NO historial real de nadie.
 * Ids con prefijo "test_" y fechas en 2001 para que nunca se confundan con registros reales.
 */
import type { Exercise, ExerciseSet, Program, WorkoutSession, WorkoutTemplate, TemplateExercise } from '@domain/entities'
import type { ExerciseHistoryEntry } from '@domain/progression/types'

export const TEST_T0 = '2001-01-01T00:00:00.000Z'
const base = { created_at: TEST_T0, updated_at: TEST_T0, source: 'system' as const }

export function createExerciseFixture(over: Partial<Exercise> = {}): Exercise {
  return {
    ...base, id: 'test_ex_basic', name: 'TEST básico', pattern: 'squat', equipment: 'barbell', increment_kg: 2.5,
    is_basic: true, is_key_lift: false, substitutes: [], ...over,
  }
}

export function createTemplateExerciseFixture(over: Partial<TemplateExercise> = {}): TemplateExercise {
  return { exercise_id: 'test_ex_basic', order: 0, sets: 3, reps_min: 6, reps_max: 10, target_rir: 2, rest_s: 150, in_short: true, in_minimal: true, ...over }
}

export function createTemplateFixture(id: string, name: string, order: number, exercises?: TemplateExercise[]): WorkoutTemplate {
  return {
    ...base, id, name, order_in_rotation: order,
    exercises: exercises ?? [
      createTemplateExerciseFixture({ exercise_id: 'test_ex_1', order: 0, in_short: true, in_minimal: true }),
      createTemplateExerciseFixture({ exercise_id: 'test_ex_2', order: 1, in_short: true, in_minimal: true }),
      createTemplateExerciseFixture({ exercise_id: 'test_ex_3', order: 2, in_short: true, in_minimal: false }),
      createTemplateExerciseFixture({ exercise_id: 'test_ex_4', order: 3, in_short: false, in_minimal: false }),
    ],
  }
}

export const TEST_ROTATION = ['test_tpl_leg_a', 'test_tpl_upper_a', 'test_tpl_leg_b', 'test_tpl_upper_b']

export function createProgramFixture(cursor = 0, over: Partial<Program> = {}): Program {
  return { ...base, id: 'test_program', name: 'TEST programa', rotation: TEST_ROTATION, rotation_cursor: cursor, suggested_weekdays: [1, 2, 4, 5], deload_windows: [], active: true, ...over }
}

let seq = 0
export function createSessionFixture(over: Partial<WorkoutSession> = {}): WorkoutSession {
  seq++
  const date = over.date ?? `2001-02-${String(seq).padStart(2, '0')}`
  return {
    ...base, id: `test_ws_${seq}`, template_id: 'test_tpl_leg_a', date, started_at: `${date}T18:00:00.000Z`,
    status: 'open', version: 'full', sleep_short_suggested: false, ...over,
  }
}

export function createCompletedSessionFixture(over: Partial<WorkoutSession> = {}): WorkoutSession {
  const s = createSessionFixture({ status: 'completed', ...over })
  return { ...s, finished_at: s.finished_at ?? `${s.date}T19:00:00.000Z` }
}

export interface SetSpec { w: number; reps: number; rir?: 0 | 1 | 2 | 3 | 4; pain?: boolean; technique?: boolean; warmup?: boolean }

export function createSetsFixture(session: WorkoutSession, exerciseId: string, specs: SetSpec[], targets = { reps_min: 6, reps_max: 10, target_rir: 2 }): ExerciseSet[] {
  return specs.map((s, i) => ({
    ...base, id: `${session.id}_${exerciseId}_${i + 1}`, session_id: session.id, exercise_id: exerciseId, set_number: i + 1,
    weight_kg: s.w, reps: s.reps, rir: s.rir ?? 2, target_reps_min: targets.reps_min, target_reps_max: targets.reps_max,
    target_rir: targets.target_rir, pain_flag: s.pain ?? false, technique_flag: s.technique ?? false, is_warmup: s.warmup ?? false,
    completed_at: `${session.date}T18:30:00.000Z`,
  }))
}

/**
 * Historial de progresión. `sessionsOldestFirst` se da en orden cronológico (como ocurrió) y se devuelve
 * como ExerciseHistoryEntry[] de la más reciente a la más antigua, que es lo que espera el motor.
 */
export function createProgressionFixture(
  exerciseId: string,
  sessionsOldestFirst: Array<{ sets: SetSpec[]; session?: Partial<WorkoutSession>; targets?: { reps_min: number; reps_max: number; target_rir: number } }>,
): ExerciseHistoryEntry[] {
  const entries = sessionsOldestFirst.map(({ sets, session, targets }) => {
    const ws = createCompletedSessionFixture(session)
    return { session: ws, sets: createSetsFixture(ws, exerciseId, sets, targets) }
  })
  return entries.reverse()
}

/** Reinicia el contador de ids/fechas entre tests para que las fixtures sean deterministas. */
export function resetFixtureSequence(): void {
  seq = 0
}
