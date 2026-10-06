/**
 * Entrenamiento — Fase 8.6. Coordina repos + dominio; no contiene reglas:
 *   evaluateSession / decideProgression (autoridad de evaluación y progresión),
 *   completeSession (ÚNICO escritor de rotation_cursor), abandonSession / cancelSession,
 *   substituteOptions / recordSubstitution (única integración con catálogo), buildStallAlert.
 * Todas las escrituras van en transacciones (storage.run).
 */
import { ulid } from 'ulid'
import type {
  Alert, DayString, EquipmentProfile, Exercise, ExerciseSet, Program, SessionSubstitution, Settings, TemplateExercise,
  WorkoutSession, WorkoutTemplate,
} from '@domain/entities'
import { AppError } from '@domain/errors'
import { validateEntity } from '@domain/validation/entities'
import { decideProgression } from '@domain/progression/decide'
import { completeSession, abandonSession, cancelSession } from '@domain/progression/completeSession'
import { exercisesForVersion } from '@domain/progression/sessionVersion'
import { buildStallAlert } from '@domain/progression/stall'
import type { ExerciseHistoryEntry, ProgressionDecision, SessionCompletionResult, SessionEvaluation } from '@domain/progression/types'
import { substituteOptions, recordSubstitution, type SubstituteOption } from '@domain/substitution/substitute'
import type { Repos, Storage } from '@repo/index'

export type { ProgressionDecision, SessionCompletionResult, SessionEvaluation, SubstituteOption }

// ───────────────────────── Lectura ─────────────────────────

export interface ExerciseView {
  /** Ejercicio de la plantilla (original). */
  template_exercise: TemplateExercise
  original: Exercise
  /** Ejercicio que realmente se hace (sustituto si lo hay). */
  performed: Exercise
  substitution: SessionSubstitution | null
  sets: ExerciseSet[]
  work_sets_done: number
  /** Decisión del motor sobre el historial PREVIO (sesiones anteriores) del ejercicio original. */
  decision: ProgressionDecision
  /** Última sesión relevante evaluada (para "última vez"). */
  last: SessionEvaluation | null
}

export interface SessionView {
  session: WorkoutSession
  template: WorkoutTemplate
  exercises: ExerciseView[]
  total_work_sets: number
}

async function latestSettings(repos: Repos): Promise<Settings | null> {
  return (await repos.settings.getLive()).sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0] ?? null
}

export function activeProfile(settings: Settings | null): EquipmentProfile {
  const profiles = settings?.equipment_profiles ?? {}
  const key = settings?.active_equipment_profile
  return (key ? profiles[key] : undefined) ?? { name: 'sin perfil', items: ['bodyweight'] }
}

/** Historial de un ejercicio (todas las sesiones no borradas, de la más reciente a la más antigua) con sus series. */
export async function exerciseHistory(repos: Repos, exerciseId: string, excludeSessionId?: string): Promise<ExerciseHistoryEntry[]> {
  const sets = (await repos.exercise_sets.whereEquals('exercise_id', exerciseId)).filter(s => !s.deleted_at)
  const sessions = (await repos.workout_sessions.getLive()).filter(s => s.id !== excludeSessionId)
  const bySession = new Map<string, ExerciseSet[]>()
  for (const s of sets) bySession.set(s.session_id, [...(bySession.get(s.session_id) ?? []), s])
  const relevant = sessions.filter(s => bySession.has(s.id) || (s.substitutions ?? []).some(x => x.original_exercise_id === exerciseId || x.substitute_exercise_id === exerciseId))
  relevant.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.started_at < b.started_at ? 1 : -1))
  return relevant.map(session => ({ session, sets: bySession.get(session.id) ?? [] }))
}

export async function loadSessionView(storage: Storage, sessionId: string): Promise<SessionView> {
  const r = storage.repos
  const session = await r.workout_sessions.get(sessionId)
  if (!session || session.deleted_at) throw new AppError('not_found', 'La sesión no existe.')
  const template = await r.workout_templates.get(session.template_id)
  if (!template) throw new AppError('not_found', 'La plantilla de la sesión no existe.')
  const allSets = (await r.exercise_sets.whereEquals('session_id', session.id)).filter(s => !s.deleted_at)
  const exercises: ExerciseView[] = []
  for (const te of exercisesForVersion(template, session.version)) {
    const original = await r.exercises.get(te.exercise_id)
    if (!original) throw new AppError('not_found', `Ejercicio ${te.exercise_id} no existe.`)
    const sub = (session.substitutions ?? []).find(s => s.original_exercise_id === te.exercise_id) ?? null
    const performed = sub ? (await r.exercises.get(sub.substitute_exercise_id)) ?? original : original
    const history = await exerciseHistory(r, original.id, session.id)
    const decision = decideProgression({ exercise: original, template_exercise: te, history, increment_kg: original.increment_kg })
    const last = decision.evaluations.find(e => e.outcome !== 'not_evaluable') ?? null
    const sets = allSets.filter(s => s.exercise_id === performed.id).sort((a, b) => a.set_number - b.set_number)
    exercises.push({ template_exercise: te, original, performed, substitution: sub, sets, work_sets_done: sets.filter(s => !s.is_warmup).length, decision, last })
  }
  return { session, template, exercises, total_work_sets: exercises.reduce((n, e) => n + e.template_exercise.sets, 0) }
}

