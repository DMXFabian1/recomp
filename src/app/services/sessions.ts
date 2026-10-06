/**
 * Sesiones — Fase 8.5 (integración mínima para 8.6). Iniciar una sesión crea el WorkoutSession 'open' con la
 * versión resuelta por el usuario. Solo puede haber una abierta. NO toca rotation_cursor (eso ocurre al
 * completar, en 8.6 vía domain/progression/completeSession). "No tengo tiempo" registra un AppEvent 'no_time'.
 */
import { ulid } from 'ulid'
import type { DayString, WorkoutSession, WorkoutTemplate } from '@domain/entities'
import { AppError } from '@domain/errors'
import { resolveSessionVersion, suggestSessionVersion, type SessionVersionInput } from '@domain/progression/sessionVersion'
import type { SessionVersionSuggestion } from '@domain/progression/types'
import { planForTimeBudget, TIME_BUDGETS, type TimeBudget, type TimeBudgetPlan } from '@domain/progression/timeBudget'

export { TIME_BUDGETS }
export type { TimeBudget, TimeBudgetPlan, SessionVersionSuggestion, SessionVersionInput }
import type { Storage } from '@repo/index'

export function suggestVersion(input: SessionVersionInput): SessionVersionSuggestion {
  return suggestSessionVersion(input)
}

export interface StartSessionInput {
  template: WorkoutTemplate
  date: DayString
  suggestion: SessionVersionSuggestion
  userChoice: WorkoutSession['version'] | null
  time_mode?: 'short' | 'minimal' | null
}

export async function getOpenSession(storage: Storage): Promise<WorkoutSession | null> {
  const open = await storage.repos.workout_sessions.whereEquals('status', 'open')
  return open.filter(s => !s.deleted_at).sort((a, b) => (a.started_at < b.started_at ? 1 : -1))[0] ?? null
}

export async function startSession(storage: Storage, input: StartSessionInput, now: string): Promise<WorkoutSession> {
  return storage.run(['workout_sessions'], async repos => {
    const open = (await repos.workout_sessions.whereEquals('status', 'open')).filter(s => !s.deleted_at)
    if (open.length > 0) throw new AppError('conflict', 'Ya hay una sesión abierta. Continúala o abandónala antes de iniciar otra.')
    const resolved = resolveSessionVersion(input.suggestion, input.userChoice)
    const row: WorkoutSession = {
      id: ulid(), created_at: now, updated_at: now, source: 'user',
      template_id: input.template.id, date: input.date, started_at: now, status: 'open',
      version: resolved.version, sleep_short_suggested: resolved.sleep_short_suggested,
    }
    await repos.workout_sessions.put(row)
    return row
  })
}

export async function recordNoTime(storage: Storage, minutes: TimeBudget, sessionAvailable: boolean, now: string): Promise<TimeBudgetPlan> {
  const plan = planForTimeBudget(minutes, sessionAvailable)
  await storage.run(['app_events'], repos =>
    repos.app_events.put({ id: ulid(), created_at: now, updated_at: now, source: 'user', ts: now, type: 'no_time', payload: { minutes, action: plan.action } }))
  return plan
}
