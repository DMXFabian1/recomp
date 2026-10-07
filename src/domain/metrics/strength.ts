/**
 * Fuerza — Fase 8.8. Solo sesiones 'completed' no borradas y series de trabajo válidas (sin calentamientos,
 * reps > 0, datos válidos). Tonelaje = Σ peso × reps. Los key lifts se identifican por su propio exercise_id:
 * una sustitución nunca se mezcla con el original ni se convierte en key lift.
 */
import type { DayString, ExerciseSet, WorkoutSession } from '@domain/entities'
import { isValidSet } from '@domain/progression/evaluate'

export const KEY_LIFT_IDS = ['ex_squat', 'ex_bench', 'ex_deadlift', 'ex_chest_supported_row'] as const

export function completedSessions(sessions: WorkoutSession[]): WorkoutSession[] {
  return sessions.filter(s => !s.deleted_at && s.status === 'completed').sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.started_at < b.started_at ? -1 : 1))
}

export function workingSets(sets: ExerciseSet[]): ExerciseSet[] {
  return sets.filter(s => !s.deleted_at && !s.is_warmup && isValidSet(s) && s.reps > 0)
}

export function sessionTonnage(sets: ExerciseSet[]): number {
  return Math.round(workingSets(sets).reduce((a, s) => a + s.weight_kg * s.reps, 0))
}

export interface SessionTonnage { session_id: string; date: DayString; template_id: string; version: WorkoutSession['version']; tonnage_kg: number; work_sets: number }

export function tonnageHistory(sessions: WorkoutSession[], sets: ExerciseSet[]): SessionTonnage[] {
  const bySession = new Map<string, ExerciseSet[]>()
  for (const s of sets) bySession.set(s.session_id, [...(bySession.get(s.session_id) ?? []), s])
  return completedSessions(sessions).map(s => {
    const ws = workingSets(bySession.get(s.id) ?? [])
    return { session_id: s.id, date: s.date, template_id: s.template_id, version: s.version, tonnage_kg: sessionTonnage(ws), work_sets: ws.length }
  })
}

export interface LiftPoint { date: DayString; session_id: string; load_kg: number; reps: number[]; substituted: boolean }

/** Historial de carga (máximo de series de trabajo) de UN ejercicio por su id real. */
export function liftHistory(exerciseId: string, sessions: WorkoutSession[], sets: ExerciseSet[]): LiftPoint[] {
  const done = completedSessions(sessions)
  const out: LiftPoint[] = []
  for (const s of done) {
    const ws = workingSets(sets.filter(x => x.session_id === s.id && x.exercise_id === exerciseId)).sort((a, b) => a.set_number - b.set_number)
    if (ws.length === 0) continue
    const substituted = (s.substitutions ?? []).some(x => x.substitute_exercise_id === exerciseId || x.original_exercise_id === exerciseId)
    out.push({ date: s.date, session_id: s.id, load_kg: Math.max(...ws.map(x => x.weight_kg)), reps: ws.map(x => x.reps), substituted })
  }
  return out
}

export function keyLiftHistories(sessions: WorkoutSession[], sets: ExerciseSet[]): Record<(typeof KEY_LIFT_IDS)[number], LiftPoint[]> {
  return Object.fromEntries(KEY_LIFT_IDS.map(id => [id, liftHistory(id, sessions, sets)])) as Record<(typeof KEY_LIFT_IDS)[number], LiftPoint[]>
}