// ───────────────────────── Series ─────────────────────────

export interface SetInput {
  session_id: string
  /** Ejercicio realmente ejecutado (sustituto si lo hay). */
  exercise_id: string
  weight_kg: number
  /** 0 = serie no realizada: se guarda pero el motor la excluye. */
  reps: number
  rir: 0 | 1 | 2 | 3 | 4
  is_warmup: boolean
  pain_flag?: boolean
  technique_flag?: boolean
}

function targetsFor(template: WorkoutTemplate, session: WorkoutSession, exerciseId: string): TemplateExercise {
  const sub = (session.substitutions ?? []).find(s => s.substitute_exercise_id === exerciseId)
  const originalId = sub ? sub.original_exercise_id : exerciseId
  const te = template.exercises.find(e => e.exercise_id === originalId)
  if (!te) throw new AppError('not_allowed', 'El ejercicio no pertenece a esta sesión.')
  return te
}

function assertOpen(session: WorkoutSession | undefined): WorkoutSession {
  if (!session || session.deleted_at) throw new AppError('not_found', 'La sesión no existe.')
  if (session.status !== 'open') throw new AppError('not_allowed', 'La sesión ya está cerrada.')
  return session
}

export async function logSet(storage: Storage, input: SetInput, now: string): Promise<ExerciseSet> {
  return storage.run(['workout_sessions', 'workout_templates', 'exercise_sets'], async repos => {
    const session = assertOpen(await repos.workout_sessions.get(input.session_id))
    const template = await repos.workout_templates.get(session.template_id)
    if (!template) throw new AppError('not_found', 'Plantilla no encontrada.')
    const te = targetsFor(template, session, input.exercise_id)
    const existing = (await repos.exercise_sets.whereEquals('session_id', session.id)).filter(s => s.exercise_id === input.exercise_id && !s.deleted_at)
    const row: ExerciseSet = {
      id: ulid(), created_at: now, updated_at: now, source: 'user',
      session_id: session.id, exercise_id: input.exercise_id, set_number: existing.length + 1,
      weight_kg: input.weight_kg, reps: input.reps, rir: input.rir,
      target_reps_min: te.reps_min, target_reps_max: te.reps_max, target_rir: te.target_rir,
      pain_flag: input.pain_flag ?? false, technique_flag: input.technique_flag ?? false, is_warmup: input.is_warmup,
      completed_at: now,
    }
    const v = validateEntity('exercise_sets', row)
    if (!v.ok) throw new AppError('validation', `Serie inválida: ${v.issues.map(i => `${i.path}: ${i.message}`).join('; ')}`)
    await repos.exercise_sets.put(row)
    return row
  })
}

export async function updateSet(storage: Storage, setId: string, patch: Partial<Pick<ExerciseSet, 'weight_kg' | 'reps' | 'rir' | 'is_warmup' | 'pain_flag' | 'technique_flag'>>, now: string): Promise<ExerciseSet> {
  return storage.run(['workout_sessions', 'exercise_sets'], async repos => {
    const cur = await repos.exercise_sets.get(setId)
    if (!cur || cur.deleted_at) throw new AppError('not_found', 'La serie no existe.')
    assertOpen(await repos.workout_sessions.get(cur.session_id))
    const row: ExerciseSet = { ...cur, ...patch, updated_at: now }
    const v = validateEntity('exercise_sets', row)
    if (!v.ok) throw new AppError('validation', `Serie inválida: ${v.issues.map(i => `${i.path}: ${i.message}`).join('; ')}`)
    await repos.exercise_sets.put(row)
    return row
  })
}

export async function removeSet(storage: Storage, setId: string, now: string): Promise<void> {
  return storage.run(['workout_sessions', 'exercise_sets'], async repos => {
    const cur = await repos.exercise_sets.get(setId)
    if (!cur || cur.deleted_at) return
    assertOpen(await repos.workout_sessions.get(cur.session_id))
    await repos.exercise_sets.softDelete(setId, now)
  })
}

// ───────────────────────── Sustitución ─────────────────────────

export async function substitutionOptionsFor(storage: Storage, exerciseId: string): Promise<SubstituteOption[]> {
  const r = storage.repos
  const exercise = await r.exercises.get(exerciseId)
  if (!exercise) return []
  const [groups, exercises, settings] = await Promise.all([r.exercise_substitution_groups.getLive(), r.exercises.getLive(), latestSettings(r)])
  return substituteOptions({ exercise, groups, profile: activeProfile(settings), exercises })
}

export async function substituteInSession(storage: Storage, sessionId: string, sub: SessionSubstitution, now: string): Promise<WorkoutSession> {
  return storage.run(['workout_sessions', 'workout_templates', 'exercises', 'exercise_sets'], async repos => {
    const session = assertOpen(await repos.workout_sessions.get(sessionId))
    const template = await repos.workout_templates.get(session.template_id)
    if (!template || !template.exercises.some(e => e.exercise_id === sub.original_exercise_id)) throw new AppError('not_allowed', 'El ejercicio original no está en la sesión.')
    if (!(await repos.exercises.get(sub.substitute_exercise_id))) throw new AppError('not_found', 'El sustituto no existe.')
    const updated = recordSubstitution(session, sub, now)
    await repos.workout_sessions.put(updated)
    return updated
  })
}

// ───────────────────────── Cierre ─────────────────────────

export interface FinishResult {
  completion: SessionCompletionResult
  /** Decisión por ejercicio de la plantilla INCLUYENDO la sesión recién completada. */
  decisions: Array<{ exercise: Exercise; decision: ProgressionDecision; today: SessionEvaluation | null }>
  stall_alerts_created: number
  completed_template_name: string
  skipped_template_name: string | null
  next_template_name: string | null
}

export async function finishSession(storage: Storage, sessionId: string, now: string, today: DayString): Promise<FinishResult> {
  return storage.run(['workout_sessions', 'workout_templates', 'programs', 'exercises', 'exercise_sets', 'alerts'], async repos => {
    const session = await repos.workout_sessions.get(sessionId)
    if (!session || session.deleted_at) throw new AppError('not_found', 'La sesión no existe.')
    const program = (await repos.programs.getLive()).find(p => p.active)
    if (!program) throw new AppError('not_found', 'No hay programa activo.')
    const template = await repos.workout_templates.get(session.template_id)
    if (!template) throw new AppError('not_found', 'Plantilla no encontrada.')

    const completion = completeSession({ program, session, finished_at: now, today })
    if (completion.session !== session) await repos.workout_sessions.put(completion.session)
    if (completion.advanced) await repos.programs.put(completion.program)

    const decisions: FinishResult['decisions'] = []
    let created = 0
    const openStalls = (await repos.alerts.whereEquals('type', 'stall')).filter(a => !a.acknowledged_at && !a.deleted_at)
    for (const te of exercisesForVersion(template, session.version)) {
      const exercise = await repos.exercises.get(te.exercise_id)
      if (!exercise) continue
      const history = await exerciseHistory(repos, exercise.id)
      const decision = decideProgression({ exercise, template_exercise: te, history, increment_kg: exercise.increment_kg })
      const todayEval = decision.evaluations.find(e => e.session_id === session.id) ?? null
      decisions.push({ exercise, decision, today: todayEval })
      const draft = buildStallAlert(exercise, decision)
      if (draft && completion.advanced && !openStalls.some(a => a.context.exercise_id === exercise.id)) {
        const alert: Alert = { id: ulid(), created_at: now, updated_at: now, source: 'system', ...draft }
        await repos.alerts.put(alert)
        created++
      }
    }
    // Nombres para la advertencia (lectura Dexie única; sin awaits "vacíos" que cerrarían la transacción).
    const templates = await repos.workout_templates.getLive()
    const nameOf = (id: string | undefined) => (id ? templates.find(t => t.id === id)?.name ?? id : null)
    return {
      completion, decisions, stall_alerts_created: created,
      completed_template_name: template.name,
      skipped_template_name: nameOf(completion.skipped_template_id),
      next_template_name: completion.advanced ? nameOf(completion.program.rotation[completion.next_rotation_cursor]) : null,
    }
  })
}

export async function abandonOpenSession(storage: Storage, sessionId: string, now: string): Promise<WorkoutSession> {
  return storage.run(['workout_sessions', 'programs'], async repos => {
    const session = assertOpen(await repos.workout_sessions.get(sessionId))
    const program = (await repos.programs.getLive()).find(p => p.active) ?? ({} as Program)
    const r = abandonSession(program, session, now)
    await repos.workout_sessions.put(r.session) // el programa vuelve intacto: no se escribe
    return r.session
  })
}

/** Cancelar: nada se hizo. La sesión queda abandonada y borrada lógicamente; sus series (si las hubiera) se conservan. */
export async function cancelOpenSession(storage: Storage, sessionId: string, now: string): Promise<WorkoutSession> {
  return storage.run(['workout_sessions', 'programs'], async repos => {
    const session = assertOpen(await repos.workout_sessions.get(sessionId))
    const program = (await repos.programs.getLive()).find(p => p.active) ?? ({} as Program)
    const r = cancelSession(program, session, now)
    await repos.workout_sessions.put(r.session)
    return r.session
  })
}
